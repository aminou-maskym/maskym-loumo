"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp as FirestoreTimestamp
} from 'firebase/firestore';
import {
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  useTheme,
} from '@mui/material';
import { ReceiptLong as ReceiptIcon, Close as CloseIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import InvoiceGenerator from '@/components/InvoiceGenerator';

interface RecentSaleItemFromDb {
  id: string;
  timestamp: FirestoreTimestamp;
  grandTotal: number;
  clientNomSnapshot: string;
  paymentStatus: string;
}

interface RecentSalesCacheListProps {
  boutiqueId: string;
  userId?: string;
  pageContainerRef: React.RefObject<HTMLDivElement>;
  isPageFullscreen: boolean;
}

const ITEMS_PER_PAGE = 5;

export default function RecentSalesCacheList({
  boutiqueId,
  pageContainerRef,
  isPageFullscreen
}: RecentSalesCacheListProps) {
  const [pageItems, setPageItems] = useState<RecentSaleItemFromDb[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);

  // Cache des pages chargées pour éviter re-lectures (clé = numéro de page)
  const pagesCache = useRef<Record<number, RecentSaleItemFromDb[]>>({});
  // lastDocRef[page] contient le dernier doc snapshot de la page (utile pour récupérer la page suivante)
  const lastDocRef = useRef<Record<number, QueryDocumentSnapshot<DocumentData> | null>>({});
  // indique si on a atteint la dernière page (pas assez d'items récupérés)
  const lastPageReached = useRef<Record<number, boolean>>({});

  const [openTicketDialog, setOpenTicketDialog] = useState(false);
  const [selectedSaleIdForTicket, setSelectedSaleIdForTicket] = useState<string | null>(null);

  const theme = useTheme();

  const buildSalesQuery = (startAfterDoc?: QueryDocumentSnapshot<DocumentData> | null) => {
    const base = [collection(db, "boutiques", boutiqueId, "sales"), orderBy("timestamp", "desc"), limit(ITEMS_PER_PAGE)];
    // we'll build with startAfter if provided
    if (startAfterDoc) {
      return query(...(base as any), startAfter(startAfterDoc));
    }
    return query(...(base as any));
  };

  const fetchPage = useCallback(async (pageToFetch: number) => {
    if (!boutiqueId) {
      setError("ID de boutique manquant pour charger les ventes récentes.");
      setPageItems([]);
      setLoading(false);
      return;
    }

    // si la page est déjà en cache, l'utiliser directement
    if (pagesCache.current[pageToFetch]) {
      setPageItems(pagesCache.current[pageToFetch]);
      setLoading(false);
      setError(null);
      setPage(pageToFetch);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Si on demande la page 1 : pas de startAfter
      // Pour page > 1, on doit avoir lastDocRef.current[pageToFetch - 1]
      let startDoc: QueryDocumentSnapshot<DocumentData> | null | undefined = undefined;
      if (pageToFetch > 1) {
        startDoc = lastDocRef.current[pageToFetch - 1];
        // si le startDoc n'existe pas dans notre cache, on doit d'abord charger pages précédentes séquentiellement
        if (!startDoc) {
          // charger séquentiellement les pages manquantes jusqu'à la pageToFetch - 1
          // (cela évite de faire une requête 'count' ou de deviner un offset)
          for (let p = 1; p < pageToFetch; p++) {
            if (pagesCache.current[p]) {
              // ok déjà en cache, on avance
              continue;
            }
            // construire query pour la page p (startAfter le lastDoc du p-1 si existant)
            const prevStart = (p === 1) ? undefined : lastDocRef.current[p - 1];
            const q = buildSalesQuery(prevStart ?? null);
            // prefer cache
            let snap = null as any;
            try { snap = await getDocs(q, { source: "cache" as any }); } catch (cacheErr) { snap = null; }
            if ((!snap || snap.empty) && p === 1) {
              // essayer serveur si cache vide pour la première page
              try { snap = await getDocs(q, { source: "server" as any }); } catch (srvErr) { snap = snap ?? await getDocs(q); }
            } else if (!snap) {
              snap = await getDocs(q);
            }
            const items: RecentSaleItemFromDb[] = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
              const data = d.data();
              return {
                id: d.id,
                timestamp: data.timestamp as FirestoreTimestamp,
                grandTotal: data.grandTotal || 0,
                clientNomSnapshot: data.clientNomSnapshot || "Client de passage",
                paymentStatus: data.paymentStatus || "N/A"
              } as RecentSaleItemFromDb;
            });
            pagesCache.current[p] = items;
            lastDocRef.current[p] = snap.docs[snap.docs.length - 1] ?? null;
            lastPageReached.current[p] = (snap.docs.length < ITEMS_PER_PAGE);
          }
          // after loading previous pages, set startDoc for target page
          startDoc = lastDocRef.current[pageToFetch - 1];
        }
      }

      // maintenant on peut construire la requête pour pageToFetch
      const qForPage = buildSalesQuery(startDoc ?? null);

      // prefer cache read
      let snap = null as any;
      try { snap = await getDocs(qForPage, { source: "cache" as any }); } catch (cacheErr) { snap = null; }
      // if cache returned nothing for page 1, fallback to server
      if ((!snap || snap.empty) && pageToFetch === 1) {
        try { snap = await getDocs(qForPage, { source: "server" as any }); } catch (srvErr) { snap = snap ?? await getDocs(qForPage); }
      } else if (!snap) {
        // fallback generic
        snap = await getDocs(qForPage);
      }

      if (!snap || snap.empty) {
        // page vide
        pagesCache.current[pageToFetch] = [];
        lastDocRef.current[pageToFetch] = null;
        lastPageReached.current[pageToFetch] = true;
        setPageItems([]);
        setError(pageToFetch === 1 ? "Aucune vente récente trouvée dans le cache." : null);
        setPage(pageToFetch);
        setLoading(false);
        return;
      }

      const items: RecentSaleItemFromDb[] = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
        const data = d.data();
        return {
          id: d.id,
          timestamp: data.timestamp as FirestoreTimestamp,
          grandTotal: data.grandTotal || 0,
          clientNomSnapshot: data.clientNomSnapshot || "Client de passage",
          paymentStatus: data.paymentStatus || "N/A"
        } as RecentSaleItemFromDb;
      });

      pagesCache.current[pageToFetch] = items;
      lastDocRef.current[pageToFetch] = snap.docs[snap.docs.length - 1] ?? null;
      lastPageReached.current[pageToFetch] = (snap.docs.length < ITEMS_PER_PAGE);

      setPageItems(items);
      setPage(pageToFetch);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching sales page:", err);
      setError(`Erreur chargement ventes: ${err?.message || 'Erreur inconnue'}`);
      setPageItems([]);
    } finally {
      setLoading(false);
    }
  }, [boutiqueId]);

  useEffect(() => {
    // reset caches when boutique changes
    pagesCache.current = {};
    lastDocRef.current = {};
    lastPageReached.current = {};
    setPage(1);
    if (boutiqueId) fetchPage(1);
    else {
      setPageItems([]);
      setLoading(false);
      setError(null);
    }
  }, [boutiqueId, fetchPage]);

  const handleRefresh = async () => {
    // vider le cache local (pagesCache) et recharger page 1 (favoriser cache puis serveur)
    pagesCache.current = {};
    lastDocRef.current = {};
    lastPageReached.current = {};
    await fetchPage(1);
  };

  const handleNext = async () => {
    // si page courante est marquée comme dernière, ne rien faire
    if (lastPageReached.current[page]) return;
    await fetchPage(page + 1);
  };

  const handlePrev = async () => {
    if (page <= 1) return;
    // la page précédente est soit en cache soit on l'a déjà chargé séquentiellement
    if (pagesCache.current[page - 1]) {
      setPageItems(pagesCache.current[page - 1]);
      setPage(page - 1);
      setError(null);
      return;
    }
    // fallback: fetch previous page (this should usually be in cache)
    await fetchPage(page - 1);
  };

  const handleOpenTicket = (saleId: string) => {
    if (saleId) {
      setSelectedSaleIdForTicket(saleId);
      setOpenTicketDialog(true);
    } else {
      setError("ID de vente manquant pour générer le ticket.");
    }
  };

  const handleCloseTicketDialog = () => {
    setOpenTicketDialog(false);
    setSelectedSaleIdForTicket(null);
  };

  // Affichage
  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 2, mt: 2, textAlign: 'center' }}>
        <CircularProgress size={24} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Chargement des ventes récentes (cache)...
        </Typography>
      </Paper>
    );
  }

  if (error && (!pageItems || pageItems.length === 0)) {
    return (
      <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
        <Typography color="error">{error}</Typography>
        <Button startIcon={<RefreshIcon />} onClick={handleRefresh} sx={{ mt: 1 }}>Réessayer</Button>
      </Paper>
    );
  }

  if (!pageItems || pageItems.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
        <Typography color="text.secondary">Aucune vente récente dans le cache pour le moment.</Typography>
        <Button startIcon={<RefreshIcon />} onClick={handleRefresh} sx={{ mt: 1 }}>Vérifier à nouveau</Button>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 2, mt: 3, backgroundColor: theme.palette.background.paper }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Typography variant="h6" component="h3" sx={{ fontWeight: 600, color: "text.secondary" }}>
          Dernières Ventes — Page {page}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={handleRefresh} size="small" title="Rafraîchir la liste du cache"><RefreshIcon /></IconButton>
        </Stack>
      </Stack>

      {error && <Typography color="error" variant="caption" sx={{ mb: 1 }}>{error}</Typography>}

      <List dense>
        {pageItems.map((sale) => {
          const displayDate = sale.timestamp?.toDate ? sale.timestamp.toDate() : new Date(0);
          return (
            <React.Fragment key={sale.id}>
              <ListItem
                secondaryAction={
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ReceiptIcon />}
                    onClick={() => handleOpenTicket(sale.id)}
                    sx={{ textTransform: 'none' }}
                  >
                    Ticket
                  </Button>
                }
                sx={{ borderBottom: `1px solid ${theme.palette.divider}`, '&:last-child': { borderBottom: 'none' } }}
              >
                <ListItemText
                  primary={`${sale.clientNomSnapshot} — ${sale.grandTotal.toFixed(2)}`}
                  primaryTypographyProps={{ fontWeight: 500, noWrap: true }}
                  secondary={`${displayDate.toLocaleDateString('fr-FR')} ${displayDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} | Statut: ${sale.paymentStatus}`}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            </React.Fragment>
          );
        })}
      </List>

      <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" mt={2}>
        <Button variant="outlined" size="small" onClick={handlePrev} disabled={page <= 1}>Précédent</Button>
        <Typography variant="caption" color="text.secondary">Page {page}</Typography>
        <Button variant="outlined" size="small" onClick={handleNext} disabled={!!lastPageReached.current[page]}>Suivant</Button>
      </Stack>

      <Dialog
        open={openTicketDialog}
        onClose={handleCloseTicketDialog}
        maxWidth="sm"
        fullWidth
        container={pageContainerRef.current}
        disablePortal={isPageFullscreen}
      >
        <DialogTitle sx={{ fontFamily: "'Poppins', sans-serif", backgroundColor: theme.palette.background.default }}>
          Aperçu du Ticket
          <IconButton
            onClick={handleCloseTicketDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{
          fontFamily: "'Poppins', sans-serif",
          p: { xs: 1, sm: 2 },
          backgroundColor: theme.palette.background.default,
          minHeight: '300px'
        }}>
          {boutiqueId && selectedSaleIdForTicket ? (
            <InvoiceGenerator
              boutiqueId={boutiqueId}
              saleId={selectedSaleIdForTicket}
              type="b2c"
              printer="thermal"
            />
          ) : (
            <Typography color="error">ID de boutique ou de vente manquant pour générer le ticket.</Typography>
          )}
        </DialogContent>
      </Dialog>
    </Paper>
  );
}
