"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  QuerySnapshot,
  DocumentData,
  QueryDocumentSnapshot,
  limit,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
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
  Card,
  CardContent,
  CardMedia,
  List,
  ListItem,
  ListItemText,
  Divider,
  CssBaseline,
  Popper,
  PopperProps as MuiPopperProps,
  MenuProps as MuiMenuProps,
} from "@mui/material";
import {
  DeleteOutline as DeleteIcon,
  ShoppingCartCheckout as ShoppingCartIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  SignalWifiOff as OfflineIcon,
  CloudDone as CloudDoneIcon,
  AddShoppingCart as AddShoppingCartIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { motion, AnimatePresence } from "framer-motion";
import InvoiceGenerator from "@/components/InvoiceGenerator";
import RecentSalesCacheList from "@/components/RecentSalesCacheList";
import { format } from "date-fns";

/* ---------------------- Types ---------------------- */

interface Product {
  id: string;
  nom: string;
  numeroSerie?: string;
  stock: number;
  prixVente?: number;
  prix?: number;
  imageUrl?: string;
  seuilStockBas?: number;
  cout?: number;
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
  quantity: number | ""; // allow clearing input
  unitPrice: number | ""; // allow clearing input
  total: number;
  coutAchat?: number;
}

export interface BoutiqueDetailsForInvoice {
  nom: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  logoUrl?: string;
  devise: string;
  nif?: string;
  rc?: string;
}

/* ---------------------- Helpers / Styled ---------------------- */

const MODERN_BACKGROUND_GRADIENT = "linear-gradient(135deg, #f0f4f8 0%, #e6e9f0 100%)";

const FormWrapper = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  maxWidth: "100%",
  minHeight: "100vh",
  margin: "0 auto",
  background: MODERN_BACKGROUND_GRADIENT,
  display: "flex",
  flexDirection: "column",
  fontFamily: "'Poppins', sans-serif",
}));

const ProductGridWrapper = styled(Box)(({ theme }) => ({
  overflowY: "auto",
  paddingRight: theme.spacing(1),
}));

const AnimatedDiv = motion.div;

const generateShortId = () => {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString().slice(2) +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0") +
    now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0");
  const randomDigits = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `V${dateStr}-${randomDigits}`;
};

/* ---------------------- Constants ---------------------- */

const SALE_STATUSES = ["effectué"] as const;
type SaleStatus = typeof SALE_STATUSES[number];

// Replace "non payé" with "paiement sur compte"
const PAYMENT_STATUSES = ["payé", "paiement sur compte", "à crédit", "partiellement payé"] as const;
type PaymentStatus = typeof PAYMENT_STATUSES[number];

/* ---------------------- Component ---------------------- */

