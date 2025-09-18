// src/components/ReturnDetails.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  TablePagination,
  Chip, // Ajouté pour les statuts
  IconButton, // Ajouté pour le bouton copier
  Snackbar, // Ajouté pour la notification de copie
  Tooltip, // Pour les infobulles
} from "@mui/material";
import {
  ShoppingCart as ShoppingCartIcon,
  ContentCopy as ContentCopyIcon, // Ajouté pour l'icône copier
} from "@mui/icons-material";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  doc,
  Timestamp, // Ajouté pour typer createdAt et potentiellement dateRetour
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import SalesDetails from "./SalesDetails"; // Assurez-vous que ce composant est correctement implémenté

// Définition plus précise des types pour les données de Firestore
interface ReturnRecordData {
  motif: string;
  etat: string; // Vous pourriez utiliser une union de chaînes si les états sont fixes: "Accepté" | "Refusé" etc.
  dateRetour: string | Timestamp; // Peut être stocké comme string ISO ou Timestamp Firestore
  action: string; // Similaire à 'etat', pourrait être une union
  customerId: string;
  saleId: string;
  createdAt: Timestamp; // Utiliser le type Timestamp de Firestore
}

interface ReturnRecord extends ReturnRecordData {
  id: string;
}

interface CustomerData {
  nom: string;
  telephone: string;
  // Ajoutez d'autres champs si nécessaire
}

// Helper pour formater les dates de manière lisible
const formatDate = (dateInput: string | Timestamp | Date): string => {
  if (!dateInput) return "N/A";
  let date: Date;
  if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else if (dateInput instanceof Timestamp) {
    date = dateInput.toDate();
  } else {
    date = dateInput;
  }
  return date.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Helper pour afficher les statuts avec des couleurs
const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  let color: "success" | "error" | "warning" | "info" | "default" = "default";
  let label = status;

  // Personnalisez ces couleurs et labels selon vos statuts réels
  switch (status.toLowerCase()) {
    case "accepté":
    case "remboursé":
    case "échange effectué":
    case "remboursement effectué":
      color = "success";
      break;
    case "refusé":
      color = "error";
      break;
    case "en attente":
    case "en attente d'approbation":
      color = "warning";
      break;
    case "traité":
    case "avoir créé":
      color = "info";
      break;
    default:
      label = status || "N/A";
  }

  return <Chip label={label} color={color} size="small" sx={{ fontFamily: "'Poppins', sans-serif" }} />;
};


export default function ReturnDetails() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [customers, setCustomers] = useState<Record<string, CustomerData>>({}); // Store CustomerData, ID is the key
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<"today" | "thisWeek" | "all">("thisWeek");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const [openSaleModal, setOpenSaleModal] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  // 1) Récupérer boutiqueId
  useEffect(() => {
    if (!user) {
      setLoading(false); // Si pas d'utilisateur, arrêter le chargement
      return;
    }
    const q = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          setBoutiqueId(snapshot.docs[0].id);
        } else {
          setError("Aucune boutique associée à cet utilisateur n'a été trouvée.");
          setLoading(false);
        }
      },
      (err) => {
        console.error("Erreur de récupération de la boutique:", err);
        setError("Erreur lors de la récupération des informations de la boutique.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // 2) Charger les retours
  useEffect(() => {
    if (!boutiqueId) return;
    setLoading(true);
    const returnsRef = collection(db, "boutiques", boutiqueId, "returns");
    const unsubscribe = onSnapshot(
      returnsRef,
      (snapshot) => {
        const fetchedReturns = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as ReturnRecordData),
        }));
        setReturns(fetchedReturns);
        setLoading(false);
      },
      (err) => {
        console.error("Erreur de récupération des retours:", err);
        setError("Erreur lors de la récupération des retours.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [boutiqueId]);

  // 3) Charger les données des clients pour les retours affichés
  const fetchCustomerData = useCallback(async (customerId: string, currentBoutiqueId: string) => {
    if (customers[customerId]) return; // Déjà chargé

    try {
      const customerDocRef = doc(db, "boutiques", currentBoutiqueId, "customers", customerId);
      const customerSnap = await getDoc(customerDocRef);
      if (customerSnap.exists()) {
        setCustomers((prev) => ({
          ...prev,
          [customerId]: customerSnap.data() as CustomerData,
        }));
      } else {
        console.warn(`Client avec ID ${customerId} non trouvé.`);
        setCustomers((prev) => ({ // Fournir un placeholder
          ...prev,
          [customerId]: { nom: "Client inconnu", telephone: "N/A" },
        }));
      }
    } catch (err) {
      console.error(`Erreur de récupération du client ${customerId}:`, err);
      // Optionnel : gérer l'erreur pour un client spécifique
    }
  }, [customers]); // customers est une dépendance pour éviter les re-fetch inutiles

  useEffect(() => {
    if (!boutiqueId || returns.length === 0) return;
    const customerIdsToFetch = new Set<string>();
    returns.forEach(r => {
      if (r.customerId && !customers[r.customerId]) {
        customerIdsToFetch.add(r.customerId);
      }
    });
    customerIdsToFetch.forEach(customerId => fetchCustomerData(customerId, boutiqueId));
  }, [boutiqueId, returns, customers, fetchCustomerData]);


  const handleFilterChange = (_event: React.MouseEvent<HTMLElement>, newFilter: "today" | "thisWeek" | "all" | null) => {
    if (newFilter !== null) {
      setFilter(newFilter);
      setPage(0); // Reset page on filter change
    }
  };

  const handleChangePage = (_event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleOpenSaleDetails = (saleId: string) => {
    setSelectedSaleId(saleId);
    setOpenSaleModal(true);
  };

  const handleCloseSaleDetails = () => {
    setOpenSaleModal(false);
    setSelectedSaleId(null);
  };

  const handleCopyToClipboard = async (text: string) => {
    if (!navigator.clipboard) {
      setSnackbarMessage("La copie n'est pas supportée par votre navigateur.");
      setSnackbarOpen(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setSnackbarMessage("ID de vente copié dans le presse-papiers !");
    } catch (err) {
      setSnackbarMessage("Échec de la copie.");
      console.error("Failed to copy: ", err);
    }
    setSnackbarOpen(true);
  };


  if (loadingAuth) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ m: 2, fontFamily: "'Poppins', sans-serif" }}>{error}</Alert>;
  }
  
  // Filtrer les retours après le chargement initial
  const filteredReturns = returns.filter((r) => {
    if (loading) return false; // Ne pas filtrer pendant le chargement des données initiales de retours
    const returnDate = r.dateRetour instanceof Timestamp ? r.dateRetour.toDate() : new Date(r.dateRetour);
    if (isNaN(returnDate.getTime())) return false; // Ignorer les dates invalides

    const now = new Date();
    if (filter === "today") {
      return (
        returnDate.getFullYear() === now.getFullYear() &&
        returnDate.getMonth() === now.getMonth() &&
        returnDate.getDate() === now.getDate()
      );
    }
    if (filter === "thisWeek") {
      const oneWeekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      return returnDate >= oneWeekAgo && returnDate <= now;
    }
    return true; // 'all'
  }).sort((a,b) => { // Trier par date de retour la plus récente
      const dateA = a.dateRetour instanceof Timestamp ? a.dateRetour.toMillis() : new Date(a.dateRetour).getTime();
      const dateB = b.dateRetour instanceof Timestamp ? b.dateRetour.toMillis() : new Date(b.dateRetour).getTime();
      return dateB - dateA;
  });

  const paginatedReturns = filteredReturns.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const tableCellStyle = { fontFamily: "'Poppins', sans-serif", fontWeight: "500" };
  const tableHeaderStyle = { ...tableCellStyle, fontWeight: "600", backgroundColor: "grey.200" };


  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Typography
        variant="h5"
        sx={{ fontWeight: "600", mb: 3, letterSpacing: 0.5, fontFamily: "'Poppins', sans-serif", color: "primary.main" }}
      >
        🧾 Historique des Retours
      </Typography>

      <ToggleButtonGroup
        value={filter}
        exclusive
        onChange={handleFilterChange}
        aria-label="Filtre des retours"
        sx={{ mb: 3 }}
        size="small"
      >
        <ToggleButton value="today" aria-label="Aujourd'hui" sx={{ fontFamily: "'Poppins', sans-serif" }}>
          Aujourd&apos;hui
        </ToggleButton>
        <ToggleButton value="thisWeek" aria-label="Cette semaine" sx={{ fontFamily: "'Poppins', sans-serif" }}>
          Cette semaine
        </ToggleButton>
        <ToggleButton value="all" aria-label="Tous" sx={{ fontFamily: "'Poppins', sans-serif" }}>
          Tous
        </ToggleButton>
      </ToggleButtonGroup>

      {loading && !returns.length ? (
         <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "20vh" }}>
            <CircularProgress />
         </Box>
      ) : (
        <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2, overflowX: "auto" }}>
          <Table stickyHeader aria-label="Tableau des retours">
            <TableHead>
              <TableRow>
                <TableCell sx={tableHeaderStyle}>Client</TableCell>
                <TableCell sx={tableHeaderStyle}>Motif du Retour</TableCell>
                <TableCell sx={tableHeaderStyle}>État</TableCell>
                <TableCell sx={tableHeaderStyle}>Date du Retour</TableCell>
                <TableCell sx={tableHeaderStyle}>Action Prise</TableCell>
                <TableCell sx={tableHeaderStyle} align="center">Vente Associée</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedReturns.map((r) => {
                const customer = customers[r.customerId] || { nom: "Chargement...", telephone: "" };
                return (
                  <TableRow key={r.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell sx={tableCellStyle}>
                      <Typography variant="body2" sx={{ fontWeight: "500", fontFamily: "'Poppins', sans-serif" }}>
                        {customer.nom}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "'Poppins', sans-serif" }}>
                        {customer.telephone}
                      </Typography>
                    </TableCell>
                    <TableCell sx={tableCellStyle}>{r.motif}</TableCell>
                    <TableCell sx={tableCellStyle}><StatusChip status={r.etat} /></TableCell>
                    <TableCell sx={tableCellStyle}>{formatDate(r.dateRetour)}</TableCell>
                    <TableCell sx={tableCellStyle}><StatusChip status={r.action} /></TableCell>
                    <TableCell sx={tableCellStyle} align="center">
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={<ShoppingCartIcon />}
                        onClick={() => handleOpenSaleDetails(r.saleId)}
                        sx={{ fontFamily: "'Poppins', sans-serif", textTransform: 'none' }}
                      >
                        Détails
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paginatedReturns.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, fontFamily: "'Poppins', sans-serif" }}>
                    Aucun retour ne correspond à vos critères de filtre.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={filteredReturns.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        labelRowsPerPage="Lignes par page:"
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count !== -1 ? count : `plus de ${to}`}`}
        sx={{ mt: 2, fontFamily: "'Poppins', sans-serif", ".MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows": { fontFamily: "'Poppins', sans-serif" } }}
      />

      {selectedSaleId && boutiqueId && (
        <Dialog
          open={openSaleModal}
          onClose={handleCloseSaleDetails}
          fullWidth
          maxWidth="md" // Augmenté pour plus d'espace si SalesDetails est complexe
          PaperProps={{ sx: { borderRadius: 2 } }}
        >
          <DialogTitle sx={{ fontFamily: "'Poppins', sans-serif", fontWeight: "600", borderBottom: '1px solid', borderColor: 'divider', pb: 1.5 }}>
            🧾 Détails de la Vente
            <Tooltip title="Copier l'ID de la vente">
              <IconButton
                aria-label="copier ID de vente"
                onClick={() => handleCopyToClipboard(selectedSaleId)}
                size="small"
                sx={{ ml: 1, color: 'text.secondary' }}
              >
                <ContentCopyIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </DialogTitle>
          <DialogContent sx={{ pt: "20px !important" }}>
            {/* Affichez l'ID de la vente ici aussi si vous le souhaitez */}
            <Typography variant="caption" display="block" gutterBottom sx={{ fontFamily: "'Poppins', sans-serif", color: 'text.secondary', mb: 2 }}>
              ID de la Vente : {selectedSaleId}
            </Typography>
            <SalesDetails
              boutiqueId={boutiqueId}
              saleId={selectedSaleId}
              onClose={handleCloseSaleDetails}
              // Assurez-vous que SalesDetails utilise aussi Poppins si nécessaire
            />
          </DialogContent>
        </Dialog>
      )}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}