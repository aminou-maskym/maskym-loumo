// components/CustomersManagement.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  FirestoreError,
  Timestamp,
  getDocs,
  limit,
  startAfter,
  getDoc,
  increment as firebaseIncrement,
  arrayUnion,
  Query,
  DocumentSnapshot,
  writeBatch,
} from "firebase/firestore";
import {
  Box,
  Stack,
  Typography,
  Button,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Divider,
  CircularProgress,
  Card,
  CardContent,
  CardHeader,
  Avatar,
  Tooltip,
  InputAdornment,
  Alert,
  DialogActions,
  Fade,
  Snackbar,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Info as InfoIcon,
  Search as SearchIcon,
} from "@mui/icons-material";

import SalesDetails from "./SalesDetails";

interface Customer {
  id: string;
  nom: string;
  telephone: string;
  adresse: string;
  totalPaye?: number;
  totalAchat?: number;
  nombreAchats?: number;
  derniereVente?: Timestamp;
  nombreCreancesPayees?: number;
  paymentNotes?: Array<{
    saleId: string;
    paidAmount: number;
    paymentDate: Timestamp;
    status: "avant échéance" | "après échéance";
  }>;
  solde?: number;
}

interface Creance {
  id: string;
  clientId: string;
  clientNom: string;
  clientTelephone: string;
  saleId: string;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate?: Timestamp;
  status: string;
  paymentDate?: Timestamp;
}

