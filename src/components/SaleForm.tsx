"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  Timestamp,
  writeBatch,
  increment as firebaseIncrement,
  limit,
} from "firebase/firestore";
import {
  Box,
  Typography,
  TextField,
  Button,
  Autocomplete,
  Grid,
  CircularProgress,
  Alert,
  IconButton,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  FormControlLabel,
  Checkbox,
  styled,
  MenuItem,
  useTheme,
  Stack,
  InputAdornment,
  AlertTitle,
} from "@mui/material";
import {
  AddCircleOutline as AddIcon,
  DeleteOutline as DeleteIcon,
  ShoppingCartCheckout as ShoppingCartIcon,
  ReceiptLong as ReceiptIcon,
  PersonAddAlt1 as PersonAddIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  SignalWifiOff as OfflineIcon,
  CheckCircleOutline as SuccessIcon,
  InfoOutlined as InfoIcon,
} from "@mui/icons-material";
import { motion, AnimatePresence } from "framer-motion";
import InvoiceGenerator from "@/components/InvoiceGenerator";
import { format } from "date-fns";

/* ---------- Types ---------- */

interface Product {
  id: string;
  nom: string;
  numeroSerie?: string;
  stock: number;
  prixVente?: number;
  prix?: number;
  cout?: number;
  seuilStockBas?: number;
  [k: string]: any;
}

interface Customer {
  id: string;
  nom: string;
  telephone?: string;
  adresse?: string;
  totalPaye?: number;
  totalAchat?: number;
  nombreAchats?: number;
  derniereVente?: Timestamp;
  solde?: number;
  [k: string]: any;
}

interface SaleItem {
  uid: string;
  product: Product | null;
  // allow empty string to permit deletion and retyping in inputs
  quantity: number | "";
  unitPrice: number | "";
  total: number;
  coutAchat?: number;
}

/* ---------- Styled wrappers ---------- */

const FormWrapper = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  maxWidth: 950,
  margin: `${theme.spacing(4)} auto`,
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius * 2.5,
  boxShadow: theme.shadows[5],
}));

const SectionPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2.5),
  borderRadius: theme.shape.borderRadius * 1.5,
  marginBottom: theme.spacing(3),
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: "none",
}));

const AnimatedBox = motion(Box);

/* ---------- Utilitaires ---------- */

const generateShortId = () => {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString().slice(2) +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0") +
    now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0");
  const randomDigits = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `V${dateStr}-${randomDigits}`;
};

const formatTimestamp = (t?: Timestamp | null) => {
  if (!t) return "—";
  try {
    return new Date(t.seconds * 1000).toLocaleDateString();
  } catch {
    return String(t);
  }
};

/* ---------- Composant principal ---------- */

export default function SaleFormModernFixedWithBatch() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("XOF");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: "error" | "success" | "info"; message: string } | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [openInvoiceDialog, setOpenInvoiceDialog] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([
    { uid: String(Date.now()), product: null, quantity: 1, unitPrice: 0, total: 0 },
  ]);

  // Client
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saveNewCustomer, setSaveNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{ nom: string; telephone: string; adresse: string; solde: number | "" }>({ nom: "", telephone: "", adresse: "", solde: 0 });

  // Guest (client passager)
  const [isGuestClient, setIsGuestClient] = useState(false);
  const [guestClient, setGuestClient] = useState<{ nom: string; telephone: string; adresse: string }>({ nom: "", telephone: "", adresse: "" });

  // Statut/paiement
  // saleStatus only "effectué" as requested
  const [saleStatus, setSaleStatus] = useState<"effectué">("effectué");
  // replace "non payé" by "paiement sur compte"
  type PaymentMode = "payé" | "paiement sur compte" | "à crédit" | "partiellement payé";
  const [paymentStatus, setPaymentStatus] = useState<PaymentMode>("payé");
  // allow empty for paidAmount for clearing input
  const [paidAmount, setPaidAmount] = useState<number | "">(0);
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Utiliser solde client ? (pour paiements partiels)
  const [useClientSolde, setUseClientSolde] = useState(false);
  const [debitAmount, setDebitAmount] = useState<number | "">(0);

  // Offline indicator
  const [isOffline, setIsOffline] = useState(false);

  const theme = useTheme();

  /* ---------- Online/offline listener ---------- */
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    if (typeof window !== "undefined") {
      setIsOffline(!window.navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  /* ---------- Calculs montants ---------- */
  const computedTotal = useMemo(() => items.reduce((sum, it) => sum + (Number(it.total) || 0), 0), [items]);
  const grandTotal = computedTotal;

  // Ajuster paidAmount automatiquement pour certains statuts
  useEffect(() => {
    if (paymentStatus === "payé") {
      setPaidAmount(grandTotal);
    } else if (paymentStatus === "paiement sur compte") {
      // For account payment the cash paid is 0 (caisse not credited), paidAmount (for cash) set to 0
      setPaidAmount(0);
    } else if (paymentStatus === "à crédit") {
      setPaidAmount(0);
    } else if (paymentStatus === "partiellement payé") {
      if (paidAmount === "" && grandTotal > 0) setPaidAmount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal, paymentStatus]);

  const remainingAmountBeforeDebit = useMemo(() => {
    const paid = Number(paidAmount || 0);
    if (paymentStatus === "payé") return 0;
    if (paymentStatus === "paiement sur compte") return 0; // remaining w.r.t cash is 0 because paid via client account (handled separately)
    const diff = grandTotal - paid;
    return diff > 0 ? diff : 0;
  }, [grandTotal, paidAmount, paymentStatus]);

  /* ---------- Récupération boutique + données (produits/clients) ---------- */

  const fetchBoutique = useCallback(async () => {
    if (!user) {
      if (!loadingAuth) setLoadingData(false);
      return;
    }
    try {
      const bq = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid), limit(1));
      const snap = await getDocs(bq);
      if (!snap.empty) {
        const bId = snap.docs[0].id;
        setBoutiqueId(bId);
        const shopSnap = await getDoc(doc(db, "boutiques", bId));
        if (shopSnap.exists()) {
          const shop = shopSnap.data() as any;
          if (shop.devise) setDevise(shop.devise);
        }
      } else {
        setSubmitFeedback({ type: "error", message: "Aucune boutique n'est associée à cet utilisateur." });
        setBoutiqueId(null);
      }
    } catch (e) {
      console.error("Erreur chargement boutique (server):", e);
      setSubmitFeedback({ type: "error", message: `Erreur chargement boutique: ${(e as Error).message}` });
      setBoutiqueId(null);
    }
  }, [user, loadingAuth]);

  useEffect(() => {
    fetchBoutique();
  }, [fetchBoutique]);

  useEffect(() => {
    if (!boutiqueId) {
      setProducts([]);
      setCustomers([]);
      if (!loadingAuth && !user) setLoadingData(false);
      return;
    }
    setLoadingData(true);
    let cancelled = false;

    const fetchData = async () => {
      try {
        const productsQuery = query(collection(db, "boutiques", boutiqueId, "products"));
        const customersQuery = query(collection(db, "boutiques", boutiqueId, "customers"));

        let pSnap = await getDocs(productsQuery, { source: "cache" });
        if (pSnap.empty && !isOffline) pSnap = await getDocs(productsQuery);
        if (cancelled) return;
        const loadedProducts: Product[] = pSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Product));
        setProducts(loadedProducts);

        let cSnap = await getDocs(customersQuery, { source: "cache" });
        if (cSnap.empty && !isOffline) cSnap = await getDocs(customersQuery);
        if (cancelled) return;
        const loadedCustomers: Customer[] = cSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Customer));
        setCustomers(loadedCustomers);

        if (loadedProducts.length === 0 && isOffline) {
          setSubmitFeedback({ type: "info", message: "Aucun produit disponible hors ligne. Connectez-vous pour charger les données." });
        }
      } catch (e) {
        console.error("Erreur chargement produits/clients:", e);
        if (!isOffline) {
          setSubmitFeedback({ type: "error", message: `Erreur chargement produits/clients: ${(e as Error).message}` });
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [boutiqueId, isOffline, loadingAuth, user]);

  /* ---------- Helpers pour items ---------- */

  // Met à jour un item (qty / unitPrice / total / coutAchat)
  const updateItem = (uid: string, data: Partial<SaleItem>) =>
    setItems((prev) =>
      prev.map((it) =>
        it.uid === uid
          ? {
              ...it,
              ...data,
              // recalcule le total si unitPrice/quantity présents (convertir en nombre)
              total:
                (data.unitPrice !== undefined ? Number(data.unitPrice || 0) : Number(it.unitPrice || 0)) *
                (data.quantity !== undefined ? Number(data.quantity || 0) : Number(it.quantity || 0)),
            }
          : it
      )
    );

  const addItem = () =>
    setItems((prev) => [...prev, { uid: String(Date.now()) + Math.random(), product: null, quantity: 1, unitPrice: 0, total: 0 }]);

  const removeItem = (uid: string) => setItems((prev) => prev.filter((it) => it.uid !== uid));

  /* ---------- Ajout produit provenant de ProductTable ---------- */

  const addProductToSale = (payload: any) => {
    const productId = payload?.produitId || payload?.id;
    const productFromState = products.find((p) => p.id === productId);

    const productObj: Product = productFromState ?? {
      id: productId,
      nom: payload?.nom ?? "Produit",
      numeroSerie: payload?.numeroSerie ?? undefined,
      stock: payload?.stock ?? 0,
      prixVente: payload?.prix ?? payload?.prixVente ?? 0,
      cout: payload?.cout ?? payload?.prix ?? (productFromState?.cout ?? productFromState?.prix) ?? 0,
      prix: payload?.prix ?? 0,
    };

    setItems((prev) => {
      const existing = prev.find((i) => i.product?.id === productObj.id);
      if (existing) {
        const newQty = (Number(existing.quantity || 0) || 0) + (payload.qty ?? 1);
        return prev.map((it) =>
          it.uid === existing.uid
            ? {
                ...it,
                product: productObj,
                quantity: newQty,
                unitPrice: productObj.prixVente ?? productObj.prix ?? it.unitPrice,
                total: (productObj.prixVente ?? productObj.prix ?? it.unitPrice) * newQty,
                coutAchat: productObj.cout ?? it.coutAchat,
              }
            : it
        );
      }
      const newItem: SaleItem = {
        uid: String(Date.now()) + Math.random(),
        product: productObj,
        quantity: payload.qty ?? 1,
        unitPrice: productObj.prixVente ?? productObj.prix ?? 0,
        total: (productObj.prixVente ?? productObj.prix ?? 0) * (payload.qty ?? 1),
        coutAchat: productObj.cout ?? productObj.prix ?? 0,
      };
      return [newItem, ...prev];
    });

    try {
      const fn = (window as any).openSaleForm;
      if (typeof fn === "function") fn({ produitId: productObj.id });
    } catch {}
  };

  useEffect(() => {
    (window as any).openSaleForm = (payload: any) => addProductToSale(payload);
    const handler = (e: any) => addProductToSale(e.detail);
    window.addEventListener("loumo:add-to-sale", handler);
    return () => {
      try {
        delete (window as any).openSaleForm;
      } catch {}
      window.removeEventListener("loumo:add-to-sale", handler);
    };
  }, [products]);

  /* ---------- Enregistrement (soumission) ---------- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitFeedback(null);
    setSubmitting(true);

    if (!user || !boutiqueId) {
      setSubmitFeedback({ type: "error", message: "Utilisateur ou boutique non identifié." });
      setSubmitting(false);
      return;
    }

    // Validation items: convert to numbers
    const validItems = items
      .map((it) => ({
        ...it,
        quantity: Number(it.quantity || 0),
        unitPrice: Number(it.unitPrice || 0),
        total: Number(it.total || 0),
      }))
      .filter((it) => it.product && it.quantity > 0 && it.unitPrice >= 0);

    if (validItems.length === 0) {
      setSubmitFeedback({ type: "error", message: "Veuillez ajouter au moins un produit valide (quantité et prix)." });
      setSubmitting(false);
      return;
    }

    // Vérif stocks locaux avant batch
    for (const item of validItems) {
      const productInState = products.find((p) => p.id === item.product!.id);
      if (!productInState) {
        setSubmitFeedback({ type: "error", message: `Produit ${item.product?.nom} introuvable localement.` });
        setSubmitting(false);
        return;
      }
      if (productInState.stock < item.quantity) {
        setSubmitFeedback({ type: "error", message: `Stock insuffisant pour ${item.product!.nom}. Disponible: ${productInState.stock}` });
        setSubmitting(false);
        return;
      }
    }

    // Récupération caisse (id + solde) - nécessaire pour paiements en cash
    let caisseDocId: string | null = null;
    let currentCaisseSolde = 0;
    try {
      const caisseQuery = query(collection(db, "boutiques", boutiqueId, "caisse"), limit(1));
      let caisseDocsSnap = await getDocs(caisseQuery, { source: "cache" });
      if (caisseDocsSnap.empty && !isOffline) {
        caisseDocsSnap = await getDocs(caisseQuery);
      }
      if (caisseDocsSnap.empty) {
        // la caisse peut être absente si on n'a que "paiement sur compte" mais on garder le message
        setSubmitFeedback({ type: "error", message: isOffline ? "Données de caisse non disponibles hors ligne." : "Aucune caisse n'est configurée pour cette boutique." });
        setSubmitting(false);
        return;
      }
      caisseDocId = caisseDocsSnap.docs[0].id;
      const caisseDocData = caisseDocsSnap.docs[0].data() as any;
      currentCaisseSolde = caisseDocData.solde || 0;
      if (caisseDocData.status !== "ouvert") {
        setSubmitFeedback({ type: "error", message: "La caisse est fermée. Ouvrez la caisse avant d'enregistrer une vente." });
        setSubmitting(false);
        return;
      }
    } catch (err) {
      console.error("Erreur vérification caisse:", err);
      setSubmitFeedback({ type: "error", message: `Erreur vérification caisse: ${(err as Error).message}` });
      setSubmitting(false);
      return;
    }

    // Préparation batch
    const batch = writeBatch(db);
    const saleTimestamp = Timestamp.now();

    // Gestion client (nouveau, existant, ou guest)
    let customerIdToUse: string | null = selectedCustomer?.id || null;
    let createdCustomerId: string | null = null;
    let customerDataForCreance: { nom: string; telephone?: string } | null = null;
    let guestCustomerData: { nom: string; telephone?: string; adresse?: string } | null = null;

    if (isGuestClient) {
      // Guest: use guestClient data in sale but DO NOT create/update in customers collection.
      guestCustomerData = { nom: guestClient.nom.trim(), telephone: guestClient.telephone.trim() || undefined, adresse: guestClient.adresse.trim() || undefined };
      customerIdToUse = null;
    } else if (saveNewCustomer && newCustomer.nom.trim() !== "") {
      // create new customer in batch (we may later debit solde from it if needed)
      const newCustomerRef = doc(collection(db, "boutiques", boutiqueId, "customers"));
      createdCustomerId = newCustomerRef.id;
      customerIdToUse = createdCustomerId;
      customerDataForCreance = { nom: newCustomer.nom.trim(), telephone: newCustomer.telephone.trim() || undefined };

      const initialSolde = Number(newCustomer.solde || 0);

      batch.set(newCustomerRef, {
        nom: newCustomer.nom.trim(),
        telephone: newCustomer.telephone.trim() || "",
        adresse: newCustomer.adresse.trim() || "",
        solde: initialSolde,
        totalPaye: 0,
        totalAchat: 0,
        nombreAchats: 0,
        derniereVente: saleTimestamp,
        createdAt: saleTimestamp,
      });
    } else if (selectedCustomer) {
      customerDataForCreance = { nom: selectedCustomer.nom, telephone: selectedCustomer.telephone };
    }

    // Calculs de paiement / utilisation solde client
    // finalPaidAmountForSale corresponds au montant effectivement perçu en CAISSE (ne pas confondre avec débit sur solde client)
    let finalPaidAmountForSale = (paymentStatus === "payé" || paymentStatus === "partiellement payé") ? Number(paidAmount || 0) : 0;

    // remainingAmount: montant restant dû pour la vente (par rapport à cash)
    let remainingAmount = grandTotal - finalPaidAmountForSale;
    remainingAmount = remainingAmount > 0 ? remainingAmount : 0;

    // Handled amounts from client account (debit from their solde)
    let actualDebitedFromClient = 0;

    // ---- CASE: paymentStatus === "paiement sur compte" ----
    if (paymentStatus === "paiement sur compte") {
      // this mode requires a non-guest client (existing or newly created)
      if (isGuestClient) {
        setSubmitFeedback({ type: "error", message: "Le mode 'paiement sur compte' nécessite un client enregistré (le client passager ne possède pas de solde)." });
        setSubmitting(false);
        return;
      }
      if (!customerIdToUse) {
        setSubmitFeedback({ type: "error", message: "Sélectionnez ou créez un client pour utiliser 'paiement sur compte'." });
        setSubmitting(false);
        return;
      }

      // determine client's solde (try to find locally or if newly created use initial)
      const localClient = createdCustomerId ? null : customers.find((c) => c.id === customerIdToUse) || null;
      const clientSoldeLocal = localClient ? Number(localClient.solde || 0) : Number(newCustomer.solde || 0);

      // For payment-on-account we debit the FULL grandTotal from client's solde
      if (clientSoldeLocal < grandTotal) {
        setSubmitFeedback({ type: "error", message: `Solde insuffisant du client. Disponible: ${clientSoldeLocal} ${devise}, requis: ${grandTotal} ${devise}` });
        setSubmitting(false);
        return;
      }

      // debit the grandTotal from client's solde and update client totals
      actualDebitedFromClient = grandTotal;

      // update client doc in batch
      if (customerIdToUse) {
        const clientRef = doc(db, "boutiques", boutiqueId, "customers", customerIdToUse);
        batch.update(clientRef, {
          solde: firebaseIncrement(-actualDebitedFromClient),
          totalPaye: firebaseIncrement(actualDebitedFromClient),
          totalAchat: firebaseIncrement(grandTotal),
          nombreAchats: firebaseIncrement(1),
          derniereVente: saleTimestamp,
        });
      }

      // **IMPORTANT**: do NOT credit caisse when paymentStatus === "paiement sur compte"
      finalPaidAmountForSale = 0; // cash is 0
      remainingAmount = 0; // because paid by account
    } else {
      // Other modes: partial usage of client solde (if user chose to useClientSolde)
      if (useClientSolde && customerIdToUse) {
        const cust = createdCustomerId ? null : customers.find((c) => c.id === customerIdToUse) || null;
        const clientSoldeLocal = cust?.solde ?? 0;

        const requested = Number(debitAmount || 0);
        const possible = Math.min(requested, clientSoldeLocal, remainingAmount);
        actualDebitedFromClient = possible > 0 ? possible : 0;

        finalPaidAmountForSale += actualDebitedFromClient;
        remainingAmount = grandTotal - finalPaidAmountForSale;
        remainingAmount = remainingAmount > 0 ? remainingAmount : 0;

        if (customerIdToUse) {
          const clientRef = doc(db, "boutiques", boutiqueId, "customers", customerIdToUse);
          batch.update(clientRef, {
            solde: firebaseIncrement(-actualDebitedFromClient),
            totalPaye: firebaseIncrement(actualDebitedFromClient),
            totalAchat: firebaseIncrement(grandTotal),
            nombreAchats: firebaseIncrement(1),
            derniereVente: saleTimestamp,
          });
        }

        // If actualDebitedFromClient > 0 and mode is NOT 'paiement sur compte', we credit the caisse with that amount
        if (caisseDocId && actualDebitedFromClient > 0 && paymentStatus !== "paiement sur compte") {
          const caisseDocWriteRef = doc(db, "boutiques", boutiqueId, "caisse", caisseDocId);
          batch.update(caisseDocWriteRef, { solde: firebaseIncrement(actualDebitedFromClient) });

          const caisseTransactionRef = doc(collection(db, "boutiques", boutiqueId, "caisse", caisseDocId, "transactions"));
          batch.set(caisseTransactionRef, {
            referenceId: null,
            type: "vente_debit_solde_client",
            montant: actualDebitedFromClient,
            ancienSolde: currentCaisseSolde,
            nouveauSolde: currentCaisseSolde + actualDebitedFromClient,
            utilisateurId: user.uid,
            userName: user.displayName || user.email || "N/A",
            timestamp: saleTimestamp,
            paymentSource: "solde_client",
          });
          currentCaisseSolde += actualDebitedFromClient;
        }
      } else {
        // no client solde usage; but still update client stats totals if there is a client and some paidAmount
        if (customerIdToUse) {
          const clientRef = doc(db, "boutiques", boutiqueId, "customers", customerIdToUse);
          const amountPaidByClientInThisTx = finalPaidAmountForSale;
          batch.update(clientRef, {
            totalPaye: firebaseIncrement(amountPaidByClientInThisTx),
            totalAchat: firebaseIncrement(grandTotal),
            nombreAchats: firebaseIncrement(1),
            derniereVente: saleTimestamp,
          });
        }
      }
    }

    // Générer sale ref
    const newSaleRef = doc(collection(db, "boutiques", boutiqueId, "sales"));
    const newSaleId = newSaleRef.id;
    const saleShortId = generateShortId();

    const itemsForDb = validItems.map((it) => {
      const coutAchat = Number(it.product?.cout ?? it.coutAchat ?? it.product?.prix ?? 0);
      return {
        productId: it.product!.id,
        productNom: it.product!.nom,
        quantite: it.quantity,
        prixUnitaire: it.unitPrice,
        total: it.total,
        coutAchat,
      };
    });

    const totalCostAchat = itemsForDb.reduce((s, it) => s + (it.coutAchat || 0) * (it.quantite || 0), 0);

    const totalMarge = itemsForDb.reduce((s, it) => {
      const margeItem = (Number(it.prixUnitaire || 0) - Number(it.coutAchat || 0)) * Number(it.quantite || 0);
      return s + margeItem;
    }, 0);

    const saleDataForDb: any = {
      items: itemsForDb,
      customerId: customerIdToUse,
      guestCustomer: guestCustomerData || null,
      grandTotal,
      totalCostAchat,
      totalMarge,
      saleStatus,
      paymentStatus,
      userId: user.uid,
      userName: user.displayName || user.email || "N/A",
      timestamp: saleTimestamp,
      devise,
      paidAmount: finalPaidAmountForSale, // cash received to caisse
      remainingAmount,
      saleShortId,
      debitedFromClient: actualDebitedFromClient, // helpful for invoice/audit
    };

    if (dueDate && (paymentStatus === "à crédit" || paymentStatus === "partiellement payé") && remainingAmount > 0) {
      saleDataForDb.dueDate = Timestamp.fromDate(new Date(dueDate));
    }

    // Save sale in batch
    batch.set(newSaleRef, saleDataForDb);

    // Update stocks
    for (const item of validItems) {
      const productRef = doc(db, "boutiques", boutiqueId, "products", item.product!.id);
      batch.update(productRef, { stock: firebaseIncrement(-item.quantity) });
    }

    // If cash payment exists (finalPaidAmountForSale > 0) we credit the caisse (but NOT for 'paiement sur compte')
    if (caisseDocId && finalPaidAmountForSale > 0 && paymentStatus !== "paiement sur compte") {
      const caisseDocWriteRef = doc(db, "boutiques", boutiqueId, "caisse", caisseDocId);
      batch.update(caisseDocWriteRef, { solde: firebaseIncrement(finalPaidAmountForSale) });

      const caisseTransactionRef = doc(collection(db, "boutiques", boutiqueId, "caisse", caisseDocId, "transactions"));
      batch.set(caisseTransactionRef, {
        saleId: newSaleRef.id,
        type: "vente",
        montant: finalPaidAmountForSale,
        ancienSolde: currentCaisseSolde,
        nouveauSolde: currentCaisseSolde + finalPaidAmountForSale,
        userId: user.uid,
        userName: user.displayName || user.email || "N/A",
        timestamp: saleTimestamp,
        paymentStatusVente: paymentStatus,
      });
    }

    // Stats journalières
    const todayDateKey = format(saleTimestamp.toDate(), "yyyy-MM-dd");
    const dailyStatsDocRef = doc(db, "boutiques", boutiqueId, "statsVentes", todayDateKey);
    batch.set(
      dailyStatsDocRef,
      {
        montantVenteTotalDuJour: firebaseIncrement(grandTotal),
        montantPercuTotalDuJour: firebaseIncrement(finalPaidAmountForSale + (paymentStatus === "paiement sur compte" ? actualDebitedFromClient : 0)),
        nombreVentesDuJour: firebaseIncrement(1),
        margeBeneficeTotalDuJour: firebaseIncrement(totalMarge),
        date: todayDateKey,
        lastUpdated: saleTimestamp,
      },
      { merge: true }
    );

    // Stats produits
    for (const item of itemsForDb) {
      const productStatRef = doc(db, "boutiques", boutiqueId, "statsVentes", todayDateKey, "produitsVendus", item.productId);
      const itemMarge = (Number(item.prixUnitaire || 0) - Number(item.coutAchat || 0)) * Number(item.quantite || 0);
      batch.set(
        productStatRef,
        {
          nomProduit: item.productNom,
          quantiteVendueTotalJour: firebaseIncrement(item.quantite),
          montantTotalVenduJour: firebaseIncrement(item.total),
          montantTotalPercuJour: firebaseIncrement(grandTotal > 0 ? (item.total / grandTotal) * (finalPaidAmountForSale + (paymentStatus === "paiement sur compte" ? actualDebitedFromClient : 0)) : 0),
          margeVenduJour: firebaseIncrement(itemMarge),
          derniereVenteTimestamp: saleTimestamp,
        },
        { merge: true }
      );
    }

    // Créance : ne pas créer si paiement sur compte (la dette est réglée via le solde)
    if ((paymentStatus === "à crédit" || paymentStatus === "partiellement payé") && remainingAmount > 0 && customerIdToUse && customerDataForCreance) {
      const creanceRef = doc(collection(db, "boutiques", boutiqueId, "creances"));
      const creanceData = {
        clientId: customerIdToUse,
        clientNom: customerDataForCreance.nom,
        clientTelephone: customerDataForCreance.telephone || "",
        saleId: newSaleId,
        saleShortId,
        grandTotal,
        paidAmount: finalPaidAmountForSale,
        remainingAmount,
        dueDate: saleDataForDb.dueDate || null,
        saleDate: saleTimestamp,
        status: "en attente",
      };
      batch.set(creanceRef, creanceData);
    }

    // Commit
    try {
      await batch.commit();

      // UI optimistic updates
      setLastSaleId(newSaleId);
      setProducts((prev) =>
        prev.map((p) => {
          const sold = validItems.find((it) => it.product!.id === p.id);
          if (sold) {
            return { ...p, stock: p.stock - sold.quantity };
          }
          return p;
        })
      );

      if (createdCustomerId && newCustomer.nom.trim()) {
        const initialSolde = Number(newCustomer.solde || 0);
        setCustomers((prev) => [
          ...prev,
          {
            id: createdCustomerId,
            nom: newCustomer.nom.trim(),
            telephone: newCustomer.telephone.trim(),
            adresse: newCustomer.adresse.trim(),
            solde: initialSolde,
            totalPaye: finalPaidAmountForSale + (paymentStatus === "paiement sur compte" ? actualDebitedFromClient : 0),
            totalAchat: grandTotal,
            nombreAchats: 1,
            derniereVente: saleTimestamp,
          },
        ]);
      }

      // Reset form (keep guest/client options available)
      setItems([{ uid: String(Date.now()) + Math.random(), product: null, quantity: 1, unitPrice: 0, total: 0 }]);
      setSelectedCustomer(null);
      setSaveNewCustomer(false);
      setNewCustomer({ nom: "", telephone: "", adresse: "", solde: 0 });
      setIsGuestClient(false);
      setGuestClient({ nom: "", telephone: "", adresse: "" });
      setUseClientSolde(false);
      setDebitAmount(0);
      setPaidAmount(0);
      setDueDate("");
      setSaleStatus("effectué");
      setPaymentStatus("payé");

      setSubmitFeedback({ type: "success", message: "Vente enregistrée avec succès !" });
    } catch (err) {
      console.error("Erreur commit batch:", err);
      setSubmitFeedback({
        type: "error",
        message: "Erreur enregistrement de la vente. Vérifiez la connexion et réessayez.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- UI ---------- */

  if (loadingAuth || (user && loadingData && !boutiqueId && !submitFeedback?.message?.includes("Aucune boutique"))) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Chargement des données...</Typography>
      </Box>
    );
  }
  if (!user && !loadingAuth)
    return (
      <Alert severity="warning" sx={{ m: 4 }}>
        Veuillez vous connecter pour accéder à cette fonctionnalité.
      </Alert>
    );
  if (user && !boutiqueId && !loadingData)
    return (
      <Alert severity="error" sx={{ m: 4 }}>
        {submitFeedback?.message?.includes("Aucune boutique") ? submitFeedback.message : "Impossible de charger les informations de la boutique."}
      </Alert>
    );

  return (
    <FormWrapper>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" fontWeight={700} color="primary.main">
          Nouvelle Vente
        </Typography>
        <Chip label={isOffline ? "MODE HORS-LIGNE" : "En Ligne"} color={isOffline ? "warning" : "success"} icon={isOffline ? <OfflineIcon /> : <SuccessIcon />} size="small" sx={{ fontWeight: 600 }} />
      </Stack>

      <Box component="form" onSubmit={handleSubmit}>
        {/* ----- Items Section ----- */}
        <SectionPaper>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 500, color: "text.secondary", mb: 2 }}>
            Articles de la Vente
          </Typography>

          <Stack spacing={2}>
            <AnimatePresence>
              {items.map((item, idx) => (
                <AnimatedBox key={item.uid} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -200 }}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5, bgcolor: idx % 2 === 0 ? theme.palette.action.hover : "transparent" }}>
                    <Autocomplete
                      options={products.filter((p) => p.stock > 0 || (item.product && p.id === item.product.id))}
                      getOptionLabel={(opt) => `${opt.nom}${opt.numeroSerie ? ` [SN: ${opt.numeroSerie}]` : ""} (Stock: ${opt.stock ?? "N/A"})`}
                      value={item.product}
                      onChange={(_, v) => {
                        updateItem(item.uid, {
                          product: v,
                          unitPrice: v?.prixVente ?? v?.prix ?? 0,
                          quantity: 1,
                          coutAchat: Number(v?.cout ?? v?.prix ?? 0),
                        });
                      }}
                      renderInput={(params) => <TextField {...params} label={`Produit ${idx + 1}`} variant="outlined" size="small" fullWidth />}
                      renderOption={(props, option) => (
                        <Box component="li" {...props} key={option.id}>
                          <Typography variant="body2" sx={{ flexGrow: 1 }}>
                            {option.nom} {option.numeroSerie ? ` [SN: ${option.numeroSerie}]` : ""}
                          </Typography>
                          <Chip label={`Stock: ${option.stock}`} size="small" color={option.stock > (option.seuilStockBas ?? 5) ? "success" : option.stock > 0 ? "warning" : "error"} />
                        </Box>
                      )}
                      noOptionsText={loadingData ? "Chargement des produits..." : isOffline && products.length === 0 ? "Données produits non chargées hors ligne" : "Aucun produit en stock"}
                      isOptionEqualToValue={(option, value) => option.id === value?.id}
                      sx={{ mb: 2 }}
                      disabled={loadingData && products.length === 0 && !isOffline}
                    />

                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={5} sm={2}>
                        <TextField
                          label="Qté"
                          type="number"
                          fullWidth
                          value={item.quantity === "" ? "" : item.quantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") updateItem(item.uid, { quantity: "" });
                            else {
                              // ensure at least 1
                              const n = Math.max(1, Number(val));
                              updateItem(item.uid, { quantity: n });
                            }
                          }}
                          InputProps={{ inputProps: { min: 1 } }}
                          variant="outlined"
                          size="small"
                          error={item.product !== null && Number(item.quantity || 0) > (products.find((p) => p.id === item.product!.id)?.stock ?? 0)}
                          helperText={item.product !== null && Number(item.quantity || 0) > (products.find((p) => p.id === item.product!.id)?.stock ?? 0) ? `Max: ${products.find((p) => p.id === item.product!.id)?.stock}` : ""}
                        />
                      </Grid>

                      <Grid item xs={7} sm={3}>
                        <TextField
                          label="P.U."
                          type="number"
                          fullWidth
                          value={item.unitPrice === "" ? "" : item.unitPrice}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") updateItem(item.uid, { unitPrice: "" });
                            else updateItem(item.uid, { unitPrice: Math.max(0, Number(val)) });
                          }}
                          InputProps={{ inputProps: { min: 0, step: "any" }, startAdornment: <InputAdornment position="start">{devise}</InputAdornment> }}
                          variant="outlined"
                          size="small"
                        />
                      </Grid>

                      <Grid item xs={12} sm={5} sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography variant="body2" color="text.secondary">
                            Coût achat (PUA): {Number(item.product?.cout ?? item.coutAchat ?? item.product?.prix ?? 0).toLocaleString()} {devise}
                          </Typography>
                          <Typography variant="subtitle2" fontWeight={600}>
                            Total: {Number(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {devise}
                          </Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={12} sm={2} sx={{ textAlign: "right" }}>
                        <IconButton onClick={() => removeItem(item.uid)} color="error" size="small" disabled={items.length === 1 && !item.product}>
                          <DeleteIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  </Paper>
                </AnimatedBox>
              ))}
            </AnimatePresence>
          </Stack>

          <Button onClick={addItem} startIcon={<AddIcon />} variant="text" color="primary" sx={{ mt: 2.5, borderRadius: 1.5 }}>
            Ajouter un article
          </Button>
        </SectionPaper>

        {/* ----- Résumé ----- */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", my: 3, p: 2, borderRadius: 1.5, background: theme.palette.mode === "light" ? theme.palette.grey[100] : theme.palette.grey[800] }}>
          <Typography variant="h5" fontWeight={600} color="primary.dark">
            Total Général :
          </Typography>
          <Chip label={`${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${devise}`} color="primary" variant="filled" sx={{ fontSize: "1.1rem", fontWeight: 700, ml: 2, py: 1.5, px: 1.2 }} />
        </Box>

        {/* ----- Client / Solde ----- */}
        <SectionPaper>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 500, color: "text.secondary", mb: 2 }}>
            Informations Client <Chip label="Optionnel" size="small" variant="outlined" sx={{ ml: 1 }} />
          </Typography>

          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={isGuestClient}
                  onChange={(e) => {
                    setIsGuestClient(e.target.checked);
                    if (e.target.checked) {
                      setSelectedCustomer(null);
                      setSaveNewCustomer(false);
                      setNewCustomer({ nom: "", telephone: "", adresse: "", solde: 0 });
                    } else {
                      setGuestClient({ nom: "", telephone: "", adresse: "" });
                    }
                  }}
                />
              }
              label="Client passager (non enregistré)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={saveNewCustomer}
                  onChange={(e) => {
                    setSaveNewCustomer(e.target.checked);
                    if (e.target.checked) {
                      setSelectedCustomer(null);
                      setIsGuestClient(false);
                    } else {
                      setNewCustomer({ nom: "", telephone: "", adresse: "", solde: 0 });
                    }
                  }}
                  color="secondary"
                />
              }
              label={<Stack direction="row" alignItems="center" spacing={0.5}><PersonAddIcon fontSize="small" color={saveNewCustomer ? "secondary" : "action"} /><Typography variant="body2">Créer un nouveau client</Typography></Stack>}
            />
          </Stack>

          {isGuestClient ? (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField label="Nom client (passager)" fullWidth value={guestClient.nom} onChange={(e) => setGuestClient({ ...guestClient, nom: e.target.value })} variant="outlined" size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="Téléphone" fullWidth value={guestClient.telephone} onChange={(e) => setGuestClient({ ...guestClient, telephone: e.target.value })} variant="outlined" size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="Adresse" fullWidth value={guestClient.adresse} onChange={(e) => setGuestClient({ ...guestClient, adresse: e.target.value })} variant="outlined" size="small" />
              </Grid>
            </Grid>
          ) : saveNewCustomer ? (
            <Stack spacing={1}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField label="Nom complet" fullWidth value={newCustomer.nom} onChange={(e) => setNewCustomer({ ...newCustomer, nom: e.target.value })} variant="outlined" size="small" required={saveNewCustomer} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField label="Téléphone" fullWidth value={newCustomer.telephone} onChange={(e) => setNewCustomer({ ...newCustomer, telephone: e.target.value })} variant="outlined" size="small" />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField label="Adresse" fullWidth value={newCustomer.adresse} onChange={(e) => setNewCustomer({ ...newCustomer, adresse: e.target.value })} variant="outlined" size="small" />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Solde initial"
                    type="number"
                    fullWidth
                    value={newCustomer.solde === "" ? "" : newCustomer.solde}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") setNewCustomer({ ...newCustomer, solde: "" });
                      else setNewCustomer({ ...newCustomer, solde: Number(v) });
                    }}
                    variant="outlined"
                    size="small"
                    InputProps={{ startAdornment: <InputAdornment position="start">{devise}</InputAdornment> }}
                  />
                </Grid>
              </Grid>
            </Stack>
          ) : (
            <>
              <Autocomplete
                options={customers}
                getOptionLabel={(c) => `${c.nom}${c.telephone ? ` (${c.telephone})` : ""}`}
                value={selectedCustomer}
                onChange={(_, v) => {
                  setSelectedCustomer(v);
                  if (v) {
                    setUseClientSolde(false);
                    setDebitAmount(0);
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Rechercher ou sélectionner un client"
                    placeholder="Nom ou téléphone..."
                    variant="outlined"
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Stack>
                      <Typography variant="body2" fontWeight={500}>
                        {option.nom}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.telephone} {option.adresse && `• ${option.adresse}`}
                      </Typography>
                    </Stack>
                  </Box>
                )}
                noOptionsText={loadingData ? "Chargement des clients..." : isOffline && customers.length === 0 ? "Données clients non chargées hors ligne" : "Aucun client trouvé."}
                isOptionEqualToValue={(option, value) => option.id === value?.id}
                fullWidth
                disabled={loadingData && customers.length === 0 && !isOffline}
              />
              {selectedCustomer && (
                <Box mt={1} display="flex" gap={1} alignItems="center">
                  <Typography variant="body2">
                    Solde client: <strong>{(selectedCustomer.solde ?? 0).toLocaleString()} {devise}</strong>
                  </Typography>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={useClientSolde}
                        onChange={(e) => {
                          setUseClientSolde(e.target.checked);
                          if (!e.target.checked) setDebitAmount(0);
                        }}
                      />
                    }
                    label="Utiliser le solde du client"
                  />
                  {useClientSolde && (
                    <TextField
                      label="Montant à débiter"
                      type="number"
                      size="small"
                      value={debitAmount === "" ? "" : debitAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") setDebitAmount("");
                        else setDebitAmount(Math.max(0, Number(v)));
                      }}
                      InputProps={{ startAdornment: <InputAdornment position="start">{devise}</InputAdornment>, inputProps: { max: selectedCustomer.solde ?? 0 } }}
                      helperText={`Max utilisable: ${(selectedCustomer.solde ?? 0).toLocaleString()} ${devise}. Montant restant à payer: ${remainingAmountBeforeDebit.toFixed(2)} ${devise}`}
                      sx={{ width: 220 }}
                    />
                  )}
                </Box>
              )}
            </>
          )}
        </SectionPaper>

        {/* ----- Statuts Paiement ----- */}
        <SectionPaper>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 500, color: "text.secondary", mb: 2 }}>
            Statuts Vente & Paiement
          </Typography>
          <Grid container spacing={2.5}>
            <Grid item xs={12} md={6}>
              <TextField select label="Statut de la vente" fullWidth value={saleStatus} onChange={(e) => setSaleStatus(e.target.value as "effectué")} variant="outlined" size="small">
                <MenuItem value="effectué">Effectué</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Statut de paiement"
                fullWidth
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentMode)}
                variant="outlined"
                size="small"
              >
                <MenuItem value="payé">Payé</MenuItem>
                <MenuItem value="paiement sur compte">Paiement sur compte</MenuItem>
                <MenuItem value="à crédit">À crédit</MenuItem>
                <MenuItem value="partiellement payé">Partiellement payé</MenuItem>
              </TextField>
            </Grid>

            {/* Payment detail area */}
            {(paymentStatus === "partiellement payé" || paymentStatus === "à crédit") && (
              <Grid item xs={12}>
                <Paper elevation={0} variant="outlined" sx={{ p: 2, borderRadius: 1, mt: 1 }}>
                  <Grid container spacing={2} alignItems="flex-end">
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Montant payé (cash)"
                        type="number"
                        fullWidth
                        value={paidAmount === "" ? "" : paidAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") setPaidAmount("");
                          else setPaidAmount(Math.min(Math.max(0, Number(v)), grandTotal));
                        }}
                        InputProps={{ inputProps: { min: 0, max: grandTotal, step: "any" }, startAdornment: <InputAdornment position="start">{devise}</InputAdornment> }}
                        variant="outlined"
                        size="small"
                        helperText={""}
                      />
                    </Grid>

                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Montant restant dû"
                        type="text"
                        fullWidth
                        value={Math.max(0, grandTotal - Number(paidAmount || 0)).toFixed(2)}
                        disabled
                        variant="filled"
                        size="small"
                        InputProps={{ startAdornment: <InputAdornment position="start">{devise}</InputAdornment> }}
                      />
                    </Grid>

                    {(paymentStatus === "partiellement payé" || paymentStatus === "à crédit") && (grandTotal - Number(paidAmount || 0)) > 0 && (
                      <Grid item xs={12} sm={4}>
                        <TextField label="Date limite de paiement" type="date" fullWidth InputLabelProps={{ shrink: true }} value={dueDate} onChange={(e) => setDueDate(e.target.value)} variant="outlined" size="small" />
                      </Grid>
                    )}
                  </Grid>
                </Paper>
              </Grid>
            )}

            {/* When paymentStatus is 'paiement sur compte' we show a notice and ensure client exists */}
            {paymentStatus === "paiement sur compte" && (
              <Grid item xs={12}>
                <Alert severity="info">Le montant total sera débité du solde du client sélectionné. <strong>Ne sera pas crédité en caisse</strong> et aucune créance ne sera créée.</Alert>
              </Grid>
            )}

            {/* If paymentStatus is 'payé' show simple paid amount (auto-filled) */}
            {paymentStatus === "payé" && (
              <Grid item xs={12}>
                <Paper elevation={0} variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6}>
                      <TextField label="Montant payé (cash)" type="number" fullWidth value={paidAmount === "" ? "" : paidAmount} onChange={(e) => { const v = e.target.value; if (v === "") setPaidAmount(""); else setPaidAmount(Math.min(Math.max(0, Number(v)), grandTotal)); }} InputProps={{ inputProps: { min: 0, max: grandTotal, step: "any" }, startAdornment: <InputAdornment position="start">{devise}</InputAdornment> }} variant="outlined" size="small" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField label="Montant restant dû" type="text" fullWidth value={Math.max(0, grandTotal - Number(paidAmount || 0)).toFixed(2)} disabled variant="filled" size="small" InputProps={{ startAdornment: <InputAdornment position="start">{devise}</InputAdornment> }} />
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            )}
          </Grid>
        </SectionPaper>

        {/* ----- Feedback & Actions ----- */}
        <Stack spacing={2} mt={3}>
          {submitFeedback && (
            <Alert severity={submitFeedback.type} onClose={() => setSubmitFeedback(null)} sx={{ borderRadius: 1.5 }} iconMapping={{ success: <SuccessIcon fontSize="inherit" />, info: <InfoIcon fontSize="inherit" /> }}>
              <AlertTitle>{submitFeedback.type === "success" ? "Succès" : submitFeedback.type === "error" ? "Erreur" : "Information"}</AlertTitle>
              {submitFeedback.message}
            </Alert>
          )}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="flex-end" pt={2} borderTop={`1px solid ${theme.palette.divider}`}>
            {(submitFeedback?.type === "success" || (submitFeedback?.type === "info" && submitFeedback.message.includes("localement"))) && lastSaleId && (
              <Button variant="outlined" color="secondary" size="large" onClick={() => setOpenInvoiceDialog(true)} startIcon={<ReceiptIcon />} sx={{ borderRadius: 1.5, flexGrow: { xs: 1, sm: 0 } }}>
                Générer Facture
              </Button>
            )}

            <Button
              variant="contained"
              size="large"
              type="submit"
              disabled={
                submitting ||
                items.length === 0 ||
                items.every((it) => !it.product) ||
                items.some((it) => it.product && Number(it.quantity || 0) > (products.find((p) => p.id === it.product!.id)?.stock ?? 0)) ||
                (saveNewCustomer && newCustomer.nom.trim() === "") ||
                (paymentStatus === "partiellement payé" && Number(paidAmount || 0) >= grandTotal && grandTotal > 0) ||
                (paymentStatus === "paiement sur compte" && isGuestClient) // cannot use account for guest
              }
              startIcon={submitting ? <CircularProgress size={24} color="inherit" /> : <ShoppingCartIcon />}
              sx={{ borderRadius: 1.5, py: 1.2, flexGrow: { xs: 1, sm: 0 } }}
            >
              {submitting ? "Enregistrement..." : "Confirmer la Vente"}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* ----- Dialogue facture ----- */}
      <Dialog open={openInvoiceDialog} onClose={() => setOpenInvoiceDialog(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ bgcolor: "primary.dark", color: "common.white", py: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            Facture de Vente
            <IconButton onClick={() => setOpenInvoiceDialog(false)} sx={{ color: "common.white" }}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 2, md: 3 }, bgcolor: "grey.100" }}>
          {lastSaleId && boutiqueId && user && <InvoiceGenerator boutiqueId={boutiqueId} saleId={lastSaleId} userId={user.uid} type="b2b" />}
        </DialogContent>
      </Dialog>
    </FormWrapper>
  );
}
