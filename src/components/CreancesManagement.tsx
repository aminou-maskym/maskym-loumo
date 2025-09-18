// src/components/CreancesManagement.tsx
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
  getDocs,
  getDoc,
  doc,
  writeBatch,
  Timestamp,
  limit,
  startAfter,
  Query,
  DocumentSnapshot,
  increment as firebaseIncrement,
  arrayUnion,
} from "firebase/firestore";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Avatar,
  Typography,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Tooltip,
  Button,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fade,
  Snackbar,
  Alert,
  Stack,
  TextField,
} from "@mui/material";
import {
  CreditCard as CreditCardIcon,
  Visibility as VisibilityIcon,
  WhatsApp as WhatsAppIcon,
  ContentCopy as ContentCopyIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";

import SalesDetails from "./SalesDetails";

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

export default function CreancesManagement() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("XOF");
  const [creances, setCreances] = useState<Creance[]>([]);
  const [lastVisibleCreance, setLastVisibleCreance] = useState<DocumentSnapshot | null>(null);
  const [hasMoreCreances, setHasMoreCreances] = useState(true);
  const [loadingLists, setLoadingLists] = useState(true);
  const [totalCreances, setTotalCreances] = useState(0);
  const [selectedRelanceCreance, setSelectedRelanceCreance] = useState<Creance | null>(null);
  const [creanceToTerminate, setCreanceToTerminate] = useState<Creance | null>(null);
  const [confirmingTermination, setConfirmingTermination] = useState(false);
  const [selectedCreance, setSelectedCreance] = useState<Creance | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [openSaleDetail, setOpenSaleDetail] = useState(false);
  const [saleIdForRow, setSaleIdForRow] = useState<string | null>(null);
  const [isClientMounted, setIsClientMounted] = useState(false);

  // --- NEW: payment amount state for partial payments ---
  const [paymentAmount, setPaymentAmount] = useState<number | "">("");
  // --- end new state ---

  useEffect(() => { setIsClientMounted(true); }, []);

  // fetch boutique & initial creances
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
        fetchCreances(bId, false);
        fetchTotalCreances(bId);
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

  // --- REPLACED: fetchDevise to match other components (cache first, then server) ---
  const fetchDevise = async (bId: string) => {
    if (!bId) return;
    try {
      const boutiqueDocRef = doc(db, "boutiques", bId);
      let boutiqueSnap = await getDoc(boutiqueDocRef, { source: "cache" }).catch(() => null);
      if (!boutiqueSnap || !boutiqueSnap.exists() || !boutiqueSnap.data()?.devise) {
        boutiqueSnap = await getDoc(boutiqueDocRef, { source: "server" }).catch(() => null);
      }
      if (boutiqueSnap && boutiqueSnap.exists() && boutiqueSnap.data()?.devise) {
        setDevise(boutiqueSnap.data()?.devise);
      } else {
        setDevise("XOF");
      }
    } catch (e) {
      console.error("Erreur récupération devise:", e);
      setDevise("XOF");
    }
  };
  // --- end fetchDevise ---

  const fetchTotalCreances = async (bId: string) => {
    try {
      const q = query(collection(db, "boutiques", bId, "creances"), where("status", "==", "en attente"));
      const snap = await getDocs(q);
      setTotalCreances(snap.size);
    } catch (error) {
      console.error("Erreur fetch total creances:", error);
    }
  };

  const fetchCreances = async (bId: string, loadMore = false) => {
    if (!bId) return;
    setLoadingLists(true);
    try {
      let qBuilder: Query = collection(db, "boutiques", bId, "creances");
      qBuilder = query(qBuilder, where("status", "==", "en attente"));
      if (loadMore && lastVisibleCreance) qBuilder = query(qBuilder, startAfter(lastVisibleCreance), limit(10));
      else qBuilder = query(qBuilder, limit(10));

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

      const newCreances = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Creance));
      setCreances((prev) => (loadMore ? [...prev, ...newCreances] : newCreances));
      setLastVisibleCreance(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMoreCreances(newCreances.length === 10);
    } catch (error) {
      console.error("Erreur fetch creances:", error);
    } finally {
      setLoadingLists(false);
    }
  };

  const generateRelanceMessage = (creance: Creance) => {
    const dueDateStr = creance.dueDate ? creance.dueDate.toDate().toLocaleDateString("fr-FR") : "N/A";
    const remainingAmountStr = (creance.remainingAmount || 0).toLocaleString('fr-FR');
    return `Bonjour ${creance.clientNom},\n\nNous vous rappelons que vous avez une créance en attente de ${remainingAmountStr} ${devise} à payer avant le ${dueDateStr}.\n\nMerci de régulariser votre situation au plus vite.\n\nCordialement,\n[Nom de votre boutique/entreprise]`;
  };

  const copyClientData = (creance: Creance) => {
    const data = `Nom: ${creance.clientNom}\nTéléphone: ${creance.clientTelephone}\nMontant dû: ${(creance.remainingAmount || 0).toLocaleString('fr-FR')} ${devise}\nDate limite: ${creance.dueDate ? creance.dueDate.toDate().toLocaleDateString("fr-FR") : "N/A"}`;
    navigator.clipboard.writeText(data)
      .then(() => {
        setSnackbarMessage("Données du client copiées !");
        setSnackbarOpen(true);
      })
      .catch(err => console.error("Erreur copie : ", err));
  };

  const sendWhatsAppMessage = (creance: Creance) => {
    const message = encodeURIComponent(generateRelanceMessage(creance));
    const phoneNumber = (creance.clientTelephone || "").replace(/\s+/g, "");
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, "_blank");
  };

  const copyMessageToClipboard = (creance: Creance) => {
    const message = generateRelanceMessage(creance);
    navigator.clipboard.writeText(message)
      .then(() => {
        setSnackbarMessage("Message de relance copié !");
        setSnackbarOpen(true);
      })
      .catch(err => console.error("Erreur copie : ", err));
  };

  const handleOpenTerminateDialog = (creance: Creance) => {
    setCreanceToTerminate(creance);
    // initialize payment amount to remaining amount by default
    setPaymentAmount(creance.remainingAmount ?? 0);
  };

  /**
   * handleConfirmTerminateCreance
   * - Now supports partial payments (avance).
   * - If paymentAmount >= remaining => full payment (behaviour similar to before).
   * - If paymentAmount < remaining => update creance as partially paid and update sale/client/caisse/stats accordingly.
   *
   * NOTE: we keep the original behavior but extended.
   */
  const handleConfirmTerminateCreance = async () => {
    if (!creanceToTerminate || !boutiqueId || !user) {
      setSnackbarMessage("Erreur: Données manquantes pour terminer la créance.");
      setSnackbarOpen(true);
      setConfirmingTermination(false);
      return;
    }

    // Parse amount
    const remaining = creanceToTerminate.remainingAmount ?? 0;
    let amountNewlyPaidForCreance = 0;
    if (typeof paymentAmount === "string") {
      amountNewlyPaidForCreance = parseFloat(paymentAmount as string) || 0;
    } else {
      amountNewlyPaidForCreance = Number(paymentAmount || 0);
    }

    if (isNaN(amountNewlyPaidForCreance) || amountNewlyPaidForCreance <= 0) {
      setSnackbarMessage("Veuillez saisir un montant valide (> 0).");
      setSnackbarOpen(true);
      return;
    }

    // Cap to remaining if user entered more
    if (amountNewlyPaidForCreance > remaining) {
      amountNewlyPaidForCreance = remaining;
    }

    setConfirmingTermination(true);
    const batch = writeBatch(db);

    const creanceRef = doc(db, "boutiques", boutiqueId, "creances", creanceToTerminate.id);
    const clientRef = doc(db, "boutiques", boutiqueId, "customers", creanceToTerminate.clientId);
    const saleRef = doc(db, "boutiques", boutiqueId, "sales", creanceToTerminate.saleId);

    const paymentDateVal = Timestamp.now();
    const dueDateVal = creanceToTerminate.dueDate;
    const paymentStatusVal = dueDateVal && paymentDateVal.toDate() > dueDateVal.toDate() ? "après échéance" : "avant échéance";

    // If fully paid after this payment
    const willBeFullyPaid = (remaining - amountNewlyPaidForCreance) <= 0;

    // 1) Update creance document
    if (willBeFullyPaid) {
      batch.update(creanceRef, {
        status: "payée",
        paidAmount: firebaseIncrement(amountNewlyPaidForCreance),
        remainingAmount: 0,
        paymentDate: paymentDateVal,
      });
    } else {
      // partial payment: update paid and remaining, keep status en attente
      batch.update(creanceRef, {
        status: "en attente",
        paidAmount: firebaseIncrement(amountNewlyPaidForCreance),
        remainingAmount: firebaseIncrement(-amountNewlyPaidForCreance),
        // do not set paymentDate as final payment date; we still record this partial payment via paymentNotes on client
      });
    }

    // 2) Update client document: always increment totalPaye, add paymentNotes; increment nombreCreancesPayees only if fully paid
    batch.update(clientRef, {
      totalPaye: firebaseIncrement(amountNewlyPaidForCreance),
      paymentNotes: arrayUnion({
        saleId: creanceToTerminate.saleId,
        paidAmount: amountNewlyPaidForCreance,
        paymentDate: paymentDateVal,
        status: paymentStatusVal,
      }),
    });
    if (willBeFullyPaid) {
      batch.update(clientRef, {
        nombreCreancesPayees: firebaseIncrement(1),
      });
    }

    // 3) Update sale document: increment paidAmount, decrement remainingAmount; update paymentStatus accordingly
    batch.update(saleRef, {
      paidAmount: firebaseIncrement(amountNewlyPaidForCreance),
      remainingAmount: firebaseIncrement(-amountNewlyPaidForCreance),
      paymentStatus: willBeFullyPaid ? "payé" : "partiellement payé",
    });

    // 4) Update caisse if amount > 0
    if (amountNewlyPaidForCreance > 0) {
      const caisseCol = collection(db, "boutiques", boutiqueId, "caisse");
      const caisseSnap = await getDocs(query(caisseCol, limit(1)));
      if (!caisseSnap.empty) {
        const caisseDoc = caisseSnap.docs[0];
        const currentCaisseSolde = caisseDoc.data().solde ?? 0;
        const newCaisseSolde = currentCaisseSolde + amountNewlyPaidForCreance;

        batch.update(caisseDoc.ref, { solde: firebaseIncrement(amountNewlyPaidForCreance) });

        const transactionRef = doc(collection(db, "boutiques", boutiqueId, "caisse", caisseDoc.id, "transactions"));
        batch.set(transactionRef, {
          creanceId: creanceToTerminate.id,
          saleId: creanceToTerminate.saleId,
          type: "paiement créance",
          montant: amountNewlyPaidForCreance,
          ancienSolde: currentCaisseSolde,
          nouveauSolde: newCaisseSolde,
          userId: user.uid,
          timestamp: paymentDateVal,
        });
      } else {
        console.warn("Aucune caisse trouvée pour enregistrer la transaction de paiement de créance.");
      }
    }

    // 5) Update Daily Sales Stats (`statsVentes`) for the collected amount
    if (amountNewlyPaidForCreance > 0) {
      const todayDateKey = new Date().toISOString().split("T")[0];
      const dailyStatsDocRef = doc(db, "boutiques", boutiqueId, "statsVentes", todayDateKey);
      batch.set(dailyStatsDocRef, {
        montantPercuTotalDuJour: firebaseIncrement(amountNewlyPaidForCreance),
        lastUpdated: paymentDateVal,
        date: todayDateKey,
      }, { merge: true });
    }

    try {
      await batch.commit();

      // Update local UI
      if (willBeFullyPaid) {
        setSnackbarMessage("Créance marquée comme payée. Vente, caisse et stats mises à jour.");
        // remove this creance from list
        setCreances((prev) => prev.filter((c) => c.id !== creanceToTerminate!.id));
        fetchTotalCreances(boutiqueId);
      } else {
        setSnackbarMessage("Paiement partiel enregistré. La créance reste en attente avec un reste à payer.");
        // update local creances array to reflect new paid/remaining values without reloading server
        setCreances((prev) =>
          prev.map((c) =>
            c.id === creanceToTerminate.id
              ? { ...c, paidAmount: (c.paidAmount || 0) + amountNewlyPaidForCreance, remainingAmount: (c.remainingAmount || 0) - amountNewlyPaidForCreance }
              : c
          )
        );
      }

      setSnackbarOpen(true);

    } catch (err) {
      console.error("Erreur terminaison créance:", err);
      setSnackbarMessage("Erreur lors de la terminaison de la créance. Voir console.");
      setSnackbarOpen(true);
    } finally {
      setConfirmingTermination(false);
      setCreanceToTerminate(null);
      setPaymentAmount("");
    }
  };

  // open sale details from creance row
  const openSaleFromCreance = (saleId: string) => {
    setSaleIdForRow(saleId);
    setOpenSaleDetail(true);
  };

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
          avatar={<Avatar sx={{ bgcolor: "#d32f2f" }}><CreditCardIcon /></Avatar>}
          title={<Typography variant="h5" fontWeight="bold" color="#d32f2f" fontFamily="Poppins, sans-serif">Total des créances en attente</Typography>}
          sx={{ bgcolor: "#ffebee", py: 2 }}
        />
        <CardContent>
          <Typography variant="h4" color="#d32f2f" fontFamily="Poppins, sans-serif">
            {loadingLists && totalCreances === 0 ? <CircularProgress size={28}/> : totalCreances}
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ mb: 4, borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", bgcolor: "#ffffff" }}>
        <CardHeader title="Liste des Créances en attente" />
        <CardContent>
          {loadingLists && creances.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress color="secondary" />
            </Box>
          ) : creances.length === 0 && !loadingLists ? (
            <Typography sx={{ textAlign: 'center', py: 3 }}>Aucune créance en attente.</Typography>
          ) : (
            <Paper sx={{ overflow: "auto", borderRadius: 2, bgcolor: "#ffffff" }}>
              <Table sx={{ bgcolor: "#ffffff", minWidth: 800 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: "#ffcdd2" }}>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Client</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Montant Total ({devise})</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Montant Payé ({devise})</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Montant Restant ({devise})</Typography></TableCell>
                    <TableCell><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Date Limite</Typography></TableCell>
                    <TableCell align="center"><Typography fontWeight="bold" fontFamily="Poppins, sans-serif">Actions</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {creances.map((creance) => {
                    const dueDate = creance.dueDate?.toDate();
                    let clientCalculatedIsExpiringSoon = false;
                    if (isClientMounted && dueDate) {
                      const todayClient = new Date();
                      todayClient.setHours(0,0,0,0);
                      const tenDaysFromNowClient = new Date(new Date().setDate(new Date().getDate() + 10));
                      tenDaysFromNowClient.setHours(0,0,0,0);
                      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
                      clientCalculatedIsExpiringSoon = dueDateOnly <= tenDaysFromNowClient;
                    }

                    return (
                      <TableRow
                        key={creance.id}
                        hover
                        sx={{
                          "&:hover": { bgcolor: "#ffebee" },
                          bgcolor: clientCalculatedIsExpiringSoon ? (dueDate && dueDate < new Date(new Date().setHours(0,0,0,0)) ? "#ffcdd2" : "#fff3e0") : "inherit",
                        }}
                      >
                        <TableCell>{creance.clientNom}</TableCell>
                        <TableCell>{(creance.grandTotal || 0).toLocaleString('fr-FR')}</TableCell>
                        <TableCell>{(creance.paidAmount || 0).toLocaleString('fr-FR')}</TableCell>
                        <TableCell>{(creance.remainingAmount || 0).toLocaleString('fr-FR')}</TableCell>
                        <TableCell>
                          {dueDate ? dueDate.toLocaleDateString("fr-FR") : "N/A"}
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Relancer">
                            <IconButton onClick={() => setSelectedRelanceCreance(creance)} sx={{ color: "#f57c00" }}>
                              <WhatsAppIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Encaisser / Partiel">
                            <IconButton
                              onClick={() => handleOpenTerminateDialog(creance)}
                              sx={{ color: "#43a047" }}
                              disabled={confirmingTermination && creanceToTerminate?.id === creance.id}
                            >
                              {confirmingTermination && creanceToTerminate?.id === creance.id ? <CircularProgress size={22} color="inherit"/> : <CheckCircleIcon />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Voir Détails de la Créance">
                            <IconButton onClick={() => setSelectedCreance(creance)} sx={{ color: "#d32f2f" }}>
                              <VisibilityIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Copier données">
                            <IconButton onClick={() => copyClientData(creance)} sx={{ color: "#0288d1" }}>
                              <ContentCopyIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
          )}
          {hasMoreCreances && !loadingLists && creances.length > 0 && (
            <Button onClick={() => boutiqueId && fetchCreances(boutiqueId, true)} sx={{ mt: 2, color: "#d32f2f" }}>
              Charger plus de créances
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Dialog Relance */}
      <Dialog open={Boolean(selectedRelanceCreance)} onClose={() => setSelectedRelanceCreance(null)} TransitionComponent={Fade} transitionDuration={300}>
        <DialogTitle sx={{ bgcolor: "#f57c00", color: "white", py: 2, fontFamily: "Poppins, sans-serif" }}>
          Relancer le client : {selectedRelanceCreance?.clientNom}
        </DialogTitle>
        <DialogContent sx={{ mt: 2, pt: "16px !important" }}>
          {selectedRelanceCreance && (
            <Box>
              <Typography variant="body1" sx={{ mb: 2, bgcolor: "#f5f5f5", p: 2, borderRadius: 1, fontFamily: "Poppins, sans-serif", whiteSpace: 'pre-wrap' }}>
                {generateRelanceMessage(selectedRelanceCreance)}
              </Typography>
              <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} justifyContent="center">
                <Button variant="contained" startIcon={<WhatsAppIcon />} onClick={() => sendWhatsAppMessage(selectedRelanceCreance)} sx={{ bgcolor: "#25D366", "&:hover": { bgcolor: "#1EBE5A" } }}>
                  Envoyer via WhatsApp
                </Button>
                <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => copyMessageToClipboard(selectedRelanceCreance)} sx={{ color: "#f57c00", borderColor: "#f57c00" }}>
                  Copier le message
                </Button>
                <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => copyClientData(selectedRelanceCreance)} sx={{ color: "#0288d1", borderColor: "#0288d1" }}>
                  Copier les données
                </Button>
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedRelanceCreance(null)} color="primary">Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Détails Créance */}
      <Dialog open={Boolean(selectedCreance)} onClose={() => setSelectedCreance(null)} TransitionComponent={Fade} transitionDuration={300}>
        <DialogTitle sx={{ bgcolor: "#d32f2f", color: "white", py: 2, fontFamily:"Poppins, sans-serif" }}>
          Détails de la Créance
        </DialogTitle>
        <DialogContent sx={{ mt: 2, pt: "16px !important" }}>
          {selectedCreance && (
            <Box>
              <Typography fontFamily="Poppins, sans-serif"><strong>Client:</strong> {selectedCreance.clientNom}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Téléphone:</strong> {selectedCreance.clientTelephone}</Typography>
              <Typography component="div" fontFamily="Poppins, sans-serif"><strong>Vente ID:</strong> 
                <Button size="small" onClick={() => { openSaleFromCreance(selectedCreance.saleId); }} sx={{ ml:0, color: "#d32f2f", textTransform: "none", p: 0, verticalAlign: 'baseline', display:'inline' }}>
                  {selectedCreance.saleId.substring(0,12)}... (Voir détails)
                </Button>
              </Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Montant Total (Vente):</strong> {(selectedCreance.grandTotal || 0).toLocaleString('fr-FR')}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Montant Payé (sur créance avant):</strong> {(selectedCreance.paidAmount || 0).toLocaleString('fr-FR')}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Montant Restant (sur créance):</strong> {(selectedCreance.remainingAmount || 0).toLocaleString('fr-FR')}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Date Limite:</strong> {selectedCreance.dueDate ? selectedCreance.dueDate.toDate().toLocaleDateString("fr-FR") : "N/A"}</Typography>
              <Typography fontFamily="Poppins, sans-serif"><strong>Statut actuel:</strong> {selectedCreance.status}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedCreance(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Terminer / Paiement Partiel Créance */}
      <Dialog open={Boolean(creanceToTerminate)} onClose={() => !confirmingTermination && setCreanceToTerminate(null)}>
        <DialogTitle fontFamily="Poppins, sans-serif">Enregistrer un paiement sur la créance</DialogTitle>
        <DialogContent>
          <Typography fontFamily="Poppins, sans-serif" sx={{ mb: 2 }}>
            Vous pouvez saisir un montant pour enregistrer un **paiement partiel** (avance) ou saisir le montant restant pour marquer la créance comme **payée**.
          </Typography>

          <Typography fontFamily="Poppins, sans-serif" sx={{ mb: 1 }}>
            Montant restant : <strong>{(creanceToTerminate?.remainingAmount || 0).toLocaleString('fr-FR')} {devise}</strong>
          </Typography>

          <TextField
            label="Montant à encaisser"
            type="number"
            inputProps={{ step: "0.01", min: 0 }}
            value={paymentAmount === "" ? "" : String(paymentAmount)}
            onChange={(e) => {
              const v = e.target.value;
              // Allow empty input too
              setPaymentAmount(v === "" ? "" : Number(v));
            }}
            fullWidth
            sx={{ mb: 1 }}
          />

          <Typography variant="body2" sx={{ mt: 1 }}>
            Si le montant saisi est inférieur au montant restant, la créance restera en attente avec le reste à payer.
          </Typography>

          <Typography variant="body2" sx={{ mt: 1 }}>
            Cela mettra à jour la vente, la caisse et les statistiques de ventes pour le montant encaissé.
          </Typography>

        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreanceToTerminate(null); setPaymentAmount(""); }} color="primary" disabled={confirmingTermination}>Annuler</Button>
          <Button onClick={handleConfirmTerminateCreance} color="success" variant="contained" disabled={confirmingTermination}>
            {confirmingTermination ? <CircularProgress size={24} color="inherit"/> : "Enregistrer le paiement"}
          </Button>
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

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={() => setSnackbarOpen(false)} message={snackbarMessage} />
    </Box>
  );
}