export default function CustomersManagement() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("XOF");
  const [clients, setClients] = useState<Customer[]>([]);
  const [filteredClients, setFilteredClients] = useState<Customer[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [openClientDialog, setOpenClientDialog] = useState(false);
  const [editClient, setEditClient] = useState<Customer | null>(null);
  const [selectedClient, setSelectedClient] = useState<Customer | null>(null);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastVisibleClient, setLastVisibleClient] = useState<DocumentSnapshot | null>(null);
  const [hasMoreClients, setHasMoreClients] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [totalClients, setTotalClients] = useState(0);
  const [openSaleDetail, setOpenSaleDetail] = useState(false);
  const [saleIdForRow, setSaleIdForRow] = useState<string | null>(null);

  // NEW: credit dialog state
  const [creditClient, setCreditClient] = useState<Customer | null>(null);
  const [creditAmount, setCreditAmount] = useState<number | "">("");
  const [confirmingCredit, setConfirmingCredit] = useState(false);

  // fetch boutique & devise & initial lists
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const bId = snap.docs[0].id;
        setBoutiqueId(bId);
        fetchDevise(bId);
        fetchClients(bId, false, true);
        fetchTotalClients(bId);
      } else {
        setLoadingLists(false);
        setBoutiqueId(null);
      }
    }, (error) => {
        console.error("Erreur onSnapshot boutique:", error);
        setLoadingLists(false);
    });
    return () => unsub();
  }, [user]);

  const fetchDevise = async (bId: string) => {
    if (!bId) return;
    try {
      const boutiqueDocRef = doc(db, "boutiques", bId);
      let boutiqueSnap = await getDoc(boutiqueDocRef, { source: "cache" }).catch(() => getDoc(boutiqueDocRef));
      if (!boutiqueSnap.exists() || !boutiqueSnap.data()?.devise) {
        boutiqueSnap = await getDoc(boutiqueDocRef);
      }
      if (boutiqueSnap.exists() && boutiqueSnap.data()?.devise) {
        setDevise(boutiqueSnap.data()?.devise);
      } else {
        setDevise("XOF");
      }
    } catch (error) {
      console.error("Erreur récupération devise:", error);
      setDevise("XOF");
    }
  };

  const fetchTotalClients = async (bId: string) => {
    try {
      const q = query(collection(db, "boutiques", bId, "customers"));
      const serverSnap = await getDocs(q);
      setTotalClients(serverSnap.size);
    } catch (error) {
      console.error("Erreur récupération total clients:", error);
    }
  };

  const fetchClients = async (bId: string, loadMore = false, initialLoad = false) => {
    if (!bId) return;
    if (initialLoad) setLoadingLists(true);
    try {
      let qBuilder: Query = collection(db, "boutiques", bId, "customers");
      if (loadMore && lastVisibleClient) {
        qBuilder = query(qBuilder, startAfter(lastVisibleClient), limit(10));
      } else {
        qBuilder = query(qBuilder, limit(10));
      }

      let snap;
      if (!loadMore) {
        try {
          snap = await getDocs(qBuilder, { source: "cache" });
          if (snap.empty) snap = await getDocs(qBuilder, { source: "server" });
        } catch {
          snap = await getDocs(qBuilder, { source: "server" });
        }
      } else {
        snap = await getDocs(qBuilder, { source: "server" });
      }

      const newClients = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
      setClients((prev) => (loadMore ? [...prev, ...newClients] : newClients));
      setFilteredClients((prev) => (loadMore ? [...prev, ...newClients] : newClients));
      setLastVisibleClient(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMoreClients(newClients.length === 10);
    } catch (error) {
      console.error("Erreur récupération clients:", error);
    } finally {
      if (initialLoad || !loadMore) setLoadingLists(false);
    }
  };

  const handleSearch = async () => {
    if (!searchPhone.trim() || !boutiqueId) {
      setFilteredClients(clients);
      setSearchError(null);
      if (searchPhone.trim() === "" && boutiqueId) fetchClients(boutiqueId, false, true);
      return;
    }
    setLoadingLists(true);
    setSearchError(null);
    try {
      const q = query(
        collection(db, "boutiques", boutiqueId, "customers"),
        where("telephone", "==", searchPhone.trim()),
        limit(1)
      );
      const serverSnap = await getDocs(q, { source: "server" });
      if (!serverSnap.empty) {
        const client = { id: serverSnap.docs[0].id, ...serverSnap.docs[0].data() } as Customer;
        setFilteredClients([client]);
        setHasMoreClients(false);
      } else {
        setSearchError("Client non trouvé.");
        setFilteredClients([]);
      }
    } catch (error) {
      console.error("Erreur recherche client:", error);
      setSearchError("Erreur lors de la recherche.");
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    if (searchPhone === "" && boutiqueId) {
      setSearchError(null);
      setFilteredClients(clients);
      setHasMoreClients(clients.length > 0 && clients.length % 10 === 0);
    }
  }, [searchPhone, boutiqueId, clients]);

  // Get creances of a client (used in client detail)
  const fetchCreancesForClient = async (bId: string, clientId: string) => {
    try {
      const q = query(
        collection(db, "boutiques", bId, "creances"),
        where("clientId", "==", clientId),
        where("status", "==", "en attente")
      );
      const snap = await getDocs(q, { source: "server" }).catch(() => getDocs(q, { source: "cache" }));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Creance));
    } catch (error) {
      console.error("Erreur fetch creances client:", error);
      return [];
    }
  };

  // Delete client (with check for pending creances)
  const handleDeleteClient = async () => {
    if (confirmDelete && boutiqueId) {
      try {
        const creancesQuery = query(
          collection(db, "boutiques", boutiqueId, "creances"),
          where("clientId", "==", confirmDelete),
          where("status", "==", "en attente")
        );
        const creancesSnap = await getDocs(creancesQuery);
        if (!creancesSnap.empty) {
          setSnackbarMessage("Ce client a des créances en attente et ne peut pas être supprimé.");
          setSnackbarOpen(true);
          setConfirmDelete(null);
          return;
        }

        await deleteDoc(doc(db, "boutiques", boutiqueId, "customers", confirmDelete));
        setSnackbarMessage("Client supprimé avec succès.");
        setSnackbarOpen(true);
        setClients((prev) => prev.filter((c) => c.id !== confirmDelete));
        setFilteredClients((prev) => prev.filter((c) => c.id !== confirmDelete));
        fetchTotalClients(boutiqueId);
      } catch (err) {
        console.error("Erreur suppression client: ", err);
        setSnackbarMessage("Erreur lors de la suppression du client.");
        setSnackbarOpen(true);
      } finally {
        setConfirmDelete(null);
      }
    }
  };

  // open sale details from client view
  const openSaleFromClient = (saleId: string) => {
    setSaleIdForRow(saleId);
    setOpenSaleDetail(true);
  };

  // Selected client dialog: load creances for that client
  const [clientCreances, setClientCreances] = useState<Creance[]>([]);
  useEffect(() => {
    let mounted = true;
    if (selectedClient && boutiqueId) {
      fetchCreancesForClient(boutiqueId, selectedClient.id).then((c) => {
        if (mounted) setClientCreances(c);
      });
    } else {
      setClientCreances([]);
    }
    return () => { mounted = false; };
  }, [selectedClient, boutiqueId]);

  const totalOwed = useMemo(() => clientCreances.reduce((s, c) => s + (c.remainingAmount || 0), 0), [clientCreances]);

  // --- NEW: credit client balance ---
  const handleOpenCreditDialog = (client: Customer) => {
    setCreditClient(client);
    setCreditAmount("");
  };

  const handleConfirmCredit = async () => {
    if (!creditClient || !boutiqueId || !user) return;
    const amount = typeof creditAmount === "string" ? parseFloat(creditAmount || "0") : Number(creditAmount || 0);
    if (!amount || isNaN(amount) || amount <= 0) {
      setSnackbarMessage("Veuillez saisir un montant valide à créditer.");
      setSnackbarOpen(true);
      return;
    }

    setConfirmingCredit(true);
    const batch = writeBatch(db);
    const clientRef = doc(db, "boutiques", boutiqueId, "customers", creditClient.id);
    batch.update(clientRef, {
      solde: firebaseIncrement(amount),
    });

    // Update caisse + transaction
    try {
      const caisseCol = collection(db, "boutiques", boutiqueId, "caisse");
      const caisseSnap = await getDocs(query(caisseCol, limit(1)));
      if (!caisseSnap.empty) {
        const caisseDoc = caisseSnap.docs[0];
        const currentSolde = caisseDoc.data().solde ?? 0;
        batch.update(caisseDoc.ref, { solde: firebaseIncrement(amount) });

        const transactionRef = doc(collection(db, "boutiques", boutiqueId, "caisse", caisseDoc.id, "transactions"));
        batch.set(transactionRef, {
          clientId: creditClient.id,
          clientNom: creditClient.nom,
          type: "ajout solde client",
          montant: amount,
          ancienSolde: currentSolde,
          nouveauSolde: currentSolde + amount,
          userId: user.uid,
          timestamp: Timestamp.now(),
        });
      } else {
        console.warn("Aucune caisse trouvée pour enregistrer la transaction de crédit solde client.");
      }

      await batch.commit();

      // Optimistic UI update
      setClients((prev) => prev.map((c) => c.id === creditClient.id ? { ...c, solde: (c.solde || 0) + amount } : c));
      setFilteredClients((prev) => prev.map((c) => c.id === creditClient.id ? { ...c, solde: (c.solde || 0) + amount } : c));
      if (selectedClient?.id === creditClient.id) {
        setSelectedClient((prev) => prev ? { ...prev, solde: (prev.solde || 0) + amount } : prev);
      }

      setSnackbarMessage("Solde client crédité et transaction enregistrée en caisse.");
      setSnackbarOpen(true);
    } catch (err) {
      console.error("Erreur lors du crédit du solde client:", err);
      setSnackbarMessage("Erreur lors du crédit du solde client.");
      setSnackbarOpen(true);
    } finally {
      setConfirmingCredit(false);
      setCreditClient(null);
      setCreditAmount("");
    }
  };
  // --- END credit balance ---

  if (loadingAuth) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }
  if (!user && !loadingAuth) {
    return (
      <Box sx={{ p:4, textAlign: 'center' }}>
        <Typography variant="h6">Veuillez vous connecter pour accéder à cette page.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "#f0f4f8", minHeight: "100%" }}>
      <Card sx={{ mb: 4, borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", bgcolor: "#ffffff" }}>
        <CardHeader
          avatar={<Avatar sx={{ bgcolor: "#0288d1" }}><PeopleIcon /></Avatar>}
          title={
            <Typography variant="h5" fontWeight="bold" color="#0288d1" fontFamily="Poppins, sans-serif">
              Nombre total de clients
            </Typography>
          }
          sx={{ bgcolor: "#e1f5fe", py: 2 }}
        />
        <CardContent>
          <Typography variant="h4" color="#0288d1" fontFamily="Poppins, sans-serif">
            {loadingLists && totalClients === 0 ? <CircularProgress size={28} /> : totalClients}
          </Typography>
        </CardContent>
      </Card>

      <Stack direction="row" spacing={2} mb={3} alignItems="center">
        <TextField
          label="Rechercher par téléphone"
          value={searchPhone}
          onChange={(e) => setSearchPhone(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="primary" />
              </InputAdornment>
            ),
          }}
          sx={{ flexGrow: 1, bgcolor: "white", borderRadius: 1, "& .MuiInputLabel-root": { fontFamily: "Poppins, sans-serif" } }}
          onKeyPress={(e) => { if (e.key === 'Enter') handleSearch(); }}
        />
        <Button
          variant="contained"
          onClick={handleSearch}
          sx={{ bgcolor: "#0288d1", "&:hover": { bgcolor: "#0277bd" }, height: '56px' }}
          disabled={loadingLists && searchPhone !== ""}
        >
          {loadingLists && searchPhone !== "" ? <CircularProgress size={24} color="inherit" /> : "Rechercher"}
        </Button>
      </Stack>
      {searchError && <Alert severity="error" sx={{ mb: 2 }}>{searchError}</Alert>}

      <Card sx={{ mb: 4, borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", bgcolor: "#ffffff" }}>
        <CardHeader title="Liste des Clients" />
        <CardContent>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setEditClient(null); setOpenClientDialog(true); }}
            sx={{ mb: 3, bgcolor: "#0288d1", "&:hover": { bgcolor: "#0277bd" } }}
          >
            Ajouter un client
          </Button>

          {loadingLists && filteredClients.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress color="primary" />
            </Box>
          ) : filteredClients.length === 0 && !loadingLists ? (
            <Typography sx={{ textAlign: 'center', py: 3 }}>Aucun client trouvé.</Typography>
          ) : (
            <Paper sx={{ overflow: "auto", borderRadius: 2, bgcolor: "#ffffff" }}>
              <Table sx={{ bgcolor: "#ffffff", minWidth: 700 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: "#b3e5fc" }}>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Nom</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Adresse</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Contact</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Solde ({devise})</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Créances Payées</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Total Payé ({devise})</Typography></TableCell>
                    <TableCell align="center"><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Actions</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredClients.map((c) => (
                    <TableRow key={c.id} hover sx={{ "&:hover": { bgcolor: "#e1f5fe" } }}>
                      <TableCell>{c.nom}</TableCell>
                      <TableCell>{c.adresse || "N/A"}</TableCell>
                      <TableCell>{c.telephone}</TableCell>
                      <TableCell>{(c.solde || 0).toLocaleString('fr-FR')}</TableCell>
                      <TableCell>{c.nombreCreancesPayees || 0}</TableCell>
                      <TableCell>{(c.totalPaye || 0).toLocaleString('fr-FR')}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="Détails">
                          <IconButton onClick={() => setSelectedClient(c)} sx={{ color: "#0288d1" }}>
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Modifier">
                          <IconButton onClick={() => { setEditClient(c); setOpenClientDialog(true); }} sx={{ color: "#43a047" }}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Créditer solde">
                          <IconButton onClick={() => handleOpenCreditDialog(c)} sx={{ color: "#0288d1" }}>
                            <AddIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Supprimer">
                          <IconButton onClick={() => setConfirmDelete(c.id)} sx={{ color: "#e53935" }}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {hasMoreClients && searchPhone === "" && !loadingLists && filteredClients.length > 0 && (
            <Button onClick={() => boutiqueId && fetchClients(boutiqueId, true)} sx={{ mt: 2, color: "#0288d1" }}>
              Charger plus de clients
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Dialog Ajouter/Modifier client */}
      <Dialog
        open={openClientDialog || Boolean(editClient)}
        onClose={() => { setOpenClientDialog(false); setEditClient(null); }}
        TransitionComponent={Fade}
        transitionDuration={300}
      >
        <DialogTitle sx={{ bgcolor: "#0288d1", color: "white", py: 2, fontFamily: "Poppins, sans-serif" }}>
          {editClient ? "Modifier le client" : "Ajouter un client"}
        </DialogTitle>
        <DialogContent sx={{ mt: 2, pt: "16px !important" }}>
          {boutiqueId && (
            <ClientForm
                boutiqueId={boutiqueId}
                existing={editClient}
                devise={devise}                 // <-- PASSAGE DE LA DEVISE ICI
                onDone={() => {
                  setOpenClientDialog(false);
                  setEditClient(null);
                  if (boutiqueId) fetchClients(boutiqueId, false, true);
                  fetchTotalClients(boutiqueId!);
                }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Détails Client */}
      <Dialog
        open={Boolean(selectedClient)}
        onClose={() => setSelectedClient(null)}
        maxWidth="md"
        fullWidth
        TransitionComponent={Fade}
        transitionDuration={300}
      >
        <DialogTitle sx={{ bgcolor: "#0288d1", color: "white", py: 2, fontFamily: "Poppins, sans-serif" }}>
          Détails du Client : {selectedClient?.nom}
        </DialogTitle>
        <DialogContent sx={{ mt: 2, pt: "16px !important" }}>
          {selectedClient && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <Avatar sx={{ bgcolor: "#0288d1" }}><PeopleIcon /></Avatar>
                <Typography variant="h6" color="#0288d1" fontFamily="Poppins, sans-serif">
                  {selectedClient.nom}
                </Typography>
              </Stack>

              <Typography fontFamily="Poppins, sans-serif"><strong>Adresse:</strong> {selectedClient.adresse || "N/A"}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Téléphone:</strong> {selectedClient.telephone}</Typography>

              <Typography fontFamily="Poppins, sans-serif"><strong>Solde:</strong> {(selectedClient.solde || 0).toLocaleString('fr-FR')} {devise}</Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" color="#0288d1" fontFamily="Poppins, sans-serif">Statistiques d'achat</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Total payé:</strong> {(selectedClient.totalPaye || 0).toLocaleString('fr-FR')} {devise}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Total achat (valeur):</strong> {(selectedClient.totalAchat || 0).toLocaleString('fr-FR')} {devise}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Nombre d'achats:</strong> {selectedClient.nombreAchats || 0}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Dernière vente:</strong> {selectedClient.derniereVente ? selectedClient.derniereVente.toDate().toLocaleString("fr-FR") : "N/A"}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Nombre de créances payées:</strong> {selectedClient.nombreCreancesPayees || 0}</Typography>

              <Divider sx={{ my: 2 }} />

              <Stack direction="row" spacing={2} mb={2}>
                <Button variant="contained" onClick={() => handleOpenCreditDialog(selectedClient)} sx={{ bgcolor: "#0288d1", "&:hover": { bgcolor: "#0277bd" } }}>
                  Créditer le solde
                </Button>
                <Button variant="outlined" onClick={() => { setEditClient(selectedClient); setOpenClientDialog(true); }}>
                  Modifier le client
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" color="#d32f2f" fontFamily="Poppins, sans-serif">Créances en attente ({clientCreances.length})</Typography>

              {clientCreances.length > 0 ? (
                <>
                  <Paper sx={{ overflow: "auto", borderRadius: 2, mt: 1, bgcolor: "#ffffff" }}>
                    <Table size="small" sx={{ bgcolor: "#ffffff" }}>
                      <TableHead><TableRow sx={{ bgcolor: "#e1f5fe" }}>
                        <TableCell><Typography fontFamily="Poppins, sans-serif">Vente (ID)</Typography></TableCell>
                        <TableCell><Typography fontFamily="Poppins, sans-serif">Total ({devise})</Typography></TableCell>
                        <TableCell><Typography fontFamily="Poppins, sans-serif">Payé ({devise})</Typography></TableCell>
                        <TableCell><Typography fontFamily="Poppins, sans-serif">Restant ({devise})</Typography></TableCell>
                        <TableCell><Typography fontFamily="Poppins, sans-serif">Date Limite</Typography></TableCell>
                      </TableRow></TableHead>
                      <TableBody>
                        {clientCreances.map((creance) => (
                          <TableRow key={creance.id}>
                            <TableCell>
                              <Button size="small" onClick={() => openSaleFromClient(creance.saleId)} sx={{ color: "#0288d1", textTransform: "none", p: 0.5 }}>
                                {creance.saleId.substring(0,8)}...
                              </Button>
                            </TableCell>
                            <TableCell>{(creance.grandTotal || 0).toLocaleString('fr-FR')}</TableCell>
                            <TableCell>{(creance.paidAmount || 0).toLocaleString('fr-FR')}</TableCell>
                            <TableCell>{(creance.remainingAmount || 0).toLocaleString('fr-FR')}</TableCell>
                            <TableCell>{creance.dueDate ? creance.dueDate.toDate().toLocaleDateString("fr-FR") : "N/A"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>

                  <Typography variant="h6" color="#d32f2f" mt={2} fontFamily="Poppins, sans-serif">
                    Total dû par ce client : {(totalOwed || 0).toLocaleString('fr-FR')} {devise}
                  </Typography>
                </>
              ) : (
                <Typography fontFamily="Poppins, sans-serif" sx={{ mt: 1 }}>Aucune créance en attente pour ce client.</Typography>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" color="#0288d1" fontFamily="Poppins, sans-serif">Historique des paiements de créances ({selectedClient.paymentNotes?.length || 0})</Typography>

              {selectedClient.paymentNotes && selectedClient.paymentNotes.length > 0 ? (
                <Paper sx={{ overflow: "auto", borderRadius: 2, mt: 1, bgcolor: "#ffffff", maxHeight: 300 }}>
                  <Table size="small" sx={{ bgcolor: "#ffffff" }}>
                    <TableHead><TableRow sx={{ bgcolor: "#e1f5fe" }}>
                      <TableCell><Typography fontFamily="Poppins, sans-serif">Vente (ID)</Typography></TableCell>
                      <TableCell><Typography fontFamily="Poppins, sans-serif">Montant Payé ({devise})</Typography></TableCell>
                      <TableCell><Typography fontFamily="Poppins, sans-serif">Date Paiement</Typography></TableCell>
                      <TableCell><Typography fontFamily="Poppins, sans-serif">Statut Paiement</Typography></TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {selectedClient.paymentNotes.sort((a,b) => b.paymentDate.toMillis() - a.paymentDate.toMillis()).map((note, index) => (
                        <TableRow key={index}>
                          <TableCell>{note.saleId.substring(0,8)}...</TableCell>
                          <TableCell>{(note.paidAmount || 0).toLocaleString('fr-FR')}</TableCell>
                          <TableCell>{note.paymentDate ? note.paymentDate.toDate().toLocaleDateString('fr-FR') : "N/A"}</TableCell>
                          <TableCell>{note.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              ) : (
                <Typography fontFamily="Poppins, sans-serif" sx={{ mt: 1 }}>Aucun historique de paiement de créance.</Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedClient(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Détails Vente */}
      <Dialog
        open={openSaleDetail}
        onClose={() => setOpenSaleDetail(false)}
        maxWidth="lg"
        fullWidth
        TransitionComponent={Fade}
        transitionDuration={300}
      >
        <DialogTitle sx={{ bgcolor: "primary.light", color: "primary.contrastText", pb: 1.5 }}>
          Détails de la vente
        </DialogTitle>
        <DialogContent sx={{ pt: "20px !important" }}>
          {saleIdForRow && boutiqueId && user && (
            <SalesDetails
              boutiqueId={boutiqueId}
              saleId={saleIdForRow}
              userId={user.uid}
              onClose={() => setOpenSaleDetail(false)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSaleDetail(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Suppression */}
      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)}>
        <DialogTitle fontFamily="Poppins, sans-serif">Confirmer la suppression</DialogTitle>
        <DialogContent><Typography fontFamily="Poppins, sans-serif">Êtes-vous sûr de vouloir supprimer ce client ? Cette action est irréversible.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} color="primary">Annuler</Button>
          <Button onClick={handleDeleteClient} color="error">Supprimer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Créditer solde client */}
      <Dialog open={Boolean(creditClient)} onClose={() => !confirmingCredit && setCreditClient(null)} TransitionComponent={Fade} transitionDuration={300}>
        <DialogTitle sx={{ bgcolor: "#0288d1", color: "white", py: 2, fontFamily: "Poppins, sans-serif" }}>
          Créditer le solde : {creditClient?.nom}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>Solde actuel : <strong>{(creditClient?.solde || 0).toLocaleString('fr-FR')} {devise}</strong></Typography>
          <TextField
            label="Montant à créditer"
            type="number"
            fullWidth
            value={creditAmount === "" ? "" : String(creditAmount)}
            onChange={(e) => setCreditAmount(e.target.value === "" ? "" : Number(e.target.value))}
            inputProps={{ min: 0, step: "0.01" }}
          />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Le montant sera ajouté au solde du client et enregistré dans la caisse.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreditClient(null); setCreditAmount(""); }} disabled={confirmingCredit}>Annuler</Button>
          <Button onClick={handleConfirmCredit} variant="contained" disabled={confirmingCredit}>
            {confirmingCredit ? <CircularProgress size={20} color="inherit" /> : "Confirmer crédit"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={() => setSnackbarOpen(false)} message={snackbarMessage} />
    </Box>
  );
}

/* ---------------- ClientForm (modifié pour inclure solde initial à la création, *mais pas* en édition) ---------------- */
function ClientForm({
  boutiqueId,
  existing,
  onDone,
  devise, // <- maintenant passé en prop pour éviter l'erreur "devise is not defined"
}: {
  boutiqueId: string;
  existing?: Customer | null;
  onDone: () => void;
  devise: string;
}) {
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [solde, setSolde] = useState<number | "">(0); // used only for creation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setNom(existing.nom || "");
      setTelephone(existing.telephone || "");
      setAdresse(existing.adresse || "");
      // Do NOT expose solde in edit mode: keep solde state at 0 or existing.solde but do not show/edit it
      setSolde(0);
    } else {
      setNom("");
      setTelephone("");
      setAdresse("");
      setSolde(0);
    }
    setError(null);
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nom.trim() || !telephone.trim()) {
      setError("Le nom et le téléphone du client sont obligatoires.");
      return;
    }
    if (!/^\+?[0-9\s-()]{7,}$/.test(telephone.trim())) {
        setError("Format de téléphone invalide.");
        return;
    }

    setIsSubmitting(true);
    try {
      const isNew = !existing?.id;
      const dataToSave: Partial<Customer> & { nom: string; telephone: string; adresse: string } = {
        nom: nom.trim(),
        telephone: telephone.trim(),
        adresse: adresse.trim(),
        ...( !existing ? {
            totalPaye: 0,
            totalAchat: 0,
            nombreAchats: 0,
            nombreCreancesPayees: 0,
            paymentNotes: [],
            solde: Number(solde || 0), // set initial solde only on creation
        } : {} )
      };

      if (existing?.id) {
        if (telephone.trim() !== existing.telephone) {
            const q = query(collection(db, "boutiques", boutiqueId, "customers"), where("telephone", "==", telephone.trim()));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty && querySnapshot.docs.some(doc => doc.id !== existing.id)) {
                setError("Un autre client avec ce numéro de téléphone existe déjà.");
                setIsSubmitting(false);
                return;
            }
        }
        // Edit: do not modify solde here (explicit requirement)
        await updateDoc(doc(db, "boutiques", boutiqueId, "customers", existing.id), {
          nom: dataToSave.nom,
          telephone: dataToSave.telephone,
          adresse: dataToSave.adresse,
        });
      } else {
        // new client: check phone uniqueness
        const q = query(collection(db, "boutiques", boutiqueId, "customers"), where("telephone", "==", telephone.trim()));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            setError("Un client avec ce numéro de téléphone existe déjà.");
            setIsSubmitting(false);
            return;
        }

        // Create client
        const ref = await addDoc(collection(db, "boutiques", boutiqueId, "customers"), dataToSave);

        // If initial solde > 0, update caisse and add transaction
        const initialSolde = Number(solde || 0);
        if (initialSolde > 0) {
          try {
            const batch = writeBatch(db);
            // customer doc ref
            const clientRef = doc(db, "boutiques", boutiqueId, "customers", ref.id);
            // ensure solde field exists (we already set it in dataToSave but keep safe)
            batch.update(clientRef, { solde: firebaseIncrement(initialSolde) });

            // find caisse doc
            const caisseCol = collection(db, "boutiques", boutiqueId, "caisse");
            const caisseSnap = await getDocs(query(caisseCol, limit(1)));
            if (!caisseSnap.empty) {
              const caisseDoc = caisseSnap.docs[0];
              const currentSolde = caisseDoc.data().solde ?? 0;
              batch.update(caisseDoc.ref, { solde: firebaseIncrement(initialSolde) });

              const transactionRef = doc(collection(db, "boutiques", boutiqueId, "caisse", caisseDoc.id, "transactions"));
              batch.set(transactionRef, {
                clientId: ref.id,
                clientNom: dataToSave.nom,
                type: "ajout solde client",
                montant: initialSolde,
                ancienSolde: currentSolde,
                nouveauSolde: currentSolde + initialSolde,
                userId: user?.uid ?? null,
                timestamp: Timestamp.now(),
              });
            } else {
              console.warn("Aucune caisse trouvée pour enregistrer la transaction d'ajout solde client à la création.");
            }

            await batch.commit();
          } catch (err) {
            console.error("Erreur lors de l'ajout du solde initial en caisse:", err);
            // continue, client was created, but log error
          }
        }
      }
      onDone();
    } catch (err) {
      console.error("Erreur sauvegarde client: ", err);
      setError((err instanceof FirestoreError ? err.message : String(err)) || "Une erreur est survenue.");
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: "grid", gap: 2, py:1 }}>
      <TextField
        label="Nom du client *"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        required
        fullWidth
        variant="outlined"
        sx={{ bgcolor: "white", "& .MuiInputLabel-root": { fontFamily: "Poppins, sans-serif" } }}
      />
      <TextField
        label="Téléphone du client *"
        value={telephone}
        onChange={(e) => setTelephone(e.target.value)}
        required
        fullWidth
        variant="outlined"
        placeholder="+22X XX XX XX XX"
        sx={{ bgcolor: "white", "& .MuiInputLabel-root": { fontFamily: "Poppins, sans-serif" } }}
      />
      <TextField
        label="Adresse du client (Optionnel)"
        value={adresse}
        onChange={(e) => setAdresse(e.target.value)}
        fullWidth
        variant="outlined"
        sx={{ bgcolor: "white", "& .MuiInputLabel-root": { fontFamily: "Poppins, sans-serif" } }}
      />

      {/* Solde initial - displayed ONLY when creating a new client */}
      {!existing && (
        <TextField
          label="Solde initial (à l'ajout)"
          value={solde === "" ? "" : String(solde)}
          onChange={(e) => setSolde(e.target.value === "" ? "" : Number(e.target.value))}
          type="number"
          inputProps={{ step: "0.01", min: 0 }}
          fullWidth
          variant="outlined"
          helperText={`Le montant saisi sera ajouté au solde client et enregistré en caisse (${devise}).`}
          sx={{ bgcolor: "white", "& .MuiInputLabel-root": { fontFamily: "Poppins, sans-serif" } }}
        />
      )}

      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      <Box textAlign="right" sx={{ mt: 1 }}>
        <Button onClick={onDone} sx={{ mr: 1 }} disabled={isSubmitting}>Annuler</Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          sx={{ bgcolor: "#0288d1", "&:hover": { bgcolor: "#0277bd" } }}
        >
          {isSubmitting ? <CircularProgress size={24} color="inherit" /> : (existing ? "Enregistrer les modifications" : "Ajouter le client")}
        </Button>
      </Box>
    </Box>
  );
}
