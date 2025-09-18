"use client";

import React, { useState, useEffect, useMemo, useCallback, JSX } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  Timestamp,
  orderBy,
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
  writeBatch,
  // NOUVEAU: FirestoreError pour un typage plus précis des erreurs Firebase
  FirestoreError,
} from "firebase/firestore";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  CircularProgress,
  Paper,
  useTheme,
  useMediaQuery,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Grid,
  Alert,
} from "@mui/material";
import { Theme } from "@mui/material/styles";
import { ButtonProps } from "@mui/material/Button";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import frLocale from "date-fns/locale/fr";
import SalesDetails from "@/components/SalesDetails";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { motion } from "framer-motion";

import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockIcon from "@mui/icons-material/Lock";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import PaymentIcon from '@mui/icons-material/Payment';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AddBoxIcon from '@mui/icons-material/AddBox';
import TransferWithinAStationIcon from '@mui/icons-material/TransferWithinAStation';
import StorefrontIcon from '@mui/icons-material/Storefront';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import SubdirectoryArrowLeftIcon from '@mui/icons-material/SubdirectoryArrowLeft';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Types
interface UserProfile {
  fullName: string;
}

interface BoutiqueData {
  nom: string;
  logoUrl?: string;
  devise: string;
  utilisateursIds: string[];
}

interface CaisseData {
  solde: number;
  status: "ouvert" | "fermé";
}

interface SousCaisseData {
  nom: string;
  solde: number;
  createdAt?: Timestamp;
  createdBy?: string;
}

type TransactionType =
  | "entrée"
  | "sortie"
  | "vente"
  | "paiement_vente"
  | "dépense"
  | "virement_interne"
  | "virement_recu";

interface BaseTransaction {
  id: string;
  type: TransactionType;
  montant: number;
  ancienSolde: number;
  nouveauSolde: number;
  description?: string;
  userId: string;
  timestamp: Timestamp;
  saleId?: string;
  details?: Record<string, unknown>;
}

// Type pour l'écriture, commentaire est optionnel
interface BaseTransactionWrite extends Omit<BaseTransaction, 'id' | 'description'> {
  description?: string;
  details?: Record<string, unknown>;
}

interface TransactionView extends Omit<BaseTransaction, 'timestamp' | 'userId'> {
  timestamp: Date;
  userFullName: string;
  userId?: string;
}

interface OnOff {
  id: string;
  type: "ouverture" | "fermeture";
  solde: number;
  userId: string;
  timestamp: Timestamp;
  commentaire?: string;
}

// Type pour l'écriture, commentaire est optionnel
interface OnOffWrite extends Omit<OnOff, 'id' | 'commentaire'> {
  commentaire?: string;
}

interface OnOffView extends Omit<OnOff, 'timestamp' | 'userId'> {
  timestamp: Date;
  userFullName: string;
}

interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

interface ActionButtonConfig {
  label: string;
  icon: JSX.Element;
  type: TransactionType | "ouverture" | "fermeture";
  color: ButtonProps['color'];
  disabled: boolean;
  variant?: ButtonProps['variant'];
}

const TRANSACTIONS_ITEMS_PER_PAGE = 10;
const ONOFF_ITEMS_PER_PAGE = 5;

const toDate = (timestamp: Timestamp | undefined | null): Date | null => {
  if (timestamp && typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }
  return null;
};

const getTransactionTypeStyle = (type: TransactionType, currentTheme: Theme) => {
  switch (type) {
    case "vente": case "paiement_vente": case "entrée":
    case "virement_recu":
      return { color: currentTheme.palette.success.main, icon: <ArrowUpwardIcon fontSize="inherit" sx={{ mr: 0.5 }} /> };
    case "dépense": case "sortie": case "virement_interne":
      return { color: currentTheme.palette.error.main, icon: <ArrowDownwardIcon fontSize="inherit" sx={{ mr: 0.5 }} /> };
    default:
      return { color: currentTheme.palette.text.secondary, icon: <ReceiptLongIcon fontSize="inherit" sx={{ mr: 0.5 }} /> };
  }
};

const FONT_FAMILY = "'Poppins', sans-serif";

export default function CashRegister() {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));

  const [user, loadingAuth, authError] = useAuthState(auth); // authError peut être utile
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [caisseId, setCaisseId] = useState<string | null>(null);
  const [devise, setDevise] = useState("EUR");
  const [boutiqueName, setBoutiqueName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [solde, setSolde] = useState(0);
  const [status, setStatus] = useState<"ouvert" | "fermé">("fermé");

  const [transactions, setTransactions] = useState<TransactionView[]>([]);
  const [onOffs, setOnOffs] = useState<OnOffView[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  const [loadingBoutique, setLoadingBoutique] = useState(true); // Reste true tant que les infos user/boutique/caisse ne sont pas finalisées
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingOnOffs, setLoadingOnOffs] = useState(false);

  const [filterRange, setFilterRange] = useState<"today" | "week" | "month" | "all">("today");

  const [lastVisibleTransaction, setLastVisibleTransaction] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [transactionsCurrentPage, setTransactionsCurrentPage] = useState(1);

  const [lastVisibleOnOff, setLastVisibleOnOff] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreOnOffs, setHasMoreOnOffs] = useState(true);
  const [onOffsCurrentPage, setOnOffsCurrentPage] = useState(1);

  const [openModal, setOpenModal] = useState(false);
  const [modalType, setModalType] = useState<TransactionType | "ouverture" | "fermeture">("entrée");
  const [modalMontant, setModalMontant] = useState(0);
  const [modalDescription, setModalDescription] = useState("");

  const [saleIdForRow, setSaleIdForRow] = useState<string | null>(null);
  const [openSaleDetail, setOpenSaleDetail] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ---------- NOUVEAU: états pour sous-caisses ----------
  const [sousCaisses, setSousCaisses] = useState<Array<{ id: string; data: SousCaisseData }>>([]);
  const [sousCaissesLoading, setSousCaissesLoading] = useState(false);
  const [openSubCaisseDialog, setOpenSubCaisseDialog] = useState(false);
  const [newSubCaisseName, setNewSubCaisseName] = useState("");
  const [newSubCaisseInitial, setNewSubCaisseInitial] = useState<number>(0);

  const [openVirementDialog, setOpenVirementDialog] = useState(false);
  const [virementMontant, setVirementMontant] = useState<number>(0);
  const [virementTargetId, setVirementTargetId] = useState<string | null>(null); // id de la sous-caisse cible
  const [virementTargetName, setVirementTargetName] = useState<string>("");
  const [virementDirection, setVirementDirection] = useState<'mainToSub'|'subToMain'>('mainToSub');

  // Décaissement sous-caisse
  const [openDecaisseDialog, setOpenDecaisseDialog] = useState(false);
  const [decaisseMontant, setDecaisseMontant] = useState<number>(0);
  const [decaisseSubId, setDecaisseSubId] = useState<string | null>(null);
  const [decaisseSubName, setDecaisseSubName] = useState<string>("");

  // -----------------------------------------------------

  useEffect(() => {
    if (authError) {
      console.error("Erreur d'authentification:", authError);
      setGlobalError(`Erreur d'authentification: ${authError.message}`);
      setLoadingBoutique(false); // Arrêter le chargement si l'auth échoue
    }
  }, [authError]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const map: Record<string, string> = {};
        usersSnap.forEach((docSnap) => {
          const data = docSnap.data() as UserProfile;
          map[docSnap.id] = data.fullName || `Utilisateur ${docSnap.id.substring(0,5)}`;
        });
        setUsersMap(map);
      } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        setGlobalError("Impossible de charger les données des utilisateurs.");
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!user || loadingAuth) { // Si pas d'utilisateur ou authentification en cours
      if (!loadingAuth) setLoadingBoutique(false); // Si user est null (déconnecté), on arrête le chargement de la boutique
      return;
    }
    // setLoadingBoutique est déjà true par défaut, ou si user change.
    // On le remet à true explicitement si user vient de se connecter.
    setLoadingBoutique(true); 
    setGlobalError(null); // Reset error on user change

    const qBoutique = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid),
      limit(1)
    );

    const unsubBoutique = onSnapshot(qBoutique, (boutiqueSnap) => {
      if (!boutiqueSnap.empty) {
        const bDoc = boutiqueSnap.docs[0];
        const bData = bDoc.data() as BoutiqueData;
        setBoutiqueId(bDoc.id);
        setBoutiqueName(bData.nom || "Nom de boutique manquant");
        setLogoUrl(bData.logoUrl);
        setDevise(bData.devise || "EUR");

        const caissesRef = collection(db, "boutiques", bDoc.id, "caisse");
        const qCaisse = query(caissesRef, limit(1));
        
        const unsubCaisse = onSnapshot(qCaisse, (caisseSnap) => {
          if (!caisseSnap.empty) {
            const cDoc = caisseSnap.docs[0];
            const cData = cDoc.data() as CaisseData;
            setCaisseId(cDoc.id);
            setSolde(cData.solde ?? 0);
            setStatus(cData.status ?? "fermé");
          } else {
            setCaisseId(null); setSolde(0); setStatus("fermé");
            setGlobalError("Aucune caisse trouvée pour cette boutique. Veuillez en initialiser une.");
          }
          setLoadingBoutique(false); // Chargement des infos de base terminé
        }, (error: FirestoreError) => {
          console.error("Erreur de chargement de la caisse:", error);
          setGlobalError(`Erreur de chargement des infos de la caisse: ${error.message}`);
          setLoadingBoutique(false);
        });
        return () => unsubCaisse();
      } else {
        setBoutiqueId(null); setCaisseId(null);
        setGlobalError("Aucune boutique n'est associée à cet utilisateur.");
        setLoadingBoutique(false);
      }
    }, (error: FirestoreError) => {
      console.error("Erreur de chargement de la boutique:", error);
      setGlobalError(`Erreur de chargement des infos de la boutique: ${error.message}`);
      setLoadingBoutique(false);
    });
    return () => unsubBoutique();
  }, [user, loadingAuth]); // Dépend de user et loadingAuth

  // ---------- NOUVEAU: sous-caisses subscription ----------
  useEffect(() => {
    if (!boutiqueId) {
      setSousCaisses([]);
      setSousCaissesLoading(false);
      return;
    }
    setSousCaissesLoading(true);
    const q = query(collection(db, "boutiques", boutiqueId, "sousCaisses"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: Array<{id:string; data: SousCaisseData}> = snap.docs.map(d => ({ id: d.id, data: d.data() as SousCaisseData }));
      setSousCaisses(arr);
      setSousCaissesLoading(false);
    }, (err) => {
      console.error("Erreur chargement sous-caisses:", err);
      setSousCaissesLoading(false);
    });
    return () => unsub();
  }, [boutiqueId]);
  // ------------------------------------------------------

  const fetchOnOffs = useCallback(async (reset: boolean = false): Promise<boolean> => {
    if (!boutiqueId || !caisseId || Object.keys(usersMap).length === 0) {
        if(reset) {
          setOnOffs([]);
          setOnOffsCurrentPage(1);
          setLastVisibleOnOff(null); // CORRECTION: S'assurer de réinitialiser lastVisible aussi
        }
        setLoadingOnOffs(false); 
        setHasMoreOnOffs(false);
        return false;
    }
    setLoadingOnOffs(true);
    let qBase = query(
      collection(db, "boutiques", boutiqueId, "caisse", caisseId, "onnoff"),
      orderBy("timestamp", "desc")
    );
    
    let q;
    if (reset) {
      setOnOffsCurrentPage(1);
      setLastVisibleOnOff(null); // Réinitialisation explicite
      q = query(qBase, limit(ONOFF_ITEMS_PER_PAGE));
    } else if (lastVisibleOnOff) {
      q = query(qBase, startAfter(lastVisibleOnOff), limit(ONOFF_ITEMS_PER_PAGE));
    } else { // Cas initial ou reset sans lastVisible (ne devrait pas arriver si reset gère bien)
      q = query(qBase, limit(ONOFF_ITEMS_PER_PAGE));
    }


    try {
      const snap = await getDocs(q);
      const newOnOffs = snap.docs.map((d) => {
        const data = d.data() as OnOff;
        return { id: d.id, ...data, timestamp: toDate(data.timestamp) || new Date(0), userFullName: usersMap[data.userId] || "Inconnu" } as OnOffView;
      });

      if (newOnOffs.length > 0) {
        setOnOffs(prev => reset ? newOnOffs : [...prev, ...newOnOffs]);
        if (!reset) setOnOffsCurrentPage(prev => prev + 1);
      }
      
      setLastVisibleOnOff(snap.docs[snap.docs.length - 1] || null);
      setHasMoreOnOffs(snap.docs.length === ONOFF_ITEMS_PER_PAGE);
      return newOnOffs.length > 0;
    } catch (error) {
      console.error("Erreur de chargement des OnOffs:", error);
      setGlobalError("Erreur lors du chargement des opérations O/F.");
      setHasMoreOnOffs(false);
      return false;
    } finally { setLoadingOnOffs(false); }
  }, [boutiqueId, caisseId, usersMap, lastVisibleOnOff]); // lastVisibleOnOff est une dépendance

  const fetchTransactions = useCallback(async (reset: boolean = false): Promise<boolean> => {
    if (!boutiqueId || !caisseId || Object.keys(usersMap).length === 0) {
        if(reset) {
          setTransactions([]);
          setTransactionsCurrentPage(1);
          setLastVisibleTransaction(null); // CORRECTION: S'assurer de réinitialiser lastVisible aussi
        }
        setLoadingTransactions(false); 
        setHasMoreTransactions(false);
        return false;
    }
    setLoadingTransactions(true);
    let qBase = query(
      collection(db, "boutiques", boutiqueId, "caisse", caisseId, "transactions"),
      orderBy("timestamp", "desc")
    );

    let q;
    if (reset) {
      setTransactionsCurrentPage(1);
      setLastVisibleTransaction(null); // Réinitialisation explicite
      q = query(qBase, limit(TRANSACTIONS_ITEMS_PER_PAGE));
    } else if (lastVisibleTransaction) {
      q = query(qBase, startAfter(lastVisibleTransaction), limit(TRANSACTIONS_ITEMS_PER_PAGE));
    } else {
      q = query(qBase, limit(TRANSACTIONS_ITEMS_PER_PAGE));
    }
    

    try {
      const snap = await getDocs(q);
      const newTransactions = snap.docs.map((d) => {
        const data = d.data() as BaseTransaction;
        return { id: d.id, ...data, timestamp: toDate(data.timestamp) || new Date(0), userFullName: usersMap[data.userId] || "Inconnu", userId: data.userId } as TransactionView;
      });
      
      if (newTransactions.length > 0) {
        setTransactions(prev => reset ? newTransactions : [...prev, ...newTransactions]);
        if (!reset) setTransactionsCurrentPage(prev => prev + 1);
      }

      setLastVisibleTransaction(snap.docs[snap.docs.length - 1] || null);
      setHasMoreTransactions(snap.docs.length === TRANSACTIONS_ITEMS_PER_PAGE);
      return newTransactions.length > 0;
    } catch (error) {
      console.error("Erreur de chargement des transactions:", error);
      setGlobalError("Erreur lors du chargement des transactions.");
      setHasMoreTransactions(false);
      return false;
    } finally { setLoadingTransactions(false); }
  }, [boutiqueId, caisseId, usersMap, lastVisibleTransaction]); // lastVisibleTransaction est une dépendance

  useEffect(() => {
    // Ce hook est pour le chargement initial des listes une fois que les IDs et usersMap sont prêts
    if (boutiqueId && caisseId && Object.keys(usersMap).length > 0) {
      // On ne reset lastVisible ici que si on veut forcer un re-fetch total
      // fetchTransactions(true) et fetchOnOffs(true) s'occupent déjà de réinitialiser
      // leur propre lastVisible respectif.
      fetchTransactions(true); 
      fetchOnOffs(true);
    } else if (!boutiqueId || !caisseId) { 
        // Si pas de boutique/caisse, on vide les listes et désactive la pagination
        setTransactions([]);
        setOnOffs([]);
        setHasMoreTransactions(false);
        setHasMoreOnOffs(false);
        setLastVisibleTransaction(null);
        setLastVisibleOnOff(null);
    }
  // On enlève fetchOnOffs et fetchTransactions des dépendances ici,
  // car elles causent des re-fetch inutiles si elles changent à cause de lastVisible...
  // Le re-fetch est déclenché par le changement de boutiqueId, caisseId, ou usersMap.
  // Les appels suivants (pagination) sont manuels.
  }, [boutiqueId, caisseId, usersMap]);


  const filterDate = useCallback((date: Date | null) => {
    if (!date || isNaN(date.getTime())) return false;
    if (filterRange === "today") return isToday(date);
    if (filterRange === "week") return isThisWeek(date, { locale: frLocale });
    if (filterRange === "month") return isThisMonth(date, { locale: frLocale });
    return true;
  }, [filterRange]);

  const filteredOnOffs = useMemo(() => onOffs.filter(o => filterDate(o.timestamp)), [onOffs, filterDate]);
  const filteredTxs = useMemo(() => transactions.filter(t => filterDate(t.timestamp)), [transactions, filterDate]);

  const chartData = useMemo(() => {
    const allOpsForChart = [
      ...onOffs.map((o) => ({ date: o.timestamp, solde: o.solde })),
      ...transactions.map((t) => ({date: t.timestamp, solde: t.nouveauSolde })),
    ].filter(item => item.date instanceof Date && !isNaN(item.date.getTime()));
    allOpsForChart.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    return allOpsForChart.map((item) => ({
      date: item.date ? format(item.date, "dd/MM HH:mm", { locale: frLocale }) : "Date inconnue",
      solde: item.solde,
    }));
  }, [onOffs, transactions]);

  const handleFilterChange = (_event: React.MouseEvent<HTMLElement>, newFilter: "today" | "week" | "month" | "all" | null) => {
    if (newFilter) setFilterRange(newFilter);
  };
  
  const onOffCols: GridColDef<OnOffView>[] = [
    { field: "timestamp", headerName: "Date", width: 160, renderCell: (params: GridRenderCellParams<OnOffView, Date>) => params.value ? format(params.value, "dd MMM yyyy HH:mm", { locale: frLocale }) : "", },
    { field: "type", headerName: "Action", width: 100, renderCell: (params: GridRenderCellParams<OnOffView, "ouverture" | "fermeture">) => (<Chip label={params.value === "ouverture" ? "Ouverture" : "Fermeture"} color={params.value === "ouverture" ? "success" : "error"} size="small" sx={{ fontFamily: FONT_FAMILY }}/> )},
    { field: "solde", headerName: `Solde (${devise})`, width: 120, type: 'number', renderCell: (params: GridRenderCellParams<OnOffView, number>) => (params.value ?? 0).toFixed(2), },
    { field: "userFullName", headerName: "Utilisateur", width: 150 },
    { field: "commentaire", headerName: "Commentaire", flex:1, renderCell: (params: GridRenderCellParams<OnOffView, string | undefined>) => params.value || "—" }
  ];

  const txCols: GridColDef<TransactionView>[] = [
    { field: "timestamp", headerName: "Date", width: 160, renderCell: (params: GridRenderCellParams<TransactionView, Date>) => params.value ? format(params.value, "dd MMM yyyy HH:mm", { locale: frLocale }) : "" },
    { field: "type", headerName: "Type", width: 180,
      renderCell: (params: GridRenderCellParams<TransactionView, TransactionType>) => {
        const style = getTransactionTypeStyle(params.value, theme);
        let label: string;
        const type = params.row.type; 
        const saleId = params.row.saleId;

        if (saleId) {
            if (type === "vente") label = "Vente";
            else if (type === "paiement_vente") label = "Paiement Vente";
            else if (type === "sortie") label = "Remb. Vente"; // typiquement une sortie liée à une vente est un remboursement
            else label = type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ");
        } else {
            if (type === "entrée") label = "Entrée manuelle";
            else if (type === "sortie") label = "Sortie manuelle";
            else if (type === "dépense") label = "Dépense";
            else if (type === "virement_interne") label = "Virement -> Sous-caisse";
            else if (type === "virement_recu") label = "Virement reçu";
            else label = type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ");
        }
        return (<Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', color: style.color, fontFamily: FONT_FAMILY }}> {style.icon} {label} </Typography>);
      },
    },
    { field: "montant", headerName: `Montant (${devise})`, width: 120, type: 'number', renderCell: (params: GridRenderCellParams<TransactionView, number>) => (params.value ?? 0).toFixed(2) },
    { field: "nouveauSolde", headerName: `Nouveau Solde (${devise})`, width: 140, type: 'number', renderCell: (params: GridRenderCellParams<TransactionView, number>) => (params.value ?? 0).toFixed(2) },
    { field: "description", headerName: "Motif", flex:1, minWidth: 150, renderCell: (params: GridRenderCellParams<TransactionView, string | undefined>) => {
        const details = (params.row as TransactionView).details as Record<string, any> | undefined;
        const fromSub = details?.fromSousCaisseId;
        return (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography noWrap>{params.value || "—"}</Typography>
            {fromSub && <Chip label="Depuis sous-caisse" size="small" color="warning" sx={{ ml: 1 }} />}
          </Stack>
        );
      } 
    },
    { field: "userFullName", headerName: "Utilisateur", width: 150 },
    { field: "saleId", headerName: "Vente", width: 100,
      renderCell: (params: GridRenderCellParams<TransactionView, string | undefined>) => params.value ? (<Button size="small" variant="outlined" onClick={() => { setSaleIdForRow(params.value as string); setOpenSaleDetail(true);}} sx={{fontFamily: FONT_FAMILY, textTransform: 'none'}}> Voir </Button>) : null,
    },
  ];

  const handleOperation = async () => {
    if (!boutiqueId || !caisseId || !user || !user.uid) { setGlobalError("Infos de session manquantes."); return; }
    if (modalType === "ouverture" && status === "ouvert") { alert("Caisse déjà ouverte."); return; }
    if (modalType === "fermeture" && status === "fermé") { alert("Caisse déjà fermée."); return; }

    const currentTimestamp = Timestamp.now();
    const batch = writeBatch(db);
    const caisseDocRef = doc(db, "boutiques", boutiqueId, "caisse", caisseId);
    
    const trimmedDescription = modalDescription.trim(); // Utile pour les deux types d'opérations

    if (modalType === "ouverture" || modalType === "fermeture") {
      const newStatus = modalType === "ouverture" ? "ouvert" : "fermé";
      
      const onOffPayload: OnOffWrite = {
        type: modalType,
        solde: solde, // Solde au moment de l'action
        userId: user.uid,
        timestamp: currentTimestamp,
      };
      // CORRECTION FirebaseError: N'ajoute le champ commentaire que s'il n'est pas vide
      if (trimmedDescription) {
        onOffPayload.commentaire = trimmedDescription;
      }
      
      batch.update(caisseDocRef, { status: newStatus });
      batch.set(doc(collection(db, "boutiques", boutiqueId, "caisse", caisseId, "onnoff")), onOffPayload);

    } else { // Transaction types: "entrée", "sortie", "vente", "paiement_vente", "dépense", "virement_interne" handled separately by virement flow
      if (modalMontant <= 0) { alert("Le montant doit être positif."); return; }
      
      // Pour "sortie" manuelle (pas "dépense" ou "remb. vente"), description est obligatoire.
      if (modalType === "sortie" && !trimmedDescription) { 
          alert("Un motif/description est obligatoire pour une sortie manuelle."); return; 
      }

      const estEntree = ["entrée", "vente", "paiement_vente"].includes(modalType);
      const nouveauSoldeCalcul = solde + (estEntree ? modalMontant : -modalMontant);
      
      const transactionPayload: BaseTransactionWrite = {
        type: modalType as TransactionType, 
        montant: modalMontant, 
        ancienSolde: solde, 
        nouveauSolde: nouveauSoldeCalcul, 
        userId: user.uid,
        timestamp: currentTimestamp,
      };
      // N'ajoute le champ description que s'il n'est pas vide
      if (trimmedDescription) {
        transactionPayload.description = trimmedDescription;
      }

      batch.update(caisseDocRef, { solde: nouveauSoldeCalcul });
      batch.set(doc(collection(db, "boutiques", boutiqueId, "caisse", caisseId, "transactions")), transactionPayload);
    }

    try {
      await batch.commit();
      setOpenModal(false); setModalMontant(0); setModalDescription("");
      
      // Recharger les listes concernées
      if (["entrée", "sortie", "vente", "paiement_vente", "dépense"].includes(modalType)) {
        fetchTransactions(true);
      }
      if (modalType === "ouverture" || modalType === "fermeture") {
        fetchOnOffs(true);
      }
    } catch (error) { 
        console.error("Erreur enregistrement opération: ", error); 
        const firebaseError = error as FirestoreError;
        alert(`Erreur lors de l'enregistrement. Message: ${firebaseError.message || String(error)}`); 
    }
  };
  
  const handleDownloadPDF = async () => {
    if (!boutiqueName) { alert("Nom de la boutique non disponible."); return; }
    const docPDF = new jsPDF() as JsPDFWithAutoTable;
    docPDF.setFont(undefined, 'normal'); 
    docPDF.text(`Rapport de Caisse - ${boutiqueName}`, 14, 15);
    docPDF.text(`Période: ${filterRange}`, 14, 22);
    docPDF.text(`Date d'export: ${format(new Date(), "dd/MM/yyyy HH:mm", {locale: frLocale})}`, 14, 29);
    autoTable(docPDF, { 
        startY: 40, 
        head: [['Date', 'Action', `Solde (${devise})`, 'Utilisateur', 'Commentaire']], 
        body: filteredOnOffs.map(o => [ o.timestamp ? format(o.timestamp, "dd/MM HH:mm", {locale: frLocale}) : 'N/A', o.type === "ouverture" ? "Ouverture" : "Fermeture", o.solde.toFixed(2), o.userFullName, o.commentaire || '-' ]), 
        theme: 'grid', 
        headStyles: { fillColor: [22, 160, 133] } 
    });
    
    const autoTableFinalY = docPDF.lastAutoTable ? docPDF.lastAutoTable.finalY : 40;

    autoTable(docPDF, { 
        startY: autoTableFinalY + 10, 
        head: [['Date', 'Type', 'Motif', `Montant (${devise})`, `Nouveau Solde (${devise})`, 'Utilisateur']], 
        body: filteredTxs.map(t => {
            let label: string;
            if (t.saleId) {
                if (t.type === "vente") label = "Vente";
                else if (t.type === "paiement_vente") label = "Paiement Vente";
                else if (t.type === "sortie") label = "Remb. Vente";
                else label = t.type;
            } else {
                if (t.type === "entrée") label = "Entrée manuelle";
                else if (t.type === "sortie") label = "Sortie manuelle";
                else if (t.type === "dépense") label = "Dépense";
                else if (t.type === "virement_interne") label = "Virement -> Sous-caisse";
                else if (t.type === "virement_recu") label = "Virement reçu";
                else label = t.type;
            }
            return [ 
                t.timestamp ? format(t.timestamp, "dd/MM HH:mm", {locale: frLocale}) : 'N/A', 
                label, 
                t.description || '-', 
                t.montant.toFixed(2), 
                t.nouveauSolde.toFixed(2), 
                t.userFullName 
            ];
        }), 
        theme: 'striped', 
        headStyles: { fillColor: [41, 128, 185] } 
    });
    docPDF.save(`caisse-${boutiqueName.replace(/\s+/g, '_')}-${filterRange}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // ---------- NOUVEAU: création de sous-caisse ----------
  const handleCreateSubCaisse = async () => {
    if (!boutiqueId || !caisseId || !user) { setGlobalError("Infos manquantes pour créer la sous-caisse."); return; }
    if (!newSubCaisseName.trim()) { alert("Nom de la sous-caisse requis."); return; }
    const initial = Number(newSubCaisseInitial) || 0;
    const batch = writeBatch(db);
    const sousCaisseRef = doc(collection(db, "boutiques", boutiqueId, "sousCaisses")); // nouveau doc ref
    const caisseRef = doc(db, "boutiques", boutiqueId, "caisse", caisseId);
    const now = Timestamp.now();

    const sousCaissePayload: SousCaisseData = {
      nom: newSubCaisseName.trim(),
      solde: initial,
      createdAt: now,
      createdBy: user.uid,
    };
    batch.set(sousCaisseRef, sousCaissePayload);

    if (initial > 0) {
      // Débiter la caisse principale et ajouter transaction virement_interne
      const caisseNewSolde = (solde || 0) - initial;
      batch.update(caisseRef, { solde: caisseNewSolde });

      const txMain: BaseTransactionWrite = {
        type: "virement_interne",
        montant: initial,
        ancienSolde: solde || 0,
        nouveauSolde: caisseNewSolde,
        userId: user.uid,
        timestamp: now,
        description: `Initialisation sous-caisse ${newSubCaisseName.trim()}`,
        details: {
          sousCaisseId: sousCaisseRef.id,
          sousCaisseNom: newSubCaisseName.trim(),
        },
      };
      batch.set(doc(collection(db, "boutiques", boutiqueId, "caisse", caisseId, "transactions")), txMain);

      // Créer une transaction côté sous-caisse pour historique
      const txSous: BaseTransactionWrite = {
        type: "virement_recu",
        montant: initial,
        ancienSolde: 0,
        nouveauSolde: initial,
        userId: user.uid,
        timestamp: now,
        description: `Solde initial depuis caisse principale`,
        details: {
          fromCaisseId: caisseId,
        },
      };
      batch.set(doc(collection(db, "boutiques", boutiqueId, "sousCaisses", sousCaisseRef.id, "transactions")), txSous);
    }

    try {
      await batch.commit();
      setNewSubCaisseName("");
      setNewSubCaisseInitial(0);
      setOpenSubCaisseDialog(false);
      // solde sera mis à jour par subscription à la caisse et à la liste sousCaisses (onSnapshot)
    } catch (err) {
      console.error("Erreur création sous-caisse:", err);
      alert("Erreur lors de la création de la sous-caisse.");
    }
  };
  // ---------------------------------------------------------

  // ---------- NOUVEAU: virement (deux sens) ----------
  const handleVirementConfirm = async () => {
    if (!boutiqueId || !caisseId || !user || !virementTargetId) { setGlobalError("Infos manquantes pour le virement."); return; }
    const amount = Number(virementMontant) || 0;
    if (amount <= 0) { alert("Montant du virement doit être > 0"); return; }

    const localSous = sousCaisses.find(s => s.id === virementTargetId);
    const oldSousSolde = localSous ? (localSous.data.solde || 0) : 0;
    const now = Timestamp.now();
    const batch = writeBatch(db);
    const caisseRef = doc(db, "boutiques", boutiqueId, "caisse", caisseId);
    const sousRef = doc(db, "boutiques", boutiqueId, "sousCaisses", virementTargetId);

    if (virementDirection === 'mainToSub') {
      if (amount > (solde || 0)) { alert("Montant supérieur au solde de la caisse."); return; }
      const caisseNew = (solde || 0) - amount;
      const newSousSolde = oldSousSolde + amount;

      // Update caisse & sous
      batch.update(caisseRef, { solde: caisseNew });
      batch.update(sousRef, { solde: newSousSolde });

      // transaction in main caisse (virement_interne)
      const txMain: BaseTransactionWrite = {
        type: "virement_interne",
        montant: amount,
        ancienSolde: solde || 0,
        nouveauSolde: caisseNew,
        userId: user.uid,
        timestamp: now,
        description: `Virement vers sous-caisse ${virementTargetName}`,
        details: {
          targetSousCaisseId: virementTargetId,
          targetSousCaisseNom: virementTargetName,
        },
      };
      batch.set(doc(collection(db, "boutiques", boutiqueId, "caisse", caisseId, "transactions")), txMain);

      // transaction in sous-caisse (virement_recu)
      const txSous: BaseTransactionWrite = {
        type: "virement_recu",
        montant: amount,
        ancienSolde: oldSousSolde,
        nouveauSolde: newSousSolde,
        userId: user.uid,
        timestamp: now,
        description: `Virement reçu depuis caisse principale`,
        details: {
          fromCaisseId: caisseId,
          fromBoutique: boutiqueId,
        },
      };
      batch.set(doc(collection(db, "boutiques", boutiqueId, "sousCaisses", virementTargetId, "transactions")), txSous);
    } else {
      // subToMain
      if (amount > oldSousSolde) { alert("Montant supérieur au solde de la sous-caisse."); return; }
      const newSousSolde = oldSousSolde - amount;
      const caisseNew = (solde || 0) + amount;

      // Update sous & caisse
      batch.update(sousRef, { solde: newSousSolde });
      batch.update(caisseRef, { solde: caisseNew });

      // transaction in sous-caisse (virement_interne)
      const txSous: BaseTransactionWrite = {
        type: "virement_interne",
        montant: amount,
        ancienSolde: oldSousSolde,
        nouveauSolde: newSousSolde,
        userId: user.uid,
        timestamp: now,
        description: `Virement vers caisse principale`,
        details: {
          toCaisseId: caisseId,
          toBoutique: boutiqueId,
        },
      };
      batch.set(doc(collection(db, "boutiques", boutiqueId, "sousCaisses", virementTargetId, "transactions")), txSous);

      // transaction in main caisse (virement_recu)
      const txMain: BaseTransactionWrite = {
        type: "virement_recu",
        montant: amount,
        ancienSolde: solde || 0,
        nouveauSolde: caisseNew,
        userId: user.uid,
        timestamp: now,
        description: `Virement reçu depuis sous-caisse ${virementTargetName}`,
        details: {
          fromSousCaisseId: virementTargetId,
          fromSousCaisseNom: virementTargetName,
        },
      };
      batch.set(doc(collection(db, "boutiques", boutiqueId, "caisse", caisseId, "transactions")), txMain);
    }

    try {
      await batch.commit();
      setVirementMontant(0);
      setVirementTargetId(null);
      setVirementTargetName("");
      setOpenVirementDialog(false);
      // solde / sousCaisses seront mis à jour par les subscriptions (onSnapshot)
      fetchTransactions(true);
    } catch (err) {
      console.error("Erreur virement:", err);
      alert("Erreur lors du virement.");
    }
  };
  // ----------------------------------------------------------

  // ---------- NOUVEAU: Décaisser dans une sous-caisse ----------
  const handleOpenDecaisse = (subId: string, subName: string) => {
    setDecaisseSubId(subId);
    setDecaisseSubName(subName);
    setDecaisseMontant(0);
    setOpenDecaisseDialog(true);
  };

  const handleDecaisseConfirm = async () => {
    if (!boutiqueId || !caisseId || !user || !decaisseSubId) { setGlobalError("Infos manquantes pour décaissement."); return; }
    const amount = Number(decaisseMontant) || 0;
    if (amount <= 0) { alert("Montant doit être > 0"); return; }
    const localSous = sousCaisses.find(s => s.id === decaisseSubId);
    const oldSousSolde = localSous ? (localSous.data.solde || 0) : 0;
    if (amount > oldSousSolde) { alert("Montant supérieur au solde de la sous-caisse."); return; }

    const batch = writeBatch(db);
    const sousRef = doc(db, "boutiques", boutiqueId, "sousCaisses", decaisseSubId);
    const caisseRef = doc(db, "boutiques", boutiqueId, "caisse", caisseId);
    const now = Timestamp.now();
    const newSousSolde = oldSousSolde - amount;

    // Update sous-caisse solde
    batch.update(sousRef, { solde: newSousSolde });

    // Transaction in sous-caisse (dépense)
    const txSous: BaseTransactionWrite = {
      type: "dépense",
      montant: amount,
      ancienSolde: oldSousSolde,
      nouveauSolde: newSousSolde,
      userId: user.uid,
      timestamp: now,
      description: `Décaissement / dépense depuis sous-caisse ${decaisseSubName}`,
      details: {
        sousCaisseId: decaisseSubId,
        sousCaisseNom: decaisseSubName,
      },
    };
    batch.set(doc(collection(db, "boutiques", boutiqueId, "sousCaisses", decaisseSubId, "transactions")), txSous);

    // Mirror log in main caisse transactions (without changing main solde) to indicate origin
    // We will **not** update the main solde; we only add a trace entry.
    const mainSnapshot = await getDocs(query(collection(db, "boutiques", boutiqueId, "caisse")));
    let mainAncienSolde = solde || 0;
    if (!mainSnapshot.empty) {
      const mainDoc = mainSnapshot.docs[0];
      // try to read the latest known solde if possible
      const mainData = mainDoc.data() as any;
      mainAncienSolde = (mainData.solde ?? solde) as number;
    }
    const txMainMirror: BaseTransactionWrite = {
      type: "dépense",
      montant: 0, // montant 0 pour ne pas altérer le solde principal ; la description indique le montant réel depuis la sous-caisse
      ancienSolde: mainAncienSolde,
      nouveauSolde: mainAncienSolde,
      userId: user.uid,
      timestamp: now,
      description: `Dépense effectuée dans sous-caisse ${decaisseSubName} : ${amount.toFixed(2)} ${devise}`,
      details: {
        fromSousCaisseId: decaisseSubId,
        fromSousCaisseNom: decaisseSubName,
        montantDecaisse: amount,
      },
    };
    batch.set(doc(collection(db, "boutiques", boutiqueId, "caisse", caisseId, "transactions")), txMainMirror);

    try {
      await batch.commit();
      setOpenDecaisseDialog(false);
      setDecaisseMontant(0);
      setDecaisseSubId(null);
      setDecaisseSubName("");
      fetchTransactions(true);
    } catch (err) {
      console.error("Erreur décaissement sous-caisse:", err);
      alert("Erreur lors du décaissement.");
    }
  };
  // ----------------------------------------------------------

  // Gestion de l'affichage pendant le chargement initial
  if (loadingAuth) {
    return (<Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh" sx={{ fontFamily: FONT_FAMILY }}><CircularProgress /><Typography ml={2}>Authentification en cours...</Typography></Box>);
  }
  if (!user) { // Si l'authentification est terminée et pas d'utilisateur
    return (<Box textAlign="center" py={4} sx={{ fontFamily: FONT_FAMILY }}><Alert severity="warning" sx={{justifyContent: 'center'}}>Utilisateur non authentifié. Veuillez vous connecter.</Alert></Box>);
  }
  // Si l'utilisateur est authentifié, mais la boutique/caisse sont en chargement
  if (loadingBoutique) {
    return (<Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh" sx={{ fontFamily: FONT_FAMILY }}><CircularProgress /><Typography ml={2}>Chargement des informations de la boutique et caisse...</Typography></Box>);
  }
  // Si une erreur globale s'est produite (ex: chargement boutique/caisse échoué)
  if (globalError) {
    return (<Box textAlign="center" py={4} sx={{ fontFamily: FONT_FAMILY }}><Alert severity="error" sx={{justifyContent: 'center'}}>{globalError}</Alert></Box>);
  }
  // Si tout est chargé mais qu'il manque des infos cruciales (ne devrait plus être globalError si bien géré avant)
  if (!boutiqueId || !caisseId ) {
    return (<Box textAlign="center" py={4} sx={{ fontFamily: FONT_FAMILY }}><Alert severity="warning" sx={{justifyContent: 'center'}}>{!boutiqueId ? "Aucune boutique associée." : "Aucune caisse trouvée pour cette boutique."}</Alert></Box>);
  }

  const actionButtons: ActionButtonConfig[] = [
      { label: "Entrée / Vente", icon: <PointOfSaleIcon />, type: "entrée", color: "primary", disabled: status === "fermé" },
      { label: "Sortie / Dépense", icon: <PaymentIcon />, type: "sortie", color: "secondary", disabled: status === "fermé" },
      { label: "Ouvrir", icon: <LockOpenIcon />, type: "ouverture", variant: "outlined", color: "success", disabled: status === "ouvert" },
      { label: "Fermer", icon: <LockIcon />, type: "fermeture", variant: "outlined", color: "error", disabled: status === "fermé" },
  ];

  return (
    <Box sx={{ p: isSm ? 1 : 3, background: theme.palette.grey[100], minHeight: "100vh", fontFamily: FONT_FAMILY }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card sx={{ mb: 2, bgcolor: "background.paper", borderRadius: 2, boxShadow: theme.shadows[3], "&:hover": { transform: "translateY(-2px)", boxShadow: theme.shadows[5] } }}>
          <CardContent>
            <Grid container alignItems="center" spacing={isSm ? 1 : 2}>
                {logoUrl && (<Grid item><Box component="img" src={logoUrl} alt={`${boutiqueName} logo`} sx={{ width: isSm ? 40 : 56, height: isSm ? 40 : 56, borderRadius: 1.5, objectFit: "contain" }}/></Grid>)}
                <Grid item xs>
                    <Typography variant="subtitle1" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontFamily: FONT_FAMILY }}>{boutiqueName || "Caisse"}<Chip label={status} color={status === "ouvert" ? "success" : "error"} size="small" sx={{ ml: 1, fontWeight: 'bold', fontFamily: FONT_FAMILY, textTransform: 'uppercase' }}/></Typography>
                    <Typography variant={isSm ? "h5" : "h4"} sx={{ fontWeight: 700, color: theme.palette.primary.main, fontFamily: FONT_FAMILY }}>{(solde ?? 0).toFixed(2)} {devise}</Typography>
                </Grid>
            </Grid>
          </CardContent>
        </Card>
      </motion.div>

      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" justifyContent={isSm ? "center" : "flex-start"}>
        {actionButtons.map(btn => (
          <Button key={btn.type} startIcon={btn.icon} variant={btn.variant || "contained"} color={btn.color} size={isSm ? "small" : "medium"}
            onClick={() => { 
                setModalType(btn.type); 
                setModalMontant(0); 
                const lastFermetureComment = (btn.type === "fermeture" && onOffs.length > 0) 
                    ? onOffs.find(o => o.type === "fermeture")?.commentaire 
                    : "";
                setModalDescription(lastFermetureComment || ""); 
                setOpenModal(true); 
            }}
            disabled={btn.disabled} sx={{fontFamily: FONT_FAMILY}} >{btn.label}</Button>
        ))}
        <Button variant="outlined" size={isSm ? "small" : "medium"} color="inherit" onClick={handleDownloadPDF} sx={{fontFamily: FONT_FAMILY}}>Export PDF</Button>

        {/* NOUVEAU: Bouton gestion sous-caisses */}
        <Button
          variant="outlined"
          startIcon={<AddBoxIcon />}
          size={isSm ? "small" : "medium"}
          onClick={() => setOpenSubCaisseDialog(true)}
          sx={{ ml: 1, fontFamily: FONT_FAMILY }}
        >
          Ajouter Sous-Caisse
        </Button>
      </Stack>

      <ToggleButtonGroup value={filterRange} exclusive onChange={handleFilterChange} sx={{ mb: 2, display: 'flex', justifyContent: isSm ? 'center' : 'flex-start' }} size={isSm ? "small" : "medium"} color="primary">
        {[{v:"today",l:"Aujourd'hui"}, {v:"week",l:"Semaine"}, {v:"month",l:"Mois"}, {v:"all",l:"Tous"}].map(f => (<ToggleButton key={f.v} value={f.v} sx={{fontFamily: FONT_FAMILY, textTransform: 'capitalize'}}>{f.l}</ToggleButton>))}
      </ToggleButtonGroup>

      {chartData.length > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }}>
          <Paper sx={{ height: isSm ? 250 : 350, mb: 3, p: isSm ? 1 : 2, bgcolor: "background.paper", borderRadius: 2, boxShadow: theme.shadows[2] }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis dataKey="date" tick={{ fontSize: isSm ? 9 : 10, fill: theme.palette.text.secondary, fontFamily: FONT_FAMILY }} />
                <YAxis tick={{ fontSize: isSm ? 9 : 10, fill: theme.palette.text.secondary, fontFamily: FONT_FAMILY }} tickFormatter={(value) => `${value.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0})} ${devise}`} />
                <Tooltip formatter={(value: number) => [`${value.toFixed(2)} ${devise}`, "Solde"]} labelStyle={{ color: theme.palette.text.primary, fontFamily: FONT_FAMILY }} itemStyle={{ color: theme.palette.primary.main, fontFamily: FONT_FAMILY }} />
                <Line type="monotone" dataKey="solde" stroke={theme.palette.primary.main} strokeWidth={2.5} dot={{ r: 3, fill: theme.palette.primary.dark }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </motion.div>
      )}
      
      <Typography variant="h6" gutterBottom sx={{ color: "text.primary", fontFamily: FONT_FAMILY }}>Sous-caisses</Typography>
      <Paper sx={{ mb: 3, p:2, bgcolor: "background.paper", borderRadius: 2, boxShadow: theme.shadows[1] }}>
        {sousCaissesLoading ? <CircularProgress size={24} /> : (
          sousCaisses.length === 0 ? (
            <Typography>Aucune sous-caisse créée.</Typography>
          ) : (
            <Stack spacing={1}>
              {sousCaisses.map(sc => (
                <Paper key={sc.id} variant="outlined" sx={{ p:1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography fontWeight={600}>{sc.data.nom}</Typography>
                    <Typography variant="caption">{(sc.data.solde || 0).toFixed(2)} {devise}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" startIcon={<TransferWithinAStationIcon />} onClick={() => { setVirementTargetId(sc.id); setVirementTargetName(sc.data.nom); setVirementDirection('mainToSub'); setOpenVirementDialog(true); }} sx={{ fontFamily: FONT_FAMILY }}>Virement</Button>
                    <Button size="small" variant="outlined" startIcon={<SubdirectoryArrowLeftIcon />} onClick={() => { setVirementTargetId(sc.id); setVirementTargetName(sc.data.nom); setVirementDirection('subToMain'); setOpenVirementDialog(true); }} sx={{ fontFamily: FONT_FAMILY }}>Vers caisse</Button>
                    <Button size="small" variant="text" startIcon={<StorefrontIcon />} onClick={() => {
                      alert(`Sous-caisse: ${sc.data.nom}\nSolde: ${(sc.data.solde||0).toFixed(2)} ${devise}`);
                    }} sx={{ fontFamily: FONT_FAMILY }}>Détails</Button>
                    
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )
        )}
      </Paper>

      <Typography variant="h6" gutterBottom sx={{ color: "text.primary", fontFamily: FONT_FAMILY }}>Opérations Ouverture/Fermeture (Page {onOffsCurrentPage})</Typography>
      <Paper sx={{ mb: 3, bgcolor: "background.paper", borderRadius: 2, boxShadow: theme.shadows[1], display: 'flex', flexDirection: 'column' }}>
        <Box sx={{flexGrow:1, width: '100%', minHeight: ONOFF_ITEMS_PER_PAGE * (isSm ? 42 : 52) + 56 /* approx row height + header */ }}>
            <DataGrid rows={filteredOnOffs} columns={onOffCols} getRowId={(r) => r.id} autoHeight hideFooter={true} density="compact" localeText={{ noRowsLabel: "Aucune opération O/F pour la période sélectionnée."}} sx={{ border: 0, "& .MuiDataGrid-cell, & .MuiDataGrid-columnHeaderTitle": { fontFamily: FONT_FAMILY } }} />
        </Box>
        {loadingOnOffs && <CircularProgress sx={{alignSelf:'center', m:1}} size={24}/>}
        {hasMoreOnOffs && !loadingOnOffs && ( // N'afficher que si pas en chargement
            <Button onClick={() => fetchOnOffs(false)} fullWidth sx={{fontFamily: FONT_FAMILY, borderTopLeftRadius:0, borderTopRightRadius:0}} disabled={loadingOnOffs}>
                {`Charger plus (Page ${onOffsCurrentPage + 1})`}
            </Button>
        )}
         {!loadingOnOffs && !hasMoreOnOffs && onOffs.length > 0 && <Typography textAlign="center" p={1} variant="caption" color="textSecondary">Fin des opérations.</Typography>}
      </Paper>

      <Typography variant="h6" gutterBottom sx={{ color: "text.primary", fontFamily: FONT_FAMILY }}>Transactions (Page {transactionsCurrentPage})</Typography>
      <Paper sx={{ minHeight: TRANSACTIONS_ITEMS_PER_PAGE * (isSm ? 42 : 52) + 56, bgcolor: "background.paper", borderRadius: 2, boxShadow: theme.shadows[1], display: 'flex', flexDirection:'column' }}>
        <Box sx={{flexGrow:1, width: '100%'}}>
            <DataGrid rows={filteredTxs} columns={txCols} getRowId={(r) => r.id} autoHeight hideFooter={true} density="compact" localeText={{ noRowsLabel: "Aucune transaction pour la période sélectionnée."}} sx={{ border: 0, "& .MuiDataGrid-cell, & .MuiDataGrid-columnHeaderTitle": { fontFamily: FONT_FAMILY } }} />
        </Box>
        {loadingTransactions && <CircularProgress sx={{alignSelf:'center', m:1}} size={24}/>}
        {hasMoreTransactions && !loadingTransactions && ( // N'afficher que si pas en chargement
            <Button onClick={() => fetchTransactions(false)} fullWidth sx={{fontFamily: FONT_FAMILY, borderTopLeftRadius:0, borderTopRightRadius:0}} disabled={loadingTransactions}>
                {`Charger plus (Page ${transactionsCurrentPage + 1})`}
            </Button>
        )}
        {!loadingTransactions && !hasMoreTransactions && transactions.length > 0 && <Typography textAlign="center" p={1} variant="caption" color="textSecondary">Fin des transactions.</Typography>}
      </Paper>

      <Dialog open={openModal} onClose={() => setOpenModal(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 2, fontFamily: FONT_FAMILY } }}>
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', pb: 1.5, fontFamily: FONT_FAMILY }}>{modalType === "ouverture" ? "Ouverture de caisse" : modalType === "fermeture" ? "Fermeture de caisse" : `Nouvelle ${modalType.replace("_", " ")}`}</DialogTitle>
        <DialogContent sx={{ pt: '20px !important', fontFamily: FONT_FAMILY }}>
          <Stack spacing={2}>
            {(["entrée", "sortie", "vente", "paiement_vente", "dépense"].includes(modalType)) && (<TextField label="Montant" type="number" value={modalMontant === 0 ? '' : modalMontant} onChange={(e) => setModalMontant(Math.max(0, Number(e.target.value)))} fullWidth size="small" InputProps={{ startAdornment: <Typography sx={{mr:0.5, fontFamily: FONT_FAMILY}}>{devise}</Typography> }} autoFocus InputLabelProps={{ sx: { fontFamily: FONT_FAMILY } }} inputProps={{ sx: { fontFamily: FONT_FAMILY } }}/>)}
            {/* Label ajusté pour être plus générique */}
            {(["entrée", "sortie", "vente", "paiement_vente", "dépense", "fermeture"].includes(modalType)) && (<TextField label={modalType === "fermeture" ? "Commentaire (optionnel)" : "Motif/Description (obligatoire pour sortie manuelle)"} value={modalDescription} onChange={(e) => setModalDescription(e.target.value)} fullWidth multiline minRows={modalType === "fermeture" ? 1 : 2} size="small" InputLabelProps={{ sx: { fontFamily: FONT_FAMILY } }} inputProps={{ sx: { fontFamily: FONT_FAMILY } }}/>)}
            {(modalType === "ouverture" || modalType === "fermeture") && (<Typography sx={{fontFamily: FONT_FAMILY}}>Solde actuel : <strong>{(solde || 0).toFixed(2)} {devise}</strong>. Confirmez-vous {modalType === "ouverture" ? "l'ouverture" : "la fermeture"} ?</Typography>)}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p:2, fontFamily: FONT_FAMILY }}>
          <Button onClick={() => setOpenModal(false)} color="inherit" sx={{fontFamily: FONT_FAMILY}}>Annuler</Button>
          <Button variant="contained" onClick={handleOperation} sx={{fontFamily: FONT_FAMILY}} color={modalType === "ouverture" ? "success" : modalType === "fermeture" ? "error" : ["entrée", "vente", "paiement_vente"].includes(modalType) ? "primary" : "secondary"} 
            // Condition de désactivation plus précise
            disabled={ 
                (["entrée", "sortie", "vente", "paiement_vente", "dépense"].includes(modalType) && modalMontant <= 0) || 
                (modalType === "sortie" && !modalDescription.trim()) // saleIdForRow n'est pas pertinent ici, c'est pour l'affichage des détails de vente
            }>Enregistrer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Création Sous-Caisse */}
      <Dialog open={openSubCaisseDialog} onClose={() => setOpenSubCaisseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ajouter une Sous-Caisse</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nom Sous-Caisse *" value={newSubCaisseName} onChange={(e)=>setNewSubCaisseName(e.target.value)} fullWidth />
            <TextField label={`Solde initial (${devise}) (optionnel)`} type="number" value={newSubCaisseInitial === 0 ? '' : newSubCaisseInitial} onChange={(e)=>setNewSubCaisseInitial(Number(e.target.value))} fullWidth />
            <Typography variant="caption">Si vous mettez un solde initial, il sera débité de la caisse principale et enregistré dans l'historique.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSubCaisseDialog(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleCreateSubCaisse}>Créer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Virement (choix direction) */}
      <Dialog open={openVirementDialog} onClose={() => setOpenVirementDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Virement {virementTargetName ? `: ${virementTargetName}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <ToggleButtonGroup
              value={virementDirection}
              exclusive
              onChange={(_, v) => { if (v) setVirementDirection(v); }}
              size="small"
            >
              <ToggleButton value="mainToSub" aria-label="caisse vers sous-caisse" sx={{ textTransform: 'none' }}>Caisse → Sous-caisse</ToggleButton>
              <ToggleButton value="subToMain" aria-label="sous-caisse vers caisse" sx={{ textTransform: 'none' }}>Sous-caisse → Caisse</ToggleButton>
            </ToggleButtonGroup>

            <TextField label={`Montant (${devise})`} type="number" value={virementMontant === 0 ? '' : virementMontant} onChange={(e)=>setVirementMontant(Math.max(0, Number(e.target.value)))} fullWidth />
            <Typography variant="caption">
              {virementDirection === 'mainToSub'
                ? "Le montant sera débité de la caisse principale et crédité à la sous-caisse choisie."
                : "Le montant sera débité de la sous-caisse et crédité sur la caisse principale."}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenVirementDialog(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleVirementConfirm} color="primary">Valider Virement</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Décaissement Sous-Caisse */}
      <Dialog open={openDecaisseDialog} onClose={() => setOpenDecaisseDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Décaisser depuis sous-caisse {decaisseSubName ? `: ${decaisseSubName}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={`Montant (${devise})`} type="number" value={decaisseMontant === 0 ? '' : decaisseMontant} onChange={(e)=>setDecaisseMontant(Math.max(0, Number(e.target.value)))} fullWidth />
            <Typography variant="caption">Le montant sera débité de la sous-caisse. Une trace sera ajoutée dans la caisse principale (sans modifier son solde) pour indiquer l'origine.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDecaisseDialog(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleDecaisseConfirm} color="error">Confirmer décaissement</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openSaleDetail} onClose={() => setOpenSaleDetail(false)} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 2, fontFamily: FONT_FAMILY } }}>
        <DialogTitle sx={{ bgcolor: 'primary.light', color: 'primary.contrastText', pb: 1.5, fontFamily: FONT_FAMILY }}>Détails de la vente</DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>{saleIdForRow && boutiqueId && (<SalesDetails boutiqueId={boutiqueId} saleId={saleIdForRow} onClose={() => setOpenSaleDetail(false)} />)}</DialogContent>
        <DialogActions sx={{ p:2 }}><Button onClick={() => setOpenSaleDetail(false)} color="primary" sx={{fontFamily: FONT_FAMILY}}>Fermer</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
