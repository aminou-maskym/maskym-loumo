"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  // FirestoreError, // Non utilisé explicitement, peut être retiré si pas de gestion spécifique
  Timestamp,
  serverTimestamp,
  limit,
  startAfter,
  orderBy,
  // DocumentSnapshot, // Non utilisé explicitement comme type de variable
  QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  Box,
  Stack,
  Typography,
  Button,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  CircularProgress,
  Grid,
  Avatar,
  Tooltip,
  Alert,
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Business as BusinessIcon,
  Visibility as VisibilityIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  Inventory2 as Inventory2Icon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  Event as EventIcon,
  ArrowDownward as ArrowDownwardIcon,
} from "@mui/icons-material";

// Thème de couleurs
const colors = {
  primary: '#6200EE',
  secondary: '#03DAC6',
  background: '#f5f5f5',
  cardBackground: '#ffffff',
  textPrimary: '#000000',
  textSecondary: '#5f6368',
  error: '#B00020',
  success: '#008453',
};

interface Supplier {
  id: string;
  entreprise: string;
  nom: string;
  telephone: string;
  adresse: string;
  typeProduits: string;
  createdAt?: Timestamp | Date;
  solde?: number;
}

const PAGE_SIZE = 5;

const formatFirebaseTimestamp = (timestamp: Timestamp | Date | undefined): string => {
  if (!timestamp) return "N/A";
  let date: Date;
  if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return "Date invalide";
  }
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (amount: number | undefined, currency = "Devise"): string => {
  if (amount === undefined || amount === null) return "N/A";
  return `${amount.toLocaleString("fr-FR")} ${currency}`;
};

function SupplierCard({
  supplier,
  devise,
  onViewDetails,
  onEdit,
  onDelete,
}: {
  supplier: Supplier;
  devise: string;
  onViewDetails: (supplier: Supplier) => void;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplierId: string, supplierName: string) => void;
}) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Paper
        elevation={3}
        sx={{
          p: 2.5,
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: colors.cardBackground,
          transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
          '&:hover': {
            transform: 'translateY(-5px)',
            boxShadow: 6,
          }
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          <Avatar sx={{ bgcolor: colors.secondary, width: 56, height: 56 }}>
            <BusinessIcon sx={{ color: 'white' }} />
          </Avatar>
          <Box flexGrow={1}>
            <Typography variant="h6" component="div" fontWeight="bold" color={colors.textPrimary}>
              {supplier.entreprise}
            </Typography>
            <Typography variant="body2" color={colors.textSecondary}>
              Contact: {supplier.nom}
            </Typography>
          </Box>
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Stack spacing={1} mb={2}>
          {supplier.telephone && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <PhoneIcon fontSize="small" sx={{ color: colors.textSecondary }} />
              <Typography variant="body2" color={colors.textSecondary}>{supplier.telephone}</Typography>
            </Stack>
          )}
          {supplier.typeProduits && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Inventory2Icon fontSize="small" sx={{ color: colors.textSecondary }} />
              <Typography variant="body2" color={colors.textSecondary}>{supplier.typeProduits}</Typography>
            </Stack>
          )}
        </Stack>
        <Box sx={{ my: 2, p: 2, backgroundColor: '#f0f4f8', borderRadius: '8px', textAlign: 'center' }}>
            <Typography variant="caption" display="block" color={colors.textSecondary}>
                Solde Actuel
            </Typography>
            <Typography variant="h5" fontWeight="bold" color={colors.primary}>
                {formatCurrency(supplier.solde, devise)}
            </Typography>
        </Box>
        <Box sx={{ mt: 'auto' }}>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Tooltip title="Voir Détails">
              <IconButton size="small" onClick={() => onViewDetails(supplier)} sx={{color: colors.primary}}>
                <VisibilityIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Modifier">
              <IconButton size="small" onClick={() => onEdit(supplier)} sx={{color: colors.textSecondary}}>
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Supprimer">
              <IconButton size="small" onClick={() => onDelete(supplier.id, supplier.nom)} sx={{color: colors.error}}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Paper>
    </Grid>
  );
}