export default function POSSalePage() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [currentBoutiqueDetails, setCurrentBoutiqueDetails] = useState<BoutiqueDetailsForInvoice | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: "error" | "success" | "info"; message: string } | null>(null);

  const [cartItems, setCartItems] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saveNewCustomer, setSaveNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{ nom: string; telephone: string; adresse: string; solde?: number | "" }>({
    nom: "",
    telephone: "",
    adresse: "",
    solde: 0,
  });

  // guest client
  const [isGuestClient, setIsGuestClient] = useState(false);
  const [guestClient, setGuestClient] = useState<{ nom: string; telephone: string; adresse: string }>({ nom: "", telephone: "", adresse: "" });

  const [saleStatus, setSaleStatus] = useState<SaleStatus>("effectué");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("payé");
  const [paidAmount, setPaidAmount] = useState<number | "">(0);
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // debit client solde
  const [useClientSolde, setUseClientSolde] = useState(false);
  const [debitAmount, setDebitAmount] = useState<number | "">(0);

  const [isOffline, setIsOffline] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPageFullscreen, setIsPageFullscreen] = useState(false);
  const [invoiceDataForDialog, setInvoiceDataForDialog] = useState<any | null>(null);
  const [openInvoiceDialog, setOpenInvoiceDialog] = useState(false);

  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const offlineSaleAlertTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const theme = useTheme();

  /* ---------- Totals ---------- */
  const computedTotal = useMemo(() => cartItems.reduce((s, it) => s + (Number(it.total || 0) || 0), 0), [cartItems]);
  const grandTotal = computedTotal;

  /* ---------- Online/offline ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOffline(!window.navigator.onLine);
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (offlineSaleAlertTimeoutRef.current) clearTimeout(offlineSaleAlertTimeoutRef.current);
    };
  }, []);

  /* ---------- Auto adjust paidAmount for certain statuses ---------- */
  useEffect(() => {
    if (paymentStatus === "payé") setPaidAmount(grandTotal);
    else if (paymentStatus === "paiement sur compte") setPaidAmount(0); // cash = 0
    else if (paymentStatus === "à crédit") setPaidAmount(0);
    else if (paymentStatus === "partiellement payé") {
      if (paidAmount === "" && grandTotal > 0) setPaidAmount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal, paymentStatus]);

  const remainingAmount = useMemo(() => {
    const paid = Number(paidAmount || 0);
    if (paymentStatus === "payé") return 0;
    if (paymentStatus === "paiement sur compte") return 0; // cash remaining considered 0 (settled by client balance)
    const diff = grandTotal - paid;
    return diff > 0 ? diff : 0;
  }, [grandTotal, paidAmount, paymentStatus]);

  /* ---------- Fetch boutique & data ---------- */
  const fetchBoutique = useCallback(async () => {
    if (!user) {
      if (!loadingAuth) setLoadingData(false);
      return;
    }
    try {
      const bq = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid), limit(1));
      let snap = await getDocs(bq);
      if (snap.empty && !isOffline) snap = await getDocs(bq);
      if (!snap.empty) {
        const bId = snap.docs[0].id;
        setBoutiqueId(bId);
        const shopSnap = await getDoc(doc(db, "boutiques", bId));
        if (shopSnap.exists()) {
          const shop = shopSnap.data() as any;
          setCurrentBoutiqueDetails({
            nom: shop.nom || "Ma boutique",
            adresse: shop.adresse || "",
            telephone: shop.telephone || "",
            email: shop.email || "",
            logoUrl: shop.logoUrl || "",
            devise: shop.devise || "XOF",
            nif: shop.nif || "",
            rc: shop.rc || "",
          });
        }
      } else {
        setSubmitFeedback({ type: "error", message: "Aucune boutique n'est associée à cet utilisateur." });
        setBoutiqueId(null);
      }
    } catch (e) {
      console.error("Erreur chargement boutique:", e);
      setSubmitFeedback({ type: "error", message: `Erreur chargement boutique: ${(e as Error).message}` });
      setBoutiqueId(null);
    }
  }, [user, loadingAuth, isOffline]);

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
        if (!isOffline) setSubmitFeedback({ type: "error", message: `Erreur chargement produits/clients: ${(e as Error).message}` });
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [boutiqueId, isOffline, loadingAuth, user]);

  /* ---------- Cart helpers ---------- */
  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      setSubmitFeedback({ type: "info", message: `Produit ${product.nom} hors stock.` });
      return;
    }
    setCartItems((prev) => {
      const existing = prev.find((p) => p.product?.id === product.id);
      if (existing) {
        const newQty = (Number(existing.quantity || 0) || 0) + 1;
        if (newQty > product.stock) {
          setSubmitFeedback({ type: "info", message: `Stock maximum atteint pour ${product.nom} (${product.stock}).` });
          return prev;
        }
       return prev.map((it) =>
  it.uid === existing.uid
    ? (() => {
        // Calcul du prix unitaire en une seule fois
        const computedUnitPrice =
          it.unitPrice === ""
            ? product.prixVente ?? product.prix ?? 0
            : it.unitPrice;

        return {
          ...it,
          quantity: newQty,
          unitPrice: computedUnitPrice,
          total: (Number(computedUnitPrice) || 0) * newQty,
          product,
          coutAchat: product.cout ?? product.prix ?? 0,
        };
      })()
    : it
);

      }
      const newItem: SaleItem = {
        uid: `${Date.now()}-${product.id}`,
        product,
        quantity: 1,
        unitPrice: product.prixVente ?? product.prix ?? 0,
        total: product.prixVente ?? product.prix ?? 0,
        coutAchat: product.cout ?? product.prix ?? 0,
      };
      return [...prev, newItem];
    });
  };

  const updateCartItem = (uid: string, data: Partial<Pick<SaleItem, "quantity" | "unitPrice">>) => {
    setCartItems((prev) =>
      prev.map((it) => {
        if (it.uid !== uid) return it;
        let newQuantity: number | "" = it.quantity;
        if (data.quantity !== undefined) {
          if (data.quantity === "" || (typeof data.quantity === "string" && data.quantity === "")) newQuantity = "";
          else newQuantity = Math.max(1, Number(data.quantity));
        }
        const productInState = it.product ? products.find((p) => p.id === it.product.id) : undefined;
        if (productInState && newQuantity !== "" && Number(newQuantity) > productInState.stock) {
          setSubmitFeedback({ type: "info", message: `Stock maximum (${productInState.stock}) pour ${it.product?.nom} dépassé.` });
          newQuantity = productInState.stock;
        }
        let newUnitPrice: number | "" = it.unitPrice;
        if (data.unitPrice !== undefined) {
          if (data.unitPrice === "" || (typeof data.unitPrice === "string" && data.unitPrice === "")) newUnitPrice = "";
          else newUnitPrice = Math.max(0, Number(data.unitPrice));
        }
        const total = (Number(newUnitPrice || 0) || 0) * (newQuantity === "" ? 0 : Number(newQuantity || 0));
        return { ...it, quantity: newQuantity, unitPrice: newUnitPrice, total };
      })
    );
  };

  const removeCartItem = (uid: string) => setCartItems((prev) => prev.filter((it) => it.uid !== uid));

  /* ---------- Add product via global event (optional) ---------- */
  useEffect(() => {
    const addProductToSale = (payload: any) => {
      const productId = payload?.produitId || payload?.id;
      const productFromState = products.find((p) => p.id === productId);
      const productObj: Product =
        productFromState ??
        ({
          id: productId,
          nom: payload?.nom ?? "Produit",
          numeroSerie: payload?.numeroSerie,
          stock: payload?.stock ?? 0,
          prixVente: payload?.prix ?? payload?.prixVente ?? 0,
          cout: payload?.cout ?? payload?.prix ?? 0,
          prix: payload?.prix ?? 0,
        } as Product);

      setCartItems((prev) => {
        const existing = prev.find((i) => i.product?.id === productObj.id);
        if (existing) {
          const newQty = (Number(existing.quantity || 0) || 0) + (payload.qty ?? 1);
          return prev.map((it) =>
            it.uid === existing.uid
              ? {
                  ...it,
                  quantity: newQty,
                  unitPrice: productObj.prixVente ?? productObj.prix ?? it.unitPrice,
                  total: (productObj.prixVente ?? productObj.prix ?? it.unitPrice) * newQty,
                  coutAchat: productObj.cout ?? it.coutAchat,
                }
              : it
          );
        }
        const newItem: SaleItem = {
          uid: `${Date.now()}-${Math.random()}`,
          product: productObj,
          quantity: payload.qty ?? 1,
          unitPrice: productObj.prixVente ?? productObj.prix ?? 0,
          total: (productObj.prixVente ?? productObj.prix ?? 0) * (payload.qty ?? 1),
          coutAchat: productObj.cout ?? productObj.prix ?? 0,
        };
        return [newItem, ...prev];
      });
    };

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

  /* ---------- Submit sale (batch) ---------- */
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitFeedback(null);
    setSubmitting(true);

    if (!user || !boutiqueId || !currentBoutiqueDetails) {
      setSubmitFeedback({ type: "error", message: "Utilisateur, boutique ou détails non identifiés." });
      setSubmitting(false);
      return;
    }

    // Pre-check caisse (needed for cash credits and for solde debit that credits caisse except paiement sur compte)
    let caisseDocId: string | null = null;
    let currentCaisseSolde = 0;
    try {
      const caisseQuery = query(collection(db, "boutiques", boutiqueId, "caisse"), limit(1));
      let caisseSnap = await getDocs(caisseQuery, { source: "cache" });
      if (caisseSnap.empty && !isOffline) caisseSnap = await getDocs(caisseQuery);
      if (caisseSnap.empty) {
        setSubmitFeedback({ type: "error", message: isOffline ? "Données de caisse non disponibles hors ligne." : "Aucune caisse n'est configurée pour cette boutique." });
        setSubmitting(false);
        return;
      }
      caisseDocId = caisseSnap.docs[0].id;
      const caisseData = caisseSnap.docs[0].data() as any;
      currentCaisseSolde = caisseData?.solde || 0;
      if (caisseData?.status !== "ouvert") {
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

    // Validate cart items: convert and ensure valid numbers
    const validItems = cartItems
      .map((it) => ({ ...it, quantity: Number(it.quantity || 0), unitPrice: Number(it.unitPrice || 0), total: Number(it.total || 0) }))
      .filter((it) => it.product && it.quantity > 0 && it.unitPrice >= 0);

    if (validItems.length === 0) {
      setSubmitFeedback({ type: "error", message: "Veuillez ajouter au moins un produit valide (quantité/prix)." });
      setSubmitting(false);
      return;
    }

    // Check stocks
    for (const item of validItems) {
      const prod = products.find((p) => p.id === item.product!.id);
      if (!prod) {
        setSubmitFeedback({ type: "error", message: `Produit ${item.product?.nom} introuvable localement.` });
        setSubmitting(false);
        return;
      }
      if (prod.stock < item.quantity) {
        setSubmitFeedback({ type: "error", message: `Stock insuffisant pour ${item.product!.nom}. Disponible: ${prod.stock}` });
        setSubmitting(false);
        return;
      }
    }

    // Prepare batch
    const batch = writeBatch(db);
    const saleTimestamp = Timestamp.now();

    // Customer management
    let customerIdToUse: string | null = selectedCustomer?.id || null;
    let createdCustomerId: string | null = null;
    let customerDataForCreance: { nom: string; telephone?: string } | null = null;
    let guestCustomerData: { nom: string; telephone?: string; adresse?: string } | null = null;

    if (isGuestClient) {
      customerIdToUse = null;
      guestCustomerData = { nom: guestClient.nom.trim() || "Client de passage", telephone: guestClient.telephone.trim() || undefined, adresse: guestClient.adresse.trim() || undefined };
    } else if (saveNewCustomer && newCustomer.nom.trim() !== "") {
      const newCustRef = doc(collection(db, "boutiques", boutiqueId, "customers"));
      createdCustomerId = newCustRef.id;
      customerIdToUse = createdCustomerId;
      customerDataForCreance = { nom: newCustomer.nom.trim(), telephone: newCustomer.telephone.trim() || undefined };
      const initialSolde = Number(newCustomer.solde || 0);
      batch.set(newCustRef, {
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

    // Payment calculations
    let finalPaidAmountForSale = (paymentStatus === "payé" || paymentStatus === "partiellement payé") ? Number(paidAmount || 0) : 0;
    let remainingAmountForSale = grandTotal - finalPaidAmountForSale;
    remainingAmountForSale = remainingAmountForSale > 0 ? remainingAmountForSale : 0;

    let actualDebitedFromClient = 0;

    // Case: payment on account (paiement sur compte) -> debit client's balance for full grandTotal, do NOT credit caisse, do NOT create creance
    if (paymentStatus === "paiement sur compte") {
      if (isGuestClient) {
        setSubmitFeedback({ type: "error", message: "Le mode 'paiement sur compte' nécessite un client enregistré (le client passager ne possède pas de solde)." });
        setSubmitting(false);
        return;
      }
      if (!customerIdToUse) {
        setSubmitFeedback({ type: "error", message: "Sélectionnez ou créez un client pour 'paiement sur compte'." });
        setSubmitting(false);
        return;
      }

      const localClient = createdCustomerId ? null : customers.find((c) => c.id === customerIdToUse) || null;
      const clientSoldeLocal = localClient ? Number(localClient.solde || 0) : Number(newCustomer.solde || 0);

      if (clientSoldeLocal < grandTotal) {
        setSubmitFeedback({ type: "error", message: `Solde insuffisant du client. Disponible: ${clientSoldeLocal} ${currentBoutiqueDetails?.devise}, requis: ${grandTotal} ${currentBoutiqueDetails?.devise}` });
        setSubmitting(false);
        return;
      }

      actualDebitedFromClient = grandTotal;
      // Update client doc
      const clientRef = doc(db, "boutiques", boutiqueId, "customers", customerIdToUse);
      batch.update(clientRef, {
        solde: firebaseIncrement(-actualDebitedFromClient),
        totalPaye: firebaseIncrement(actualDebitedFromClient),
        totalAchat: firebaseIncrement(grandTotal),
        nombreAchats: firebaseIncrement(1),
        derniereVente: saleTimestamp,
      });

      // cash received = 0, remaining = 0
      finalPaidAmountForSale = 0;
      remainingAmountForSale = 0;
    } else {
      // Other modes: optionally use client's solde as partial payment
      if (useClientSolde && customerIdToUse) {
        const cust = createdCustomerId ? null : customers.find((c) => c.id === customerIdToUse) || null;
        const clientSoldeLocal = cust?.solde ?? 0;
        const requested = Number(debitAmount || 0);
        const possible = Math.min(requested, clientSoldeLocal, remainingAmountForSale);
        actualDebitedFromClient = possible > 0 ? possible : 0;

        finalPaidAmountForSale += actualDebitedFromClient;
        remainingAmountForSale = grandTotal - finalPaidAmountForSale;
        remainingAmountForSale = remainingAmountForSale > 0 ? remainingAmountForSale : 0;

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

        // If we debited client's solde and this is not 'paiement sur compte', we credit the caisse with that amount
        if (caisseDocId && actualDebitedFromClient > 0) {
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
        // no client solde usage; update client totals if exists and cash paid
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

    // Prepare items & sale doc
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
    const totalMarge = itemsForDb.reduce((s, it) => s + ((Number(it.prixUnitaire || 0) - Number(it.coutAchat || 0)) * Number(it.quantite || 0)), 0);

    const saleRef = doc(collection(db, "boutiques", boutiqueId, "sales"));
    const newSaleId = saleRef.id;
    const saleShortId = generateShortId();

    const saleDataForDb: any = {
      items: itemsForDb,
      customerId: customerIdToUse,
      guestCustomer: guestCustomerData || null,
      clientNomSnapshot: isGuestClient ? guestClient.nom || "Client de passage" : saveNewCustomer ? newCustomer.nom || "Client" : selectedCustomer?.nom || "Client",
      grandTotal,
      totalCostAchat,
      totalMarge,
      saleStatus,
      paymentStatus,
      userId: user.uid,
      userName: user.displayName || user.email || "N/A",
      timestamp: saleTimestamp,
      devise: currentBoutiqueDetails.devise,
      paidAmount: finalPaidAmountForSale,
      remainingAmount: remainingAmountForSale,
      debitedFromClient: actualDebitedFromClient,
      saleShortId,
    };

    if (dueDate && (paymentStatus === "à crédit" || paymentStatus === "partiellement payé") && remainingAmountForSale > 0) {
      saleDataForDb.dueDate = Timestamp.fromDate(new Date(dueDate));
    }

    batch.set(saleRef, saleDataForDb);

    // Update stocks
    for (const it of validItems) {
      const productRef = doc(db, "boutiques", boutiqueId, "products", it.product!.id);
      batch.update(productRef, { stock: firebaseIncrement(-it.quantity) });
    }

    // Credit caisse if cash received (and NOT paiement sur compte)
    if (caisseDocId && finalPaidAmountForSale > 0 && paymentStatus !== "paiement sur compte") {
      const caisseDocWriteRef = doc(db, "boutiques", boutiqueId, "caisse", caisseDocId);
      batch.update(caisseDocWriteRef, { solde: firebaseIncrement(finalPaidAmountForSale) });

      const caisseTransactionRef = doc(collection(db, "boutiques", boutiqueId, "caisse", caisseDocId, "transactions"));
      batch.set(caisseTransactionRef, {
        saleId: newSaleId,
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

    // Daily stats
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

    // Product stats
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

    // Creance: create only if not paiement sur compte and paymentStatus requires
    if ((paymentStatus === "à crédit" || paymentStatus === "partiellement payé") && remainingAmountForSale > 0 && customerIdToUse && customerDataForCreance) {
      const creanceRef = doc(collection(db, "boutiques", boutiqueId, "creances"));
      const creanceData = {
        clientId: customerIdToUse,
        clientNom: customerDataForCreance.nom,
        clientTelephone: customerDataForCreance.telephone || "",
        saleId: newSaleId,
        saleShortId,
        grandTotal,
        paidAmount: finalPaidAmountForSale,
        remainingAmount: remainingAmountForSale,
        dueDate: saleDataForDb?.dueDate || null,
        saleDate: saleTimestamp,
        status: "en attente",
      };
      batch.set(creanceRef, creanceData);
    }

    // Commit
    try {
      await batch.commit();

      // optimistic UI updates
      setProducts((prev) =>
        prev.map((p) => {
          const sold = validItems.find((it) => it.product!.id === p.id);
          if (sold) return { ...p, stock: Math.max(0, p.stock - sold.quantity) };
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
      } else if (selectedCustomer) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === selectedCustomer.id
              ? {
                  ...c,
                  totalPaye: (c.totalPaye || 0) + finalPaidAmountForSale + (paymentStatus === "paiement sur compte" ? actualDebitedFromClient : 0),
                  totalAchat: (c.totalAchat || 0) + grandTotal,
                  nombreAchats: (c.nombreAchats || 0) + 1,
                  derniereVente: saleTimestamp,
                  solde: c.solde !== undefined ? c.solde - (paymentStatus === "paiement sur compte" ? actualDebitedFromClient : useClientSolde ? Number(debitAmount || 0) : 0) : c.solde,
                }
              : c
          )
        );
      }

      // reset UI
      setCartItems([]);
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

      setSubmitFeedback({ type: "success", message: "Vente enregistrée avec succès ! Facture prête." });

      // open invoice (saleId known)
      setInvoiceDataForDialog({ saleId: newSaleId, boutiqueId, userId: user.uid });
      setOpenInvoiceDialog(true);

      if (isOffline) {
        setSubmitFeedback({ type: "info", message: "Vente enregistrée localement ! Facture prête. Synchro au retour de la connexion." });
        if (offlineSaleAlertTimeoutRef.current) clearTimeout(offlineSaleAlertTimeoutRef.current);
        offlineSaleAlertTimeoutRef.current = setTimeout(() => {}, 7000);
      }
    } catch (err) {
      console.error("Erreur commit batch:", err);
      setSubmitFeedback({ type: "error", message: "Erreur enregistrement de la vente. Vérifiez la connexion et réessayez." });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- UI helpers ---------- */
  const handlePaymentStatusChange = (val: PaymentStatus) => {
    setPaymentStatus(val);
    if (val === "payé" || val === "paiement sur compte") setDueDate("");
    // paidAmount auto handled by effect
  };

  const toggleFullscreen = () => {
    const el = pageContainerRef.current as any;
    const docWithFS = document as any;
    if (!docWithFS.fullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();
    } else {
      if (docWithFS.exitFullscreen) docWithFS.exitFullscreen();
      else if (docWithFS.webkitExitFullscreen) docWithFS.webkitExitFullscreen();
      else if (docWithFS.mozCancelFullScreen) docWithFS.mozCancelFullScreen();
      else if (docWithFS.msExitFullscreen) docWithFS.msExitFullscreen();
    }
  };

  const handleRefreshPage = () => window.location.reload();

  /* ---------- Render states ---------- */
  if (loadingAuth || (user && !currentBoutiqueDetails && loadingData)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Chargement du POS...</Typography>
      </Box>
    );
  }

  if (!user && !loadingAuth)
    return (
      <Box sx={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: MODERN_BACKGROUND_GRADIENT }}>
        <Alert severity="warning" sx={{ m: 4 }}>
          Veuillez vous connecter pour accéder à cette fonctionnalité.
        </Alert>
      </Box>
    );

  if (user && !currentBoutiqueDetails && !loadingData)
    return (
      <Box sx={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: MODERN_BACKGROUND_GRADIENT }}>
        <Alert severity="error" sx={{ m: 4 }}>
          {submitFeedback?.message?.includes("Aucune boutique") ? submitFeedback.message : "Impossible de charger les informations de la boutique."}
          <Button onClick={handleRefreshPage} startIcon={<RefreshIcon />} sx={{ ml: 2 }}>
            Actualiser
          </Button>
        </Alert>
      </Box>
    );

  /* ---------------------- UI ---------------------- */
  return (
    <div
      ref={pageContainerRef}
      style={{
        width: "100%",
        minHeight: "100vh",
        height: isPageFullscreen ? "100vh" : "auto",
        overflowY: isPageFullscreen ? "hidden" : "visible",
        position: isPageFullscreen ? "fixed" : "relative",
        top: 0,
        left: 0,
        zIndex: isPageFullscreen ? 1000 : "auto",
        background: isPageFullscreen ? MODERN_BACKGROUND_GRADIENT : "transparent",
      }}
    >
      <FormWrapper sx={{ margin: isPageFullscreen ? 0 : "0 auto", borderRadius: isPageFullscreen ? 0 : theme.shape.borderRadius * 2 }}>
        <CssBaseline />
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" component="h1" fontWeight={700} color="primary.main">
            Point de Vente
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton onClick={handleRefreshPage} title="Actualiser la page">
              <RefreshIcon />
            </IconButton>

            <Chip label={isOffline ? "MODE HORS-LIGNE" : "En Ligne"} color={isOffline ? "warning" : "success"} icon={isOffline ? <OfflineIcon /> : <CloudDoneIcon />} size="small" sx={{ fontWeight: 600 }} />

            <IconButton onClick={toggleFullscreen} title={isPageFullscreen ? "Quitter plein écran" : "Plein écran"}>
              {isPageFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Stack>
        </Stack>

        <Grid container spacing={2.5}>
          <Grid item xs={12} md={7.5} sx={{ display: "flex", flexDirection: "column" }}>
            <TextField
              fullWidth
              placeholder="Rechercher un produit par nom..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setSearchTerm("")} size="small"><CloseIcon fontSize="small" /></IconButton>
                  </InputAdornment>
                ) : null,
              }}
              size="small"
              sx={{ mb: 2, backgroundColor: theme.palette.background.paper, borderRadius: 1 }}
            />

            {loadingData && products.length === 0 ? (
              <Box textAlign="center" py={3}><CircularProgress /><Typography mt={1}>Chargement des produits...</Typography></Box>
            ) : (
              <ProductGridWrapper>
                <Grid container spacing={1.5}>
                  {products.filter(p => p.nom.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                    <Grid item xs={12} sx={{ textAlign: "center", mt: 5 }}>
                      <Typography>{searchTerm ? `Aucun produit trouvé pour "${searchTerm}".` : "Aucun produit dans la boutique."}</Typography>
                    </Grid>
                  ) : (
                    products
                      .filter(p => p.nom.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((product) => (
                        <Grid item xs={6} sm={4} md={3} lg={3} key={product.id}>
                          <Card
                            sx={{
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              cursor: product.stock > 0 ? "pointer" : "not-allowed",
                              transition: "transform 0.2s, box-shadow 0.2s",
                              opacity: product.stock > 0 ? 1 : 0.6,
                              "&:hover": product.stock > 0 ? { transform: "scale(1.03)", boxShadow: theme.shadows[4] } : {},
                              backgroundColor: theme.palette.background.paper,
                            }}
                            onClick={() => product.stock > 0 && addToCart(product)}
                          >
                            {product.imageUrl ? (
                              <CardMedia component="img" height="100" image={product.imageUrl} alt={product.nom} sx={{ objectFit: "contain", p: 0.5 }} />
                            ) : (
                              <Box sx={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "grey.200" }}>
                                <AddShoppingCartIcon fontSize="large" color="action" />
                              </Box>
                            )}

                            <CardContent sx={{ flexGrow: 1, p: 1 }}>
                              <Typography variant="body2" fontWeight={500} noWrap title={product.nom}>{product.nom}</Typography>
                              <Typography variant="caption" color={product.stock > 0 ? (product.stock <= (product.seuilStockBas || 5) ? "warning.main" : "text.secondary") : "error.main"}>
                                Stock: {product.stock}
                              </Typography>
                              <Typography variant="body2" color="primary.main" fontWeight={600}>
                                {(product.prixVente ?? product.prix ?? 0).toLocaleString(undefined, { minimumFractionDigits: currentBoutiqueDetails?.devise === "XOF" || currentBoutiqueDetails?.devise === "FCFA" ? 0 : 2 })} {currentBoutiqueDetails?.devise || "€"}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))
                  )}
                </Grid>
              </ProductGridWrapper>
            )}

            {boutiqueId && user && !loadingData && currentBoutiqueDetails && (
              <Box mt={1} sx={{ maxHeight: 150, overflowY: "auto" }}>
                <RecentSalesCacheList boutiqueId={boutiqueId} userId={user.uid} pageContainerRef={pageContainerRef} isPageFullscreen={isPageFullscreen} />
              </Box>
            )}
          </Grid>

          <Grid item xs={12} md={4.5}>
            <Paper elevation={2} sx={{ p: 2, display: "flex", flexDirection: "column", height: "100%" }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: "text.secondary" }}>Panier</Typography>
              <Divider sx={{ mb: 1 }} />

              <Box sx={{ flexGrow: 1, overflowY: "auto", mb: 1 }}>
                <List dense>
                  {cartItems.length === 0 && <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ my: 3 }}>Le panier est vide.</Typography>}
                  <AnimatePresence>
                    {cartItems.map((item) => (
                      <AnimatedDiv key={item.uid} layout initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}>
                        <ListItem disablePadding sx={{ mb: 1, borderBottom: `1px solid ${theme.palette.divider}`, pb: 1 }} secondaryAction={<IconButton edge="end" aria-label="delete" onClick={() => removeCartItem(item.uid)} size="small"><DeleteIcon fontSize="small" /></IconButton>}>
                          <ListItemText
                            primary={item.product?.nom || "Produit inconnu"}
                            primaryTypographyProps={{ variant: "body2", fontWeight: 500, noWrap: true, title: item.product?.nom }}
                            secondary={
                              <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
                                <TextField
                                  type="number"
                                  size="small"
                                  variant="outlined"
                                  value={item.quantity === "" ? "" : item.quantity}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "") updateCartItem(item.uid, { quantity: "" as any });
                                    else updateCartItem(item.uid, { quantity: Math.max(1, Number(v)) });
                                  }}
                                  inputProps={{ min: 1, style: { textAlign: "center", padding: "6px 4px" } }}
                                  sx={{ width: 65, backgroundColor: theme.palette.background.paper }}
                                />
                                <TextField
                                  type="number"
                                  size="small"
                                  variant="outlined"
                                  value={item.unitPrice === "" ? "" : item.unitPrice}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "") updateCartItem(item.uid, { unitPrice: "" as any });
                                    else updateCartItem(item.uid, { unitPrice: Math.max(0, Number(v)) });
                                  }}
                                  inputProps={{ step: "any", style: { textAlign: "center", padding: "6px 4px" } }}
                                  sx={{ width: 100, backgroundColor: theme.palette.background.paper }}
                                />
                                <Typography variant="caption">{currentBoutiqueDetails?.devise || "€"}</Typography>
                                <Typography variant="body2" fontWeight="bold" sx={{ ml: "auto !important" }}>
                                  {Number(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: currentBoutiqueDetails?.devise === "XOF" || currentBoutiqueDetails?.devise === "FCFA" ? 0 : 2 })} {currentBoutiqueDetails?.devise || "€"}
                                </Typography>
                              </Stack>
                            }
                          />
                        </ListItem>
                      </AnimatedDiv>
                    ))}
                  </AnimatePresence>
                </List>
              </Box>

              <Box sx={{ mt: "auto" }}>
                <Box sx={{ mt: 1, p: 1.5, bgcolor: theme.palette.mode === "light" ? "grey.200" : "grey.800", borderRadius: 1 }}>
                  <Typography variant="h5" fontWeight={700} textAlign="right">
                    Total : {grandTotal.toLocaleString(undefined, { minimumFractionDigits: currentBoutiqueDetails?.devise === "XOF" || currentBoutiqueDetails?.devise === "FCFA" ? 0 : 2 })} {currentBoutiqueDetails?.devise || "€"}
                  </Typography>
                </Box>

                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ maxHeight: 420, overflowY: "auto", pr: 0.5, mt: 1 }}>
                  <Box>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 500, color: "text.secondary", fontSize: "0.9rem" }}>Client</Typography>

                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                      <FormControlLabel control={<Checkbox checked={isGuestClient} onChange={(e) => { setIsGuestClient(e.target.checked); if (e.target.checked) { setSelectedCustomer(null); setSaveNewCustomer(false); setNewCustomer({ nom: "", telephone: "", adresse: "", solde: 0 }); } else setGuestClient({ nom: "", telephone: "", adresse: "" }); }} />} label="Client passager (non enregistré)" />
                      <FormControlLabel control={<Checkbox checked={saveNewCustomer} onChange={(e) => { setSaveNewCustomer(e.target.checked); if (e.target.checked) { setSelectedCustomer(null); setIsGuestClient(false); } else setNewCustomer({ nom: "", telephone: "", adresse: "", solde: 0 }); }} />} label={<Typography variant="caption">Nouveau client</Typography>} />
                    </Stack>

                    {isGuestClient ? (
                      <Stack spacing={0.5}>
                        <TextField label="Nom (passager)" fullWidth value={guestClient.nom} onChange={(e) => setGuestClient({ ...guestClient, nom: e.target.value })} size="small" sx={{ backgroundColor: theme.palette.background.paper }} />
                        <TextField label="Téléphone" fullWidth value={guestClient.telephone} onChange={(e) => setGuestClient({ ...guestClient, telephone: e.target.value })} size="small" sx={{ backgroundColor: theme.palette.background.paper }} />
                        <TextField label="Adresse" fullWidth value={guestClient.adresse} onChange={(e) => setGuestClient({ ...guestClient, adresse: e.target.value })} size="small" sx={{ backgroundColor: theme.palette.background.paper }} />
                      </Stack>
                    ) : saveNewCustomer ? (
                      <Stack spacing={0.5}>
                        <TextField label="Nom du nouveau client" fullWidth value={newCustomer.nom} onChange={(e) => setNewCustomer({ ...newCustomer, nom: e.target.value })} size="small" required sx={{ backgroundColor: theme.palette.background.paper }} />
                        <TextField label="Téléphone" fullWidth value={newCustomer.telephone} onChange={(e) => setNewCustomer({ ...newCustomer, telephone: e.target.value })} size="small" sx={{ backgroundColor: theme.palette.background.paper }} />
                        <TextField label="Adresse" fullWidth value={newCustomer.adresse} onChange={(e) => setNewCustomer({ ...newCustomer, adresse: e.target.value })} size="small" sx={{ backgroundColor: theme.palette.background.paper }} />
                        <TextField label="Solde initial" type="number" fullWidth value={newCustomer.solde === "" ? "" : newCustomer.solde} onChange={(e) => { const v = e.target.value; if (v === "") setNewCustomer({ ...newCustomer, solde: "" }); else setNewCustomer({ ...newCustomer, solde: Number(v) }); }} size="small" sx={{ backgroundColor: theme.palette.background.paper }} InputProps={{ startAdornment: <InputAdornment position="start">{currentBoutiqueDetails?.devise}</InputAdornment> }} />
                      </Stack>
                    ) : (
                      <>
                        <Autocomplete
                          options={customers}
                          getOptionLabel={(c) => `${c.nom}${c.telephone ? ` - ${c.telephone}` : ""}`}
                          value={selectedCustomer}
                          isOptionEqualToValue={(opt, val) => opt.id === (val as any)?.id}
                          onChange={(_, v: Customer | null) => { setSelectedCustomer(v); if (v) { setUseClientSolde(false); setDebitAmount(0); } }}
                          renderInput={(params) => <TextField {...params} label="Sélectionner un client" size="small" sx={{ backgroundColor: theme.palette.background.paper }} />}
                          noOptionsText={loadingData && customers.length === 0 ? "Chargement..." : "Aucun client."}
                          PopperComponent={(props: MuiPopperProps) => <Popper {...props} container={pageContainerRef.current} />}
                          ListboxProps={{ style: { maxHeight: 150 } }}
                        />
                        {selectedCustomer && (
                          <Box mt={1} display="flex" gap={1} alignItems="center">
                            <Typography variant="body2">Solde: <strong>{(selectedCustomer.solde ?? 0).toLocaleString()} {currentBoutiqueDetails?.devise}</strong></Typography>
                            <FormControlLabel control={<Checkbox checked={useClientSolde} onChange={(e) => { setUseClientSolde(e.target.checked); if (!e.target.checked) setDebitAmount(0); }} />} label="Utiliser le solde du client" />
                            {useClientSolde && (
                              <TextField label="Montant à débiter" type="number" size="small" value={debitAmount === "" ? "" : debitAmount} onChange={(e) => { const v = e.target.value; if (v === "") setDebitAmount(""); else setDebitAmount(Math.max(0, Number(v))); }} InputProps={{ startAdornment: <InputAdornment position="start">{currentBoutiqueDetails?.devise}</InputAdornment>, inputProps: { max: selectedCustomer.solde ?? 0 } }} helperText={`Max utilisable: ${(selectedCustomer.solde ?? 0).toLocaleString()} ${currentBoutiqueDetails?.devise}. Montant restant: ${remainingAmount.toFixed(2)} ${currentBoutiqueDetails?.devise}`} sx={{ width: 220 }} />
                            )}
                          </Box>
                        )}
                      </>
                    )}
                  </Box>

                  <Box sx={{ mt: 1 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 500, color: "text.secondary", fontSize: "0.9rem" }}>Paiement</Typography>

                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <TextField select label="Vente" fullWidth value={saleStatus} onChange={(e) => setSaleStatus(e.target.value as SaleStatus)} size="small" SelectProps={{ MenuProps: { container: pageContainerRef.current } as Partial<MuiMenuProps> }} sx={{ backgroundColor: theme.palette.background.paper }}>
                          {SALE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>)}
                        </TextField>
                      </Grid>

                      <Grid item xs={6}>
                        <TextField select label="Paiement" fullWidth value={paymentStatus} onChange={(e) => handlePaymentStatusChange(e.target.value as PaymentStatus)} size="small" SelectProps={{ MenuProps: { container: pageContainerRef.current } as Partial<MuiMenuProps> }} sx={{ backgroundColor: theme.palette.background.paper }}>
                          {PAYMENT_STATUSES.map((p) => <MenuItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</MenuItem>)}
                        </TextField>
                      </Grid>

                      {(paymentStatus === "partiellement payé" || paymentStatus === "à crédit") && (
                        <Grid item xs={12}>
                          <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
                            <Grid container spacing={2} alignItems="flex-end">
                              <Grid item xs={12} sm={4}>
                                <TextField label="Montant payé (cash)" type="number" fullWidth value={paidAmount === "" ? "" : paidAmount} onChange={(e) => { const v = e.target.value; if (v === "") setPaidAmount(""); else setPaidAmount(Math.min(Math.max(0, Number(v)), grandTotal)); }} size="small" InputProps={{ inputProps: { min: 0, max: grandTotal, step: "any" }, startAdornment: <InputAdornment position="start">{currentBoutiqueDetails?.devise}</InputAdornment> }} />
                              </Grid>

                              <Grid item xs={12} sm={4}>
                                <TextField label="Montant restant dû" type="text" fullWidth value={Math.max(0, grandTotal - Number(paidAmount || 0)).toFixed(2)} disabled variant="filled" size="small" InputProps={{ startAdornment: <InputAdornment position="start">{currentBoutiqueDetails?.devise}</InputAdornment> }} />
                              </Grid>

                              {(paymentStatus === "partiellement payé" || paymentStatus === "à crédit") && (grandTotal - Number(paidAmount || 0)) > 0 && (
                                <Grid item xs={12} sm={4}>
                                  <TextField label="Date limite" type="date" fullWidth InputLabelProps={{ shrink: true }} value={dueDate} onChange={(e) => setDueDate(e.target.value)} size="small" />
                                </Grid>
                              )}
                            </Grid>
                          </Paper>
                        </Grid>
                      )}

                      {paymentStatus === "paiement sur compte" && (
                        <Grid item xs={12}>
                          <Alert severity="info">Le montant total sera débité du solde du client sélectionné. <strong>Ne sera pas crédité en caisse</strong> et aucune créance ne sera créée.</Alert>
                        </Grid>
                      )}

                      {paymentStatus === "payé" && (
                        <Grid item xs={12}>
                          <Paper variant="outlined" sx={{ p: 2 }}>
                            <Grid container spacing={2}>
                              <Grid item xs={12} sm={6}>
                                <TextField label="Montant payé (cash)" type="number" fullWidth value={paidAmount === "" ? "" : paidAmount} onChange={(e) => { const v = e.target.value; if (v === "") setPaidAmount(""); else setPaidAmount(Math.min(Math.max(0, Number(v)), grandTotal)); }} size="small" InputProps={{ inputProps: { min: 0, max: grandTotal, step: "any" }, startAdornment: <InputAdornment position="start">{currentBoutiqueDetails?.devise}</InputAdornment> }} />
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <TextField label="Montant restant dû" type="text" fullWidth value={Math.max(0, grandTotal - Number(paidAmount || 0)).toFixed(2)} disabled variant="filled" size="small" InputProps={{ startAdornment: <InputAdornment position="start">{currentBoutiqueDetails?.devise}</InputAdornment> }} />
                              </Grid>
                            </Grid>
                          </Paper>
                        </Grid>
                      )}
                    </Grid>
                  </Box>

                  <Box sx={{ mt: 1.5, textAlign: "center" }}>
                    <Button type="submit" variant="contained" color="primary" size="large" fullWidth disabled={
                      submitting ||
                      cartItems.length === 0 ||
                      (saveNewCustomer && !newCustomer.nom.trim()) ||
                      (paymentStatus === "partiellement payé" && (paidAmount === "" || Number(paidAmount || 0) <= 0) && grandTotal > 0) ||
                      (paymentStatus === "partiellement payé" && Number(paidAmount || 0) >= grandTotal && grandTotal > 0) ||
                      (paymentStatus === "paiement sur compte" && isGuestClient)
                    } startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <ShoppingCartIcon />} sx={{ py: 1.25 }}>
                      {submitting ? "Enregistrement..." : `Valider (${grandTotal.toLocaleString(undefined, { minimumFractionDigits: currentBoutiqueDetails?.devise === "XOF" || currentBoutiqueDetails?.devise === "FCFA" ? 0 : 2 })} ${currentBoutiqueDetails?.devise || "€"})`}
                    </Button>
                  </Box>
                </Box>

                {submitFeedback && (
                  <Alert severity={submitFeedback.type} sx={{ mt: 1 }} action={<IconButton onClick={() => setSubmitFeedback(null)} size="small"><CloseIcon fontSize="small" /></IconButton>}>
                    {submitFeedback.message}
                  </Alert>
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>

        <Dialog open={openInvoiceDialog} onClose={() => { setOpenInvoiceDialog(false); setInvoiceDataForDialog(null); }} maxWidth="md" fullWidth>
          <DialogTitle>Facture de Vente
            <IconButton onClick={() => { setOpenInvoiceDialog(false); setInvoiceDataForDialog(null); }} sx={{ position: "absolute", right: 8, top: 8 }}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent>
            {invoiceDataForDialog && boutiqueId && user && <InvoiceGenerator boutiqueId={boutiqueId} saleId={invoiceDataForDialog.saleId} userId={user.uid} type="b2c" />}
          </DialogContent>
        </Dialog>
      </FormWrapper>
    </div>
  );
}