export default function SuppliersManagement() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("Devise");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [openSupplierForm, setOpenSupplierForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [openDetailsModal, setOpenDetailsModal] = useState(false);
  const [selectedSupplierForDetails, setSelectedSupplierForDetails] = useState<Supplier | null>(null);

  useEffect(() => {
    if (!user) {
      setLoadingInitial(false);
      return;
    }
    setLoadingInitial(true);
    const qb = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );
    const unsubscribeBoutique = onSnapshot(qb, (snap) => {
      if (!snap.empty) {
        const boutiqueDoc = snap.docs[0];
        setBoutiqueId(boutiqueDoc.id);
        setDevise(boutiqueDoc.data()?.devise || "Devise");
      } else {
        setBoutiqueId(null);
        setDevise("Devise");
        setLoadingInitial(false);
      }
    }, (error) => {
      console.error("Error fetching boutique:", error);
      setLoadingInitial(false);
    });

    return () => unsubscribeBoutique();
  }, [user]);

  const fetchSuppliers = useCallback(async (loadMore = false) => {
    if (!boutiqueId) return;

    if (loadMore) {
      setLoadingMore(true);
    } else {
      setLoadingInitial(true);
      setLastVisible(null);
      setSuppliers([]);
    }

    try {
      let q = query(
        collection(db, "boutiques", boutiqueId, "suppliers"),
        orderBy("entreprise"),
        limit(PAGE_SIZE)
      );

      if (loadMore && lastVisible) {
        q = query(q, startAfter(lastVisible));
      }

      const documentSnapshots = await getDocs(q);
      const newSuppliers = documentSnapshots.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));

      setLastVisible(documentSnapshots.docs[documentSnapshots.docs.length - 1] || null);
      setHasMore(newSuppliers.length === PAGE_SIZE);

      if (loadMore) {
        setSuppliers(prev => [...prev, ...newSuppliers]);
      } else {
        setSuppliers(newSuppliers);
      }

    } catch (error) {
      console.error("Error fetching suppliers:", error);
    } finally {
      if (loadMore) {
        setLoadingMore(false);
      } else {
        setLoadingInitial(false);
      }
    }
  }, [boutiqueId, lastVisible]);

  useEffect(() => {
    if (boutiqueId) {
      fetchSuppliers(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boutiqueId]);


  const handleOpenDetailsModal = (supplier: Supplier) => {
    setSelectedSupplierForDetails(supplier);
    setOpenDetailsModal(true);
  };

  const handleCloseDetailsModal = () => {
    setOpenDetailsModal(false);
    setSelectedSupplierForDetails(null);
  };

  const handleOpenSupplierForm = (supplier?: Supplier) => {
    setEditSupplier(supplier || null);
    setOpenSupplierForm(true);
  };

  const handleCloseSupplierForm = () => {
    setOpenSupplierForm(false);
    setEditSupplier(null);
  };

  const afterFormSubmit = () => {
    handleCloseSupplierForm();
    fetchSuppliers(false);
  };

  const handleDeleteSupplier = async (supplierId: string, supplierName: string) => {
    if (!boutiqueId) return;
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le fournisseur "${supplierName}" ? Cette action est irréversible.`)) {
      try {
        await deleteDoc(doc(db, "boutiques", boutiqueId, "suppliers", supplierId));
        fetchSuppliers(false);
      } catch (error) {
        console.error("Error deleting supplier: ", error);
      }
    }
  };

  if (loadingAuth || (loadingInitial && !suppliers.length)) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={50} sx={{color: colors.primary}}/>
      </Box>
    );
  }

  if (!boutiqueId && !loadingAuth) {
     return (
        <Box sx={{ p: {xs: 2, md: 3}, backgroundColor: colors.background, minHeight: '100vh', textAlign: 'center' }}>
            <Typography variant="h5" color="error">Aucune boutique n'est associée à cet utilisateur.</Typography>
            <Typography>Veuillez contacter l'administrateur.</Typography>
        </Box>
     );
  }

  // C'est ici que l'erreur est signalée (ligne ~374 dans votre trace)
  return (
    <Box sx={{ p: {xs: 2, md: 3}, backgroundColor: colors.background, minHeight: '100vh' }}>
      <Stack 
        direction={{xs: 'column', sm: 'row'}} 
        alignItems="center" 
        justifyContent="space-between" 
        mb={3} 
        spacing={{xs: 2, sm: 0}}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
            <BusinessIcon sx={{fontSize: '2rem', color: colors.primary}} />
            <Typography variant="h4" fontWeight="bold" color={colors.textPrimary}>
            Fournisseurs
            </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenSupplierForm()}
          sx={{
            textTransform: "none",
            borderRadius: '8px',
            padding: '10px 20px',
            backgroundColor: colors.secondary,
            color: 'white',
            '&:hover': {
                backgroundColor: '#02b8a2'
            }
          }}
        >
          Nouveau Fournisseur
        </Button>
      </Stack>

      {loadingInitial && suppliers.length === 0 ? (
         <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
      ) : suppliers.length === 0 ? (
        <Paper elevation={1} sx={{p:3, textAlign: 'center', backgroundColor: colors.cardBackground, borderRadius: '12px'}}>
            <Typography variant="h6" color={colors.textSecondary}>Aucun fournisseur trouvé.</Typography>
            <Typography color={colors.textSecondary}>Cliquez sur "Nouveau Fournisseur" pour en ajouter un.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {suppliers.map((s) => (
            <SupplierCard
              key={s.id}
              supplier={s}
              devise={devise}
              onViewDetails={handleOpenDetailsModal}
              onEdit={handleOpenSupplierForm}
              onDelete={handleDeleteSupplier}
            />
          ))}
        </Grid>
      )}

      {hasMore && !loadingInitial && (
        <Box textAlign="center" mt={4}>
          <Button
            variant="outlined"
            onClick={() => fetchSuppliers(true)}
            disabled={loadingMore}
            startIcon={loadingMore ? <CircularProgress size={20} /> : <ArrowDownwardIcon />}
            sx={{
                color: colors.primary,
                borderColor: colors.primary,
                '&:hover': {borderColor: colors.primary, backgroundColor: `${colors.primary}10`}
            }}
          >
            {loadingMore ? "Chargement..." : "Charger plus de fournisseurs"}
          </Button>
        </Box>
      )}

      <Dialog
        fullWidth
        maxWidth="sm"
        open={openSupplierForm}
        onClose={handleCloseSupplierForm}
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primary, color: 'white' }}>
          {editSupplier ? "Modifier le fournisseur" : "Nouveau fournisseur"}
          <IconButton aria-label="close" onClick={handleCloseSupplierForm} sx={{color: 'white'}}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{backgroundColor: colors.cardBackground}}>
          <SupplierForm
            boutiqueId={boutiqueId!} // Le ! assure que boutiqueId n'est pas null ici (grace aux checks précédents)
            devise={devise}
            existing={editSupplier}
            onDone={afterFormSubmit}
          />
        </DialogContent>
      </Dialog>

      {selectedSupplierForDetails && (
        <Dialog
          fullWidth
          maxWidth="md"
          open={openDetailsModal}
          onClose={handleCloseDetailsModal}
          PaperProps={{ sx: { borderRadius: '12px' } }}
        >
          <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primary, color: 'white' }}>
            Détails du Fournisseur
            <IconButton aria-label="close" onClick={handleCloseDetailsModal} sx={{color: 'white'}}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{backgroundColor: colors.cardBackground, p: 3}}>
            <Grid container spacing={3}>
                <Grid item xs={12} md={3} sx={{textAlign: 'center'}}>
                    <Avatar sx={{ bgcolor: colors.secondary, width: 100, height: 100, margin: '0 auto 16px' }}>
                        <BusinessIcon sx={{ fontSize: '3rem', color: 'white' }} />
                    </Avatar>
                    <Typography variant="h5" fontWeight="bold">{selectedSupplierForDetails.entreprise}</Typography>
                </Grid>
                <Grid item xs={12} md={9}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <DetailItem icon={<BusinessIcon />} label="Nom du contact" value={selectedSupplierForDetails.nom} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <DetailItem icon={<PhoneIcon />} label="Téléphone" value={selectedSupplierForDetails.telephone} />
                        </Grid>
                        <Grid item xs={12}>
                            <DetailItem icon={<LocationIcon />} label="Adresse" value={selectedSupplierForDetails.adresse} />
                        </Grid>
                        <Grid item xs={12}>
                            <DetailItem icon={<Inventory2Icon />} label="Type de produits" value={selectedSupplierForDetails.typeProduits} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                             <DetailItem icon={<AccountBalanceWalletIcon />} label="Solde" value={formatCurrency(selectedSupplierForDetails.solde, devise)} valueSx={{fontWeight: 'bold', fontSize: '1.2rem', color: colors.primary}} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <DetailItem icon={<EventIcon />} label="Date de création" value={formatFirebaseTimestamp(selectedSupplierForDetails.createdAt)} />
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{backgroundColor: colors.cardBackground, borderTop: `1px solid ${colors.background}`}}>
            <Button onClick={handleCloseDetailsModal} sx={{color: colors.textSecondary}}>
              Fermer
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
} // Fin de SuppliersManagement

function DetailItem({ icon, label, value, valueSx }: { icon: React.ReactNode, label: string, value?: string | number, valueSx?: any }) {
    return (
        <Box mb={1.5}>
            <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                {React.cloneElement(icon as React.ReactElement, { sx: { color: colors.textSecondary, fontSize: '1.2rem' } })}
                <Typography variant="caption" color={colors.textSecondary} fontWeight="medium">{label}</Typography>
            </Stack>
            <Typography variant="body1" color={colors.textPrimary} sx={{pl:3.5, ...valueSx}}>
                {value || "N/A"}
            </Typography>
        </Box>
    );
}

function SupplierForm({
  boutiqueId,
  devise,
  existing,
  onDone,
}: {
  boutiqueId: string;
  devise: string;
  existing?: Supplier | null;
  onDone: () => void;
}) {
  const [entreprise, setEntreprise] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [typeProduits, setTypeProduits] = useState("");
  const [soldeInitial, setSoldeInitial] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setEntreprise(existing.entreprise || "");
      setNom(existing.nom || "");
      setTelephone(existing.telephone || "");
      setAdresse(existing.adresse || "");
      setTypeProduits(existing.typeProduits || "");
      setSoldeInitial(existing.solde || 0);
    } else {
      setEntreprise("");
      setNom("");
      setTelephone("");
      setAdresse("");
      setTypeProduits("");
      setSoldeInitial(0);
    }
    setError(null);
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!entreprise.trim() || !nom.trim()) {
      setError("Le nom de l'entreprise et le nom du contact sont obligatoires.");
      return;
    }
    setSubmitting(true);
    try {
      const data: Omit<Supplier, "id" | "createdAt"> & { createdAt?: any, solde?: number } = {
        entreprise: entreprise.trim(),
        nom: nom.trim(),
        telephone: telephone.trim(),
        adresse: adresse.trim(),
        typeProduits: typeProduits.trim(),
      };

      if (existing) {
        await updateDoc(doc(db, "boutiques", boutiqueId, "suppliers", existing.id), data);
      } else {
        data.createdAt = serverTimestamp();
        data.solde = Number(soldeInitial);
        await addDoc(collection(db, "boutiques", boutiqueId, "suppliers"), data);
      }
      onDone();
    } catch (err) {
      console.error("Error submitting supplier form:", err);
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: "grid", gap: 2.5, p: {xs: 1, sm:2}, mt: 1 }}>
        {error && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}
      <TextField
        label="Nom de l'entreprise *"
        value={entreprise}
        onChange={(e) => setEntreprise(e.target.value)}
        required
        fullWidth
        variant="outlined"
      />
      <TextField
        label="Nom du contact *"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        required
        fullWidth
        variant="outlined"
      />
      <TextField
        label="Téléphone"
        value={telephone}
        onChange={(e) => setTelephone(e.target.value)}
        fullWidth
        type="tel"
        variant="outlined"
      />
      <TextField
        label="Adresse"
        value={adresse}
        onChange={(e) => setAdresse(e.target.value)}
        fullWidth
        multiline
        rows={3}
        variant="outlined"
      />
      <TextField
        label="Type de produits"
        value={typeProduits}
        onChange={(e) => setTypeProduits(e.target.value)}
        fullWidth
        variant="outlined"
      />
      {!existing && (
        <TextField
          label="Solde initial"
          type="number"
          value={soldeInitial}
          onChange={(e) => setSoldeInitial(parseFloat(e.target.value) || 0)}
          fullWidth
          variant="outlined"
          InputProps={{
            endAdornment: <Typography variant="body2" sx={{color: colors.textSecondary, ml:0.5}}>{devise}</Typography>,
          }}
        />
      )}
      <Box textAlign="right" sx={{ mt: 2 }}>
        <Button onClick={onDone} sx={{ mr: 1, color: colors.textSecondary }}>
          Annuler
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting}
          sx={{
            backgroundColor: colors.secondary,
            color: 'white',
            '&:hover': { backgroundColor: '#02b8a2' }
          }}
        >
          {submitting ? <CircularProgress size={24} color="inherit" /> : (existing ? "Enregistrer" : "Ajouter")}
        </Button>
      </Box>
    </Box>
  );
}