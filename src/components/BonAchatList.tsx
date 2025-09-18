"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  doc,
  updateDoc,
  Timestamp,
  writeBatch,
  getDoc,
  onSnapshot,
  increment,
  arrayUnion,
  getDocs,
  limit,
  orderBy as firestoreOrderBy,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  deleteDoc, 
} from "firebase/firestore";
import {
  Box, Paper, Table, TableHead, TableBody, TableRow, TableCell, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack, TextField,
  CircularProgress, Snackbar, Alert, Grid, Card, ListItemIcon, Menu, MenuItem, Chip,
  Avatar, Divider, InputAdornment, Select, FormControl, InputLabel, Tooltip // Ajout de Tooltip
} from "@mui/material";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"; // Ou AdapterDateFnsV3 / AdapterDayjs
import { fr } from "date-fns/locale"; 

import { styled, useTheme } from "@mui/material/styles";
// PapaParse n'est plus nécessaire si on télécharge en PDF
// import Papa from "papaparse";

// Icônes
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import DownloadIcon from "@mui/icons-material/Download";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PaidIcon from "@mui/icons-material/Paid";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import PhoneIcon from "@mui/icons-material/Phone";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import EventIcon from "@mui/icons-material/Event";
import ReceiptIcon from "@mui/icons-material/Receipt";
import InventoryIcon from "@mui/icons-material/Inventory";
import PaymentIcon from "@mui/icons-material/Payment";
import EuroSymbolIcon from "@mui/icons-material/EuroSymbol";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import PriceCheckIcon from "@mui/icons-material/PriceCheck";
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy'; // Pour copier l'ID

import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

// Interfaces (inchangées)
interface ShopInfo {
  nom: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  pays?: string;
  telephone?: string;
  email?: string;
  logoUrl?: string;
  siret?: string;
  numTva?: string;
  devise: string;
}

interface FirestorePurchaseOrderItem {
  productId: string;
  quantite: number;
  prixAchatUnitaire?: number;
  coutUnitaire?: number;
  nom?: string;
  nomProduit?: string;
}

interface FirestorePurchaseOrder {
  id: string;
  createdAt: Timestamp;
  etat: string;
  status: string;
  supplierName: string;
  supplierId: string;
  supplierAdresse?: string;
  supplierTelephone?: string;
  total: number;
  totalPaye?: number;
  resteAPayer?: number;
  items: FirestorePurchaseOrderItem[];
  userId?: string;
}

interface PurchaseOrder extends Omit<FirestorePurchaseOrder, "items" | "totalPaye" | "resteAPayer"> {
  items: {
    productId: string;
    quantite: number;
    prixAchatUnitaire: number;
    nomProduit: string;
  }[];
  totalPaye: number;
  resteAPayer: number;
}

// --- PDF Generation Function (MODERN DESIGN) pour bon de commande individuel ---
async function generateModernPurchaseOrderPdf(order: PurchaseOrder, shopInfo: ShopInfo, isClient: boolean): Promise<jsPDF> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const margin = 15;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageWidth = pdf.internal.pageSize.getWidth();
  let cursorY = margin; 

  const primaryColor = "#007bff"; 
  const textColor = "#333333";
  const lightTextColor = "#777777";

  const formatDateForPdf = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const addHeader = (doc: jsPDF, pageNumber: number, totalPages: number) => {
    let headerCursorY = margin;
    if (shopInfo.logoUrl && (doc as any).logoImgData) { 
      try {
        const imgProps = doc.getImageProperties((doc as any).logoImgData);
        const imgWidth = 25;
        const logoHeight = (imgProps.height * imgWidth) / imgProps.width;
        doc.addImage((doc as any).logoImgData, 'PNG', margin, headerCursorY, imgWidth, logoHeight);
        headerCursorY += logoHeight + 5;
      } catch(e) { console.error("PDF Header Logo Error:", e)}
    }

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor);
    doc.text("BON DE COMMANDE", pageWidth - margin, margin + 7, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textColor);
    doc.text(shopInfo.nom, margin, margin + 20);
    if (shopInfo.adresse) doc.text(shopInfo.adresse, margin, margin + 24);
    if (shopInfo.codePostal && shopInfo.ville) doc.text(`${shopInfo.codePostal} ${shopInfo.ville}`, margin, margin + 28);

    doc.text(`Numéro: ${order.id.substring(0,12)}`, pageWidth - margin, margin + 14, { align: 'right' });
    doc.text(`Date: ${formatDateForPdf(order.createdAt)}`, pageWidth - margin, margin + 18, { align: 'right' });
    
    doc.setDrawColor(primaryColor);
    doc.setLineWidth(0.5);
    const headerBottomY = Math.max(headerCursorY, margin + 30) + 5;
    doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);
    return headerBottomY + 5; 
  };

  const addFooter = (doc: jsPDF, pageNumber: number, totalPages: number) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightTextColor);
    const footerY = pageHeight - margin + 5;
    doc.text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
    doc.text(`${shopInfo.nom} - ${shopInfo.telephone || ''}`, margin, footerY);
    
    doc.setDrawColor(primaryColor);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - margin, pageWidth - margin, pageHeight - margin);

    if (pageNumber === totalPages) { 
        doc.setFontSize(10);
        doc.setTextColor(textColor);
        const signatureY = footerY - 25; 
        doc.text("Cachet et Signature du Responsable:", margin, signatureY);
        doc.setLineWidth(0.3);
        doc.line(margin, signatureY + 12, margin + 70, signatureY + 12); 
    }
  };

  if (shopInfo.logoUrl && isClient) {
    try {
      const response = await fetch(shopInfo.logoUrl);
      if (response.ok) {
        const blob = await response.blob();
        (pdf as any).logoImgData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) { console.error("Failed to preload logo for PDF:", e); }
  }

  autoTable(pdf, {
    head: [['Réf.', 'Description', 'Qté', `P.U. (${shopInfo.devise})`, `Total (${shopInfo.devise})`]],
    body: order.items.map(item => [
      item.productId.substring(0, 8) + '...',
      item.nomProduit,
      item.quantite,
      item.prixAchatUnitaire.toFixed(2),
      (item.quantite * item.prixAchatUnitaire).toFixed(2)
    ]),
    startY: cursorY + 65, 
    theme: 'grid', 
    styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 2,
        textColor: textColor,
    },
    headStyles: {
        fillColor: primaryColor,
        textColor: "#ffffff",
        fontStyle: 'bold',
        halign: 'center'
    },
    columnStyles: {
        0: { cellWidth: 30, halign: 'left' }, 
        1: { cellWidth: 'auto', halign: 'left' }, 
        2: { cellWidth: 15, halign: 'right' }, 
        3: { cellWidth: 30, halign: 'right' }, 
        4: { cellWidth: 30, halign: 'right' }, 
    },
    didDrawPage: (data) => {
        const totalPages = (pdf as any).internal.getNumberOfPages ? (pdf as any).internal.getNumberOfPages() : pdf.getNumberOfPages();
        addHeader(pdf, data.pageNumber, totalPages); 
        
        if (data.pageNumber === 1) {
            let supplierInfoY = margin + 40; 
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.text("Fournisseur:", margin, supplierInfoY);
            pdf.setFont('helvetica', 'normal');
            pdf.text(order.supplierName, margin + 30, supplierInfoY);
            supplierInfoY += 5;
            if (order.supplierAdresse) {
                pdf.text(order.supplierAdresse, margin + 30, supplierInfoY);
                supplierInfoY += 5;
            }
            if (order.supplierTelephone) {
                pdf.text(`Tél: ${order.supplierTelephone}`, margin + 30, supplierInfoY);
            }
        }
        addFooter(pdf, data.pageNumber, totalPages); 
    },
    margin: { top: margin + 35, bottom: margin + 20 }, 
  });

  const finalYTable = (pdf as any).lastAutoTable?.finalY || cursorY;
  const totalPagesAfterTable = (pdf as any).internal.getNumberOfPages ? (pdf as any).internal.getNumberOfPages() : pdf.getNumberOfPages();
  pdf.setPage(totalPagesAfterTable); 

  let totalsY = finalYTable + 10;
  if (totalsY > pageHeight - (margin + 35)) { 
    pdf.addPage();
    totalsY = margin + 45; 
  }
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(primaryColor);
  const totalXLabel = pageWidth - margin - 50;
  const totalXValue = pageWidth - margin;

  pdf.text(`TOTAL:`, totalXLabel, totalsY, { align: 'right' });
  pdf.text(`${order.total.toFixed(2)} ${shopInfo.devise}`, totalXValue, totalsY, { align: 'right' });
  totalsY += 7;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(textColor);
  if (order.totalPaye > 0) {
    pdf.text(`Déjà Payé:`, totalXLabel, totalsY, { align: 'right' });
    pdf.text(`${order.totalPaye.toFixed(2)} ${shopInfo.devise}`, totalXValue, totalsY, { align: 'right' });
    totalsY += 7;
  }
  if (order.resteAPayer > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor("#dc3545"); 
    pdf.text(`À Payer:`, totalXLabel, totalsY, { align: 'right' });
    pdf.text(`${order.resteAPayer.toFixed(2)} ${shopInfo.devise}`, totalXValue, totalsY, { align: 'right' });
  }
  
  const qrCodeSize = 25;
  const currentPageInfo = (pdf as any).internal.getCurrentPageInfo ? (pdf as any).internal.getCurrentPageInfo() : { pageNumber: totalPagesAfterTable };
  const currentTotalsPage = currentPageInfo.pageNumber;
  const qrCodeY = pageHeight - margin - 15 - qrCodeSize; 

  if (totalsY < qrCodeY - 10 && currentTotalsPage === ((pdf as any).internal.getNumberOfPages ? (pdf as any).internal.getNumberOfPages() : pdf.getNumberOfPages()) ) { 
    try {
        const qrText = `BC_ID: ${order.id}, Total: ${order.total.toFixed(2)} ${shopInfo.devise}`;
        const qrDataUrl = await QRCode.toDataURL(qrText, { errorCorrectionLevel: 'M', width: 80, margin: 1 });
        pdf.addImage(qrDataUrl, 'PNG', margin + 80, pageHeight - margin - 10 - qrCodeSize, qrCodeSize, qrCodeSize); 
    } catch (err) {
        console.error('Erreur génération QR Code pour PDF:', err);
    }
  }

  return pdf;
}


// --- Composants Stylisés ---
const ModernDialogTitle = styled(DialogTitle)(({ theme }) => ({
  fontFamily: "var(--font-poppins), Poppins, sans-serif",
  fontWeight: 600,
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.primary.main,
  color: theme.palette.common.white,
  padding: theme.spacing(1.5, 2.5),
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
}));

const ModernDialogContent = styled(DialogContent)(({ theme }) => ({
  fontFamily: "var(--font-poppins), Poppins, sans-serif",
  padding: theme.spacing(2, 2.5),
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[900] : theme.palette.background.default,
}));

const DetailItem = ({ icon, label, value, isId = false, onCopy, copyLabel = "Copier" }: { 
  icon: React.ReactNode; 
  label: string; 
  value: React.ReactNode; 
  isId?: boolean;
  onCopy?: () => void;
  copyLabel?: string;
}) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.8 }}>
    <Avatar sx={{ bgcolor: "primary.light", width: 32, height: 32, color: "primary.main", '& .MuiSvgIcon-root': { fontSize: '1rem' } }}>{icon}</Avatar>
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "inherit", display: "block", lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" fontWeight={500} sx={{ fontFamily: "inherit", lineHeight: 1.3, wordBreak: isId ? 'break-all' : 'normal' }}>
        {value || "N/A"}
      </Typography>
    </Box>
    {isId && onCopy && (
      <Tooltip title={copyLabel}>
        <IconButton onClick={onCopy} size="small" sx={{ml:1}}>
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    )}
  </Stack>
);

const PAGE_SIZE = 5;

export default function PurchaseOrderList() {
  const theme = useTheme();
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true); // Initial loading state
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [confirmMarkPaidOpen, setConfirmMarkPaidOpen] = useState(false);
  const [orderToMarkPaid, setOrderToMarkPaid] = useState<PurchaseOrder | null>(null);
  const [confirmValidateOrderOpen, setConfirmValidateOrderOpen] = useState(false);
  const [orderToValidate, setOrderToValidate] = useState<PurchaseOrder | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [orderForDetails, setOrderForDetails] = useState<PurchaseOrder | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("success");
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [currentPdfOrder, setCurrentPdfOrder] = useState<PurchaseOrder | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfDataUri, setPdfDataUri] = useState<string | null>(null);
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [currentActionOrder, setCurrentActionOrder] = useState<PurchaseOrder | null>(null);
  const openActionMenu = Boolean(anchorEl);

  const [searchInput, setSearchInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  const [downloadPeriod, setDownloadPeriod] = useState<string>("current_month");
  const [downloadStartDate, setDownloadStartDate] = useState<Date | null>(null);
  const [downloadEndDate, setDownloadEndDate] = useState<Date | null>(null);
  const [isDownloadingList, setIsDownloadingList] = useState(false);

  const formatDateSafe = useCallback((timestamp: Timestamp | undefined, options?: Intl.DateTimeFormatOptions): string => {
    if (!isClient || !timestamp) return timestamp?.toDate().toISOString().split('T')[0] || "N/A"; 
    const defaultOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return timestamp.toDate().toLocaleDateString('fr-FR', { ...defaultOptions, ...options });
  }, [isClient]);

  const formatDateTimeSafe = useCallback((timestamp: Timestamp | undefined): string => {
    if (!isClient || !timestamp) return timestamp?.toDate().toISOString().replace('T', ' ').substring(0,16) || "N/A"; 
    return timestamp.toDate().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }, [isClient]);


  useEffect(() => {
    if (loadingAuth) return;
    if (!user) {
      setLoadingOrders(false);
      return;
    }
    const bq = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid));
    const unsubBoutique = onSnapshot(
      bq,
      (snap) => {
        if (!snap.empty) {
          const boutiqueDoc = snap.docs[0];
          setBoutiqueId(boutiqueDoc.id);
          const boutiqueData = boutiqueDoc.data();
          setShopInfo({
            nom: boutiqueData.nom || "Nom de votre boutique",
            adresse: boutiqueData.adresse, ville: boutiqueData.ville, codePostal: boutiqueData.codePostal,
            pays: boutiqueData.pays, telephone: boutiqueData.telephone, email: boutiqueData.email,
            logoUrl: boutiqueData.logoUrl, siret: boutiqueData.siret, numTva: boutiqueData.numTva,
            devise: boutiqueData.devise || "€",
          });
        } else {
          setBoutiqueId(null); setShopInfo(null);
          console.warn("Aucune boutique trouvée pour l'utilisateur:", user.uid);
          setLoadingOrders(false); 
          setOrders([]); 
        }
      },
      (error) => {
        console.error("Erreur lors de la récupération de la boutiqueId:", error);
        setSnackbarMessage("Erreur de chargement de la boutique."); setSnackbarSeverity("error"); setSnackbarOpen(true);
        setLoadingOrders(false);
      }
    );
    return () => unsubBoutique();
  }, [user, loadingAuth]);

  const mapDocToPurchaseOrder = useCallback((d: QueryDocumentSnapshot<DocumentData> | DocumentData, docIdFromSnap?: string): PurchaseOrder | null => {
    const rawData = typeof d.data === 'function' ? d.data() as Omit<FirestorePurchaseOrder, "id"> : d as Omit<FirestorePurchaseOrder, "id">;
    const id = (d as QueryDocumentSnapshot).id || docIdFromSnap; 

    if (!id || !rawData.createdAt?.seconds || typeof rawData.supplierId !== "string" || rawData.supplierId.trim() === "" || !Array.isArray(rawData.items)) {
        console.warn("BC ignoré (données Firestore de base manquantes/invalides):", id, rawData); return null;
    }
    const total = typeof rawData.total === "number" ? rawData.total : 0;
    const totalPaye = typeof rawData.totalPaye === "number" ? rawData.totalPaye : 0;
    let resteAPayer = typeof rawData.resteAPayer === "number" ? rawData.resteAPayer : total - totalPaye;
    resteAPayer = Math.max(0, resteAPayer);

    const normalizedItems = (rawData.items || []).map((item: FirestorePurchaseOrderItem) => ({
        productId: item.productId || `unknown-id-${isClient ? Math.random().toString(16).slice(2) : 'server-default'}`,
        quantite: typeof item.quantite === "number" && !isNaN(item.quantite) ? item.quantite : 0,
        prixAchatUnitaire: (typeof item.prixAchatUnitaire === "number" && !isNaN(item.prixAchatUnitaire)) ? item.prixAchatUnitaire : (typeof item.coutUnitaire === "number" && !isNaN(item.coutUnitaire) ? item.coutUnitaire : 0),
        nomProduit: item.nomProduit || item.nom || "Produit Inconnu",
    })).filter((item) => item.productId && item.nomProduit !== "Produit Inconnu");

    let createdAtTimestamp = rawData.createdAt;
    if (rawData.createdAt && typeof rawData.createdAt.toDate !== "function" && typeof rawData.createdAt.seconds === "number") {
        createdAtTimestamp = new Timestamp(rawData.createdAt.seconds, rawData.createdAt.nanoseconds || 0);
    }
    
    return {
        id: id, createdAt: createdAtTimestamp, etat: typeof rawData.etat === "string" ? rawData.etat : "en_attente",
        status: typeof rawData.status === "string" ? rawData.status : "non_payé",
        supplierName: typeof rawData.supplierName === "string" ? rawData.supplierName : "Fournisseur Inconnu",
        supplierId: rawData.supplierId, supplierAdresse: rawData.supplierAdresse, supplierTelephone: rawData.supplierTelephone,
        total, totalPaye, resteAPayer, items: normalizedItems, userId: rawData.userId,
    } as PurchaseOrder;
  }, [isClient]);

  const fetchOrders = useCallback(async (loadMore = false) => {
    if (!boutiqueId) {
      setOrders([]); setLoadingOrders(false); setHasMoreOrders(false); setIsSearchActive(false);
      return;
    }
    
    if (!loadMore) { 
      setLoadingOrders(true); // Uniquement pour le chargement initial ou le refresh
      setLastVisibleDoc(null); 
      setIsSearchActive(false); 
    } else { 
      setIsFetchingMore(true); 
    }

    try {
      const poCol = collection(db, "boutiques", boutiqueId, "purchaseOrders");
      let qConstraints: any[] = [firestoreOrderBy("createdAt", "desc"), limit(PAGE_SIZE)]; 
      if (loadMore && lastVisibleDoc) {
        qConstraints.push(startAfter(lastVisibleDoc));
      }
      const q = query(poCol, ...qConstraints);
      
      const querySnapshot = await getDocs(q);
      const fetchedOrders = querySnapshot.docs
        .map(docSnapshot => mapDocToPurchaseOrder(docSnapshot))
        .filter((o): o is PurchaseOrder => o !== null);

      setOrders(prevOrders => loadMore ? [...prevOrders, ...fetchedOrders] : fetchedOrders);
      
      const lastDocInSnapshot = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastVisibleDoc(lastDocInSnapshot || null);
      setHasMoreOrders(querySnapshot.docs.length === PAGE_SIZE);

    } catch (error) {
      console.error("Erreur lors de la récupération des BC:", error);
      setSnackbarMessage("Erreur de chargement des commandes."); setSnackbarSeverity("error"); setSnackbarOpen(true);
    } finally {
      // setLoadingOrders(false) est important ici pour arrêter le spinner initial
      // et le spinner de "charger plus".
      if (!loadMore) setLoadingOrders(false); 
      if (loadMore) setIsFetchingMore(false);
    }
  // Correction ici: Retiré lastVisibleDoc des dépendances pour éviter boucle. mapDocToPurchaseOrder doit y être.
  }, [boutiqueId, mapDocToPurchaseOrder]); 

  useEffect(() => {
    // Ce useEffect gère le chargement initial des commandes quand boutiqueId est disponible.
    // Il ne doit pas dépendre de `lastVisibleDoc` ou `fetchOrders` de manière à causer une boucle.
    if (boutiqueId && user && !loadingAuth && !isSearchActive) {
      // Si on n'est pas en train de chercher, on charge la première page.
      // setLoadingOrders(true); // Déjà géré dans fetchOrders(false)
      fetchOrders(false); // false indique que ce n'est pas "charger plus"
    } else if (!boutiqueId && !loadingAuth && user) {
        // S'il n'y a pas de boutique, on vide la liste et on arrête de charger.
        setOrders([]); 
        setLoadingOrders(false); 
        setHasMoreOrders(false);
    }
  // fetchOrders est maintenant stable grâce à la correction de son useCallback, donc on peut l'ajouter ici.
  }, [boutiqueId, user, loadingAuth, isSearchActive, fetchOrders]);


  const handleSearchById = async () => {
    if (!boutiqueId || !searchInput.trim()) {
      setSnackbarMessage("Veuillez entrer un ID de bon de commande.");
      setSnackbarSeverity("warning");
      setSnackbarOpen(true);
      return;
    }
    setIsSearching(true);
    setLoadingOrders(true); // Afficher un spinner global pour la recherche
    try {
      const orderRef = doc(db, "boutiques", boutiqueId, "purchaseOrders", searchInput.trim());
      const docSnap = await getDoc(orderRef);

      if (docSnap.exists()) {
        const foundOrder = mapDocToPurchaseOrder(docSnap.data(), docSnap.id);
        if (foundOrder) {
          setOrders([foundOrder]);
          setHasMoreOrders(false); 
          setIsSearchActive(true); 
          setSnackbarMessage(`Bon de commande ${foundOrder.id.substring(0,8)} trouvé.`);
          setSnackbarSeverity("success");
        } else {
          setOrders([]);
          setHasMoreOrders(false);
          setSnackbarMessage("ID trouvé mais données de commande invalides.");
          setSnackbarSeverity("error");
        }
      } else {
        setOrders([]);
        setHasMoreOrders(false);
        setSnackbarMessage("Aucun bon de commande trouvé avec cet ID.");
        setSnackbarSeverity("info");
      }
    } catch (error) {
      console.error("Erreur lors de la recherche du BC par ID:", error);
      setSnackbarMessage("Erreur lors de la recherche.");
      setSnackbarSeverity("error");
      setOrders([]); 
      setHasMoreOrders(false);
    } finally {
      setIsSearching(false);
      setLoadingOrders(false); // Arrêter le spinner global
      setSnackbarOpen(true);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setIsSearchActive(false); // Cela va déclencher le useEffect pour re-fetch la liste initiale
    // fetchOrders(false); // Plus besoin ici car le changement de isSearchActive le fera
  };

  const devise = useMemo(() => shopInfo?.devise || "€", [shopInfo]);
  const grandTotalPaye = useMemo(() => orders.reduce((sum, order) => sum + (order.totalPaye || 0), 0), [orders]);
  const grandTotalResteAPayer = useMemo(() => orders.reduce((sum, order) => sum + (order.resteAPayer || 0), 0), [orders]);
  
  const updateCaisseOnPayment = async (
    batch: ReturnType<typeof writeBatch>,
    montantPaye: number,
    purchaseOrder: PurchaseOrder,
    newPaymentStatusForOrder: string
  ): Promise<{ caisseUpdated: boolean; caisseMessage?: string }> => {
    if (!boutiqueId || !user) {
      console.error("Données manquantes pour la mise à jour de la caisse (boutique/user).");
      return { caisseUpdated: false, caisseMessage: "Configuration incomplète (boutique/user)." };
     }

    const caisseCollectionRef = collection(db, "boutiques", boutiqueId, "caisse");
    try {
      const caisseQuery = query(caisseCollectionRef, limit(1));
      const caisseQuerySnapshot = await getDocs(caisseQuery);

      if (caisseQuerySnapshot.empty) {
        console.error("Aucun document de caisse trouvé dans la sous-collection 'caisse'.");
        return { caisseUpdated: false, caisseMessage: "Document de caisse non trouvé. Contactez l'administrateur." };
      }
      
      const caisseDocSnap = caisseQuerySnapshot.docs[0];
      const caisseDocRef = caisseDocSnap.ref; 

      const caisseData = caisseDocSnap.data();
      if (caisseData.status === "ouvert") {
        const ancienSoldeCaisse = typeof caisseData.solde === 'number' ? caisseData.solde : 0;
        const nouveauSoldeCaisse = ancienSoldeCaisse - montantPaye; 
        batch.update(caisseDocRef, { solde: nouveauSoldeCaisse });

        const transactionCaisseRef = doc(collection(caisseDocRef, "transactions")); 
        batch.set(transactionCaisseRef, {
            ancienSolde: ancienSoldeCaisse,
            montant: montantPaye, 
            nouveauSolde: nouveauSoldeCaisse,
            paymentStatus: newPaymentStatusForOrder, 
            purchaseId: purchaseOrder.id, 
            description: `Achat (${purchaseOrder.supplierName} - ${purchaseOrder.id.substring(0, 6)}...)`,
            timestamp: Timestamp.now(),
            type: "Achat",
            userId: user.uid,
        });
        return { caisseUpdated: true, caisseMessage: "Transaction enregistrée en caisse." };
      } else {
        console.warn(`Caisse (ID: ${caisseDocSnap.id}) est fermée. Transaction non enregistrée en caisse.`);
        return { caisseUpdated: false, caisseMessage: "La caisse est fermée. Transaction non enregistrée." };
      }
    } catch (error: any) {
      console.error("Erreur lors de la récupération ou mise à jour de la caisse:", error);
      return { caisseUpdated: false, caisseMessage: `Erreur caisse: ${error.message || 'Inconnue'}` };
    }
  };

  const handleActionMenuClick = (event: React.MouseEvent<HTMLElement>, order: PurchaseOrder) => { setAnchorEl(event.currentTarget); setCurrentActionOrder(order); };
  const handleActionMenuClose = () => { setAnchorEl(null); setCurrentActionOrder(null); };

  const execOpenDetailsDialog = (order: PurchaseOrder) => { setOrderForDetails(order); setOrderDetailsOpen(true); handleActionMenuClose(); };
  const execOpenValidateOrderDialog = (order: PurchaseOrder) => {
    if (!order.items || order.items.length === 0) {
      setSnackbarMessage(`Le BC ${order.id.substring(0, 8)}... n'a pas d'articles.`); setSnackbarSeverity("warning"); setSnackbarOpen(true); return;
    }
    setOrderToValidate(order); setConfirmValidateOrderOpen(true); handleActionMenuClose();
  };
  const execOpenMarkPaidDialog = (order: PurchaseOrder) => { setOrderToMarkPaid(order); setConfirmMarkPaidOpen(true); handleActionMenuClose(); };
  const execOpenAddPaymentDialog = (order: PurchaseOrder) => { setSelectedOrderForPayment(order); setPayAmount(order.resteAPayer > 0 ? Math.max(0.01, order.resteAPayer) : 0); handleActionMenuClose(); };
  const execOpenDeleteOrderDialog = (order: PurchaseOrder) => {
    setOrderToDelete(order);
    setConfirmDeleteOpen(true);
    handleActionMenuClose();
  };
  
  const execGenerateAndPreviewPdf = async (order: PurchaseOrder) => {
    if (!order || !shopInfo) {
      setSnackbarMessage("Données de commande ou boutique manquantes pour le PDF."); setSnackbarSeverity("error"); setSnackbarOpen(true); return;
    }
    if (!isClient) {
      setSnackbarMessage("Veuillez patienter, initialisation côté client..."); setSnackbarSeverity("info"); setSnackbarOpen(true); return;
    }
    handleActionMenuClose();
    setCurrentPdfOrder(order); setIsGeneratingPdf(true);
    setSnackbarMessage("Génération du PDF en cours..."); setSnackbarSeverity("info"); setSnackbarOpen(true);

    try {
      const pdfDoc = await generateModernPurchaseOrderPdf(order, shopInfo, isClient);
      const pdfUri = pdfDoc.output("datauristring");
      setPdfDataUri(pdfUri); setPdfPreviewOpen(true);
      setSnackbarMessage("PDF généré avec succès !"); setSnackbarSeverity("success");
    } catch (err: any) { 
      console.error("Erreur lors de la génération du PDF :", err);
      setSnackbarMessage(`Erreur de génération PDF: ${err.message || "Vérifiez la console."}`); setSnackbarSeverity("error");
    } finally {
      setIsGeneratingPdf(false); setSnackbarOpen(true); 
    }
  };
  
  const handleCloseMarkPaidDialog = () => { setConfirmMarkPaidOpen(false); setOrderToMarkPaid(null); };
  const confirmAndMarkPaid = async () => {
    if (!boutiqueId || !orderToMarkPaid || !user) return;
    const batch = writeBatch(db);
    const orderRef = doc(db, "boutiques", boutiqueId, "purchaseOrders", orderToMarkPaid.id);
    const montantAPayerPourCaisse = orderToMarkPaid.resteAPayer; 
    const newPaymentStatusForOrder = "payé";
    
    let finalSnackbarSeverity: "success" | "warning" | "error" = "success";
    let finalSnackbarMessage = "";

    try {
      batch.update(orderRef, { status: newPaymentStatusForOrder, totalPaye: orderToMarkPaid.total, resteAPayer: 0 });
      let caisseResult = { caisseUpdated: false, caisseMessage: "" };
      if (montantAPayerPourCaisse > 0) {
          caisseResult = await updateCaisseOnPayment(batch, montantAPayerPourCaisse, orderToMarkPaid, newPaymentStatusForOrder);
      }
      
      await batch.commit();

      finalSnackbarMessage = `BC ${orderToMarkPaid.id.substring(0, 8)} marqué comme payé.`;
      if (montantAPayerPourCaisse > 0) {
        if (caisseResult.caisseUpdated) {
          finalSnackbarMessage += ` ${caisseResult.caisseMessage || "Caisse mise à jour."}`;
        } else {
          finalSnackbarMessage += ` ${caisseResult.caisseMessage || "Problème avec la caisse, transaction non enregistrée."}`;
          finalSnackbarSeverity = "warning";
        }
      }
      if (!isSearchActive) fetchOrders(false); else {
        setOrders(prev => prev.map(o => o.id === orderToMarkPaid.id ? {...o, status: newPaymentStatusForOrder, totalPaye: o.total, resteAPayer: 0} : o));
      }
    } catch (error: any) {
      console.error("Erreur marquage payé:", error);
      finalSnackbarMessage = `Erreur: ${error.message || "Le BC n'a pas pu être marqué payé."}`;
      finalSnackbarSeverity = "error";
    } finally {
      setSnackbarMessage(finalSnackbarMessage);
      setSnackbarSeverity(finalSnackbarSeverity);
      setSnackbarOpen(true); 
      handleCloseMarkPaidDialog();
    }
  };

  const handleCloseValidateOrderDialog = () => { setConfirmValidateOrderOpen(false); setOrderToValidate(null); };
  const validateOrder = async () => {
    if (!boutiqueId || !orderToValidate || !orderToValidate.items || orderToValidate.items.length === 0) {
      setSnackbarMessage("Impossible de valider : commande ou articles manquants."); setSnackbarSeverity("error"); setSnackbarOpen(true); return;
    }
    setIsValidating(true);
    const batch = writeBatch(db);
    const orderRef = doc(db, "boutiques", boutiqueId, "purchaseOrders", orderToValidate.id);
    try {
      batch.update(orderRef, { etat: "validé" });
      for (const item of orderToValidate.items) {
        if (!item.productId || typeof item.quantite !== "number" || typeof item.prixAchatUnitaire !== "number") {
          throw new Error(`Données d'article invalides pour ${item.nomProduit || item.productId}`);
        }
        const productRef = doc(db, "boutiques", boutiqueId, "products", item.productId);
        batch.update(productRef, { stock: increment(item.quantite), cout: item.prixAchatUnitaire });
      }
      const today = new Date(); const year = today.getFullYear(); const month = String(today.getMonth() + 1).padStart(2, "0"); const day = String(today.getDate()).padStart(2, "0");
      const statsDocId = `${year}-${month}-${day}`;
      const achatStatsRef = doc(db, "boutiques", boutiqueId, "achatStats", statsDocId);
      const achatStatsDoc = await getDoc(achatStatsRef); 
      const statDetail = {
        orderId: orderToValidate.id, supplierId: orderToValidate.supplierId, supplierName: orderToValidate.supplierName,
        montant: orderToValidate.total, validatedAt: Timestamp.now(),
      };
      if (achatStatsDoc.exists()) {
        batch.update(achatStatsRef, { montantTotalJournee: increment(orderToValidate.total), achatsDetails: arrayUnion(statDetail) });
      } else {
        batch.set(achatStatsRef, { montantTotalJournee: orderToValidate.total, achatsDetails: [statDetail], date: Timestamp.fromDate(new Date(year, today.getMonth(), day)) });
      }
      if (orderToValidate.supplierId) {
        const supplierRef = doc(db, "boutiques", boutiqueId, "suppliers", orderToValidate.supplierId);
        batch.update(supplierRef, { solde: increment(orderToValidate.total) }); 
      }
      await batch.commit();
      setSnackbarMessage(`BC ${orderToValidate.id.substring(0, 8)} validé et stocks mis à jour.`); setSnackbarSeverity("success");
      if (!isSearchActive) fetchOrders(false); else {
        setOrders(prev => prev.map(o => o.id === orderToValidate.id ? {...o, etat: "validé"} : o));
      }
    } catch (error: any) {
      console.error("Erreur validation:", error);
      setSnackbarMessage(`Erreur validation: ${error.message || "Inconnue"}`); setSnackbarSeverity("error");
    } finally {
      setIsValidating(false); setSnackbarOpen(true); handleCloseValidateOrderDialog();
    }
  };
  
  const handleCloseAddPaymentDialog = () => { setSelectedOrderForPayment(null); setPayAmount(0); };
  const addPayment = async () => {
    if (!boutiqueId || !selectedOrderForPayment || payAmount <= 0 || !user) return;
    if (payAmount > selectedOrderForPayment.resteAPayer + 0.001) { 
        setSnackbarMessage("Le montant du paiement ne peut pas dépasser le reste à payer."); setSnackbarSeverity("warning"); setSnackbarOpen(true); return;
    }
    const batch = writeBatch(db);
    const orderRef = doc(db, "boutiques", boutiqueId, "purchaseOrders", selectedOrderForPayment.id);
    const newTotalPaye = (selectedOrderForPayment.totalPaye || 0) + payAmount;
    const newResteAPayer = Math.max(0, (selectedOrderForPayment.total || 0) - newTotalPaye);
    const newPaymentStatusForOrder = newResteAPayer <= 0 ? "payé" : "partiellement_payé";

    let finalSnackbarSeverity: "success" | "warning" | "error" = "success";
    let finalSnackbarMessage = "";

    try {
      batch.update(orderRef, { totalPaye: newTotalPaye, resteAPayer: newResteAPayer, status: newPaymentStatusForOrder });
      const paymentLogRef = doc(collection(db, "boutiques", boutiqueId, "purchaseOrders", selectedOrderForPayment.id, "payments"));
      batch.set(paymentLogRef, { montant: payAmount, date: Timestamp.now(), userId: user.uid });

      const caisseResult = await updateCaisseOnPayment(batch, payAmount, selectedOrderForPayment, newPaymentStatusForOrder);
      
      await batch.commit();

      finalSnackbarMessage = "Paiement enregistré.";
      if (caisseResult.caisseUpdated) {
        finalSnackbarMessage += ` ${caisseResult.caisseMessage || "Caisse mise à jour."}`;
      } else {
        finalSnackbarMessage += ` ${caisseResult.caisseMessage || "Problème avec la caisse, transaction non enregistrée."}`;
        finalSnackbarSeverity = "warning";
      }

      if (!isSearchActive) fetchOrders(false); else {
         setOrders(prev => prev.map(o => o.id === selectedOrderForPayment.id ? {...o, totalPaye: newTotalPaye, resteAPayer: newResteAPayer, status: newPaymentStatusForOrder} : o));
      }
      handleCloseAddPaymentDialog();
    } catch (error: any) {
      console.error("Erreur ajout paiement:", error);
      finalSnackbarMessage = `Erreur: ${error.message || "Paiement non enregistré."}`;
      finalSnackbarSeverity = "error";
    } finally {
      setSnackbarMessage(finalSnackbarMessage);
      setSnackbarSeverity(finalSnackbarSeverity);
      setSnackbarOpen(true);
    }
  };

  const handleCloseDeleteDialog = () => { setConfirmDeleteOpen(false); setOrderToDelete(null); };
  const handleDeleteOrder = async () => {
    if (!boutiqueId || !orderToDelete) return;
    setIsDeleting(true);
    try {
      const orderRef = doc(db, "boutiques", boutiqueId, "purchaseOrders", orderToDelete.id);
      await deleteDoc(orderRef);
      setSnackbarMessage(`Bon de commande ${orderToDelete.id.substring(0,8)} supprimé.`);
      setSnackbarSeverity("success");
      fetchOrders(false); 
      handleCloseDeleteDialog();
    } catch (error: any) {
      console.error("Erreur suppression BC:", error);
      setSnackbarMessage(`Erreur: ${error.message || "Le BC n'a pas pu être supprimé."}`);
      setSnackbarSeverity("error");
    } finally {
      setIsDeleting(false);
      setSnackbarOpen(true);
    }
  };

  const handleDownloadOrdersListAsPdf = async () => {
    if (!boutiqueId || !shopInfo || !isClient) {
      setSnackbarMessage("Impossible de générer le PDF. Données manquantes ou client non prêt.");
      setSnackbarSeverity("error");
      setSnackbarOpen(true);
      return;
    }
    setIsDownloadingList(true);
    setSnackbarMessage("Préparation du PDF..."); setSnackbarSeverity("info"); setSnackbarOpen(true);

    let startDateRange: Date | null = null;
    let endDateRange: Date | null = null;
    const now = new Date();

    if (downloadPeriod === "custom") {
        if (downloadStartDate && downloadEndDate) {
            startDateRange = new Date(downloadStartDate);
            endDateRange = new Date(downloadEndDate);
        } else {
            setSnackbarMessage("Veuillez sélectionner une date de début et de fin.");
            setSnackbarSeverity("warning"); setSnackbarOpen(true); setIsDownloadingList(false);
            return;
        }
    } else if (downloadPeriod === "last_week") {
        const end = new Date(now);
        end.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1) -1);
        const start = new Date(end);
        start.setDate(end.getDate() - 6);
        startDateRange = start; endDateRange = end;
    } else if (downloadPeriod === "last_month") {
        startDateRange = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDateRange = new Date(now.getFullYear(), now.getMonth(), 0);
    } else { 
        startDateRange = new Date(now.getFullYear(), now.getMonth(), 1);
        endDateRange = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    
    if (!startDateRange || !endDateRange) {
        setSnackbarMessage("Période de téléchargement invalide."); setSnackbarSeverity("error");
        setSnackbarOpen(true); setIsDownloadingList(false); return;
    }

    const startDateTS = Timestamp.fromDate(new Date(startDateRange.setHours(0,0,0,0)));
    const endDateTS = Timestamp.fromDate(new Date(endDateRange.setHours(23,59,59,999)));

    try {
      const poCol = collection(db, "boutiques", boutiqueId, "purchaseOrders");
      const q = query(poCol, 
                      where("createdAt", ">=", startDateTS), 
                      where("createdAt", "<=", endDateTS),
                      firestoreOrderBy("createdAt", "desc"));
      
      const querySnapshot = await getDocs(q);
      const ordersToDownload = querySnapshot.docs
        .map(docSnapshot => mapDocToPurchaseOrder(docSnapshot.data(), docSnapshot.id))
        .filter((o): o is PurchaseOrder => o !== null);

      if (ordersToDownload.length === 0) {
        setSnackbarMessage("Aucun bon de commande trouvé pour cette période."); setSnackbarSeverity("info");
        setIsDownloadingList(false); setSnackbarOpen(true); return;
      }

      // Génération du PDF pour la liste
      const pdf = new jsPDF('l', 'mm', 'a4'); // l for landscape
      pdf.setFontSize(18);
      pdf.text(`Liste des Bons de Commande - ${shopInfo.nom}`, 14, 20);
      pdf.setFontSize(10);
      pdf.text(`Période: ${formatDateSafe(Timestamp.fromDate(startDateRange))} au ${formatDateSafe(Timestamp.fromDate(endDateRange))}`, 14, 28);

      const tableColumn = ["ID", "Date", "Fournisseur", "État", "Statut Pmt", "Total", "Payé", "Reste"];
      const tableRows: (string | number)[][] = [];

      ordersToDownload.forEach(order => {
          const orderData = [
              order.id.substring(0,8) + "...",
              formatDateTimeSafe(order.createdAt),
              order.supplierName,
              order.etat,
              order.status,
              order.total.toFixed(2),
              order.totalPaye.toFixed(2),
              order.resteAPayer.toFixed(2),
          ];
          tableRows.push(orderData);
      });

      autoTable(pdf, {
          head: [tableColumn],
          body: tableRows,
          startY: 35,
          theme: 'striped',
          headStyles: { fillColor: [22, 160, 133] }, // Exemple de couleur
          // styles: { cellWidth: 'wrap'}, // Peut causer des problèmes si trop de colonnes
      });
      
      const startDateFormatted = startDateRange.toLocaleDateString('fr-CA');
      const endDateFormatted = endDateRange.toLocaleDateString('fr-CA');
      pdf.save(`liste_bons_achats_${startDateFormatted}_au_${endDateFormatted}.pdf`);

      setSnackbarMessage("PDF de la liste généré."); setSnackbarSeverity("success");
    } catch (error: any) {
      console.error("Erreur téléchargement liste BC PDF:", error);
      setSnackbarMessage(`Erreur PDF: ${error.message || "Échec du téléchargement."}`);
      setSnackbarSeverity("error");
    } finally {
      setIsDownloadingList(false);
      setSnackbarOpen(true);
    }
  };

  const handleCopyOrderId = (orderId: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(orderId).then(() => {
        setSnackbarMessage("ID du Bon de Commande copié !");
        setSnackbarSeverity("success");
        setSnackbarOpen(true);
      }).catch(err => {
        console.error("Erreur copie ID:", err);
        setSnackbarMessage("Erreur lors de la copie de l'ID.");
        setSnackbarSeverity("error");
        setSnackbarOpen(true);
      });
    } else {
      // Fallback pour navigateurs sans clipboard API (rare)
      setSnackbarMessage("La copie n'est pas supportée par votre navigateur.");
      setSnackbarSeverity("warning");
      setSnackbarOpen(true);
    }
  };


  const handleCloseDetailsDialog = () => { setOrderDetailsOpen(false); setOrderForDetails(null); };
  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => { if (reason === "clickaway") return; setSnackbarOpen(false); };
  const handleClosePdfPreview = () => { setPdfPreviewOpen(false); setPdfDataUri(null); setCurrentPdfOrder(null); };
  const handleDownloadPdf = () => {
    if (pdfDataUri && currentPdfOrder && shopInfo) {
      const link = document.createElement("a");
      link.href = pdfDataUri;
      link.download = `BC-${currentPdfOrder.id.substring(0, 8)}-${currentPdfOrder.supplierName.replace(/\s+/g,"_")}.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
  };
  const handlePrintPdf = () => {
    if (pdfDataUri) {
      const iframe = document.createElement("iframe");
      Object.assign(iframe.style, { visibility: "hidden", position: "absolute", width: "0", height: "0", border: "0" });
      iframe.src = pdfDataUri;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus(); iframe.contentWindow?.print();
        } catch (e) {
          console.error("Erreur d'impression:", e);
          setSnackbarMessage("Erreur d'impression. Veuillez télécharger et imprimer manuellement."); setSnackbarSeverity("error"); setSnackbarOpen(true);
        } finally {
          setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1000); 
        }
      };
      iframe.onerror = () => {
        console.error("Erreur de chargement de l'iframe pour l'impression.");
        setSnackbarMessage("Erreur de chargement pour l'impression."); setSnackbarSeverity("error"); setSnackbarOpen(true);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };
    }
  };

  // Vérification pour le chargement initial
  const initialLoading = loadingAuth || !isClient || (loadingOrders && orders.length === 0 && !isFetchingMore && !isSearchActive);

  if (initialLoading) {
    return (<Box display="flex" justifyContent="center" alignItems="center" minHeight="calc(100vh - 128px)"><CircularProgress size={50} /></Box>);
  }
  if (!user) {
    return (<Box p={3} textAlign="center"><Typography variant="h6">Veuillez vous connecter.</Typography></Box>);
  }
  if (!boutiqueId || !shopInfo) {
    return (<Box p={3} textAlign="center"><Typography variant="h6">Aucune boutique configurée ou accessible.</Typography></Box>);
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
    <Box p={{ xs: 1, sm: 2 }} sx={{ fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
      <Typography variant="h5" gutterBottom fontWeight={600} sx={{ fontFamily: "inherit", mb:0.5 }}>
        Bons de Commande Fournisseurs
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={1} sx={{ fontFamily: "inherit" }}>
        Boutique : {shopInfo.nom}
      </Typography>

      <Box display="flex" alignItems="center" mb={2} gap={1} flexWrap="wrap">
        <TextField
            label="Rechercher par ID de Bon de Commande"
            variant="outlined"
            size="small"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearchById()}
            sx={{ flexGrow: 1, maxWidth: 400, '& .MuiOutlinedInput-root': {fontSize:'0.9rem'} }}
            InputProps={{
                endAdornment: (
                    <InputAdornment position="end">
                        {searchInput && (
                            <IconButton onClick={clearSearch} size="small" edge="end" aria-label="Effacer la recherche">
                                <ClearIcon fontSize="small" />
                            </IconButton>
                        )}
                    </InputAdornment>
                )
            }}
        />
        <Button 
            variant="contained" 
            onClick={handleSearchById} 
            disabled={isSearching || !searchInput.trim()}
            startIcon={isSearching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            size="medium"
            sx={{height:'40px'}}
        >
            Rechercher
        </Button>
        {isSearchActive && (
             <Button 
                variant="outlined" 
                onClick={clearSearch} 
                size="medium"
                sx={{height:'40px'}}
                color="secondary"
            >
                Afficher Tout
            </Button>
        )}
      </Box>

      <Paper elevation={1} sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom sx={{fontSize: '1rem', fontWeight: 500}}>Télécharger la liste des Bons (PDF)</Typography>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="download-period-label">Période</InputLabel>
              <Select
                labelId="download-period-label"
                value={downloadPeriod}
                label="Période"
                onChange={(e) => setDownloadPeriod(e.target.value as string)}
              >
                <MenuItem value="current_month">Ce mois-ci</MenuItem>
                <MenuItem value="last_month">Mois dernier</MenuItem>
                <MenuItem value="last_week">Semaine dernière</MenuItem>
                <MenuItem value="custom">Personnalisé</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {downloadPeriod === "custom" && (
            <>
              <Grid item xs={6} sm={3} md={3}>
                <DatePicker
                  label="Date de début"
                  value={downloadStartDate}
                  onChange={setDownloadStartDate}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
              <Grid item xs={6} sm={3} md={3}>
                <DatePicker
                  label="Date de fin"
                  value={downloadEndDate}
                  onChange={setDownloadEndDate}
                  minDate={downloadStartDate || undefined}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
            </>
          )}
          <Grid item xs={12} sm={downloadPeriod === "custom" ? 2 : 4} md={downloadPeriod === "custom" ? 3 : 3}>
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              onClick={handleDownloadOrdersListAsPdf}
              disabled={isDownloadingList || (downloadPeriod === "custom" && (!downloadStartDate || !downloadEndDate))}
              startIcon={isDownloadingList ? <CircularProgress size={16} color="inherit"/> : <FileDownloadIcon />}
            >
              Télécharger PDF
            </Button>
          </Grid>
        </Grid>
      </Paper>


      {orders.length > 0 && !isSearchActive && (
        <Grid container spacing={2} mb={2.5}>
          <Grid item xs={12} sm={6}>
            <Card elevation={2} sx={{ display: "flex", alignItems: "center", p: 1.5, borderRadius: 2 }}>
              <Avatar sx={{ bgcolor: "success.light", width: 40, height: 40, mr: 1.5 }}><MonetizationOnIcon color="success" sx={{ fontSize: 22 }} /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "inherit", display:'block', lineHeight:1.2 }}>Total Payé (Affichés)</Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ fontFamily: "inherit", fontSize: '1.1rem' }}>{grandTotalPaye.toFixed(2)} {devise}</Typography>
              </Box>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card elevation={2} sx={{ display: "flex", alignItems: "center", p: 1.5, borderRadius: 2 }}>
              <Avatar sx={{ bgcolor: "warning.light", width: 40, height: 40, mr: 1.5 }}><ReceiptLongIcon color="warning" sx={{ fontSize: 22 }} /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "inherit", display:'block', lineHeight:1.2 }}>Reste à Payer (Affichés)</Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ fontFamily: "inherit", fontSize: '1.1rem' }}>{grandTotalResteAPayer.toFixed(2)} {devise}</Typography>
              </Box>
            </Card>
          </Grid>
        </Grid>
      )}

      <Paper elevation={2} sx={{ overflow: "hidden", borderRadius: 2 }}>
        <Box sx={{ overflowX: "auto" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{"& th": { fontWeight: 600, py: 1, whiteSpace: 'nowrap', fontSize:'0.8rem', backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[100] }}}>
                <TableCell sx={{ minWidth: 120 }}>Date Création</TableCell>
                <TableCell sx={{ minWidth: 130, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>Fournisseur</TableCell>
                <TableCell sx={{ minWidth: 110 }}>État Cmd</TableCell>
                <TableCell align="right" sx={{ minWidth: 80 }}>Total ({devise})</TableCell>
                <TableCell align="right" sx={{ minWidth: 80 }}>Payé ({devise})</TableCell>
                <TableCell align="right" sx={{ minWidth: 80 }}>Reste ({devise})</TableCell>
                <TableCell sx={{ minWidth: 120 }}>Statut Pmt</TableCell>
                <TableCell align="center" sx={{ minWidth: 70, position: 'sticky', right: 0, zIndex:1, backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : (theme.palette.mode === "light" ? theme.palette.grey[100] : theme.palette.background.paper) }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingOrders && !isFetchingMore && (<TableRow><TableCell colSpan={8} align="center" sx={{ py: 3 }}><CircularProgress size={28}/></TableCell></TableRow>)}
              {!loadingOrders && orders.length === 0 && (<TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><Typography variant="body2">{isSearchActive ? "Aucun résultat pour cette recherche." : "Aucun bon de commande."}</Typography></TableCell></TableRow>)}
              {orders.map((o) => (
                <TableRow key={o.id} hover sx={{ "& td": { py: 0.8, whiteSpace: 'nowrap', fontSize:'0.8rem' } }}>
                  <TableCell>{formatDateTimeSafe(o.createdAt)}</TableCell>
                  <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.supplierName}>{o.supplierName}</TableCell>
                  <TableCell><Chip label={o.etat.replace("_", " ").toUpperCase()} size="small" sx={{ fontWeight: 500, color:"white", fontSize:'0.65rem', height:'20px', backgroundColor: o.etat === "validé" ? theme.palette.success.main : o.etat === "en_attente" ? theme.palette.info.main : theme.palette.grey[500] }}/></TableCell>
                  <TableCell align="right">{o.total.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ color: o.totalPaye > 0 ? theme.palette.success.dark : "text.primary" }}>{o.totalPaye.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ color: o.resteAPayer > 0 ? theme.palette.error.dark : "text.primary", fontWeight: o.resteAPayer > 0 ? 600 : "normal" }}>{o.resteAPayer.toFixed(2)}</TableCell>
                  <TableCell><Chip label={o.status.replace("_", " ").toUpperCase()} size="small" sx={{ fontWeight: 500, color:"white", fontSize:'0.65rem', height:'20px', backgroundColor: o.status === "payé" ? theme.palette.success.dark : o.status === "partiellement_payé" ? theme.palette.warning.dark : theme.palette.error.dark }}/></TableCell>
                  <TableCell align="center" sx={{ position: 'sticky', right: 0, zIndex:0, backgroundColor: theme.palette.background.paper }}>
                    <IconButton aria-label="actions" onClick={(e) => handleActionMenuClick(e, o)} size="small" disabled={isGeneratingPdf && currentPdfOrder?.id === o.id}><MoreVertIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {hasMoreOrders && !isSearchActive && (
          <Box textAlign="center" py={1.5}>
            <Button onClick={() => fetchOrders(true)} disabled={isFetchingMore || loadingOrders} variant="outlined" size="small" startIcon={isFetchingMore ? <CircularProgress size={14} color="inherit" /> : <AddCircleOutlineIcon sx={{fontSize:'1.1rem'}}/>}>Charger plus</Button>
          </Box>
        )}
      </Paper>

      <Menu anchorEl={anchorEl} open={openActionMenu} onClose={handleActionMenuClose} MenuListProps={{ 'aria-labelledby': 'actions-menu' }} sx={{ "& .MuiMenuItem-root": { fontSize: '0.85rem', py:0.8 }, "& .MuiListItemIcon-root": {minWidth: '30px'} }}>
        {currentActionOrder && [
          <MenuItem key="details" onClick={() => execOpenDetailsDialog(currentActionOrder)}><ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>Voir Détails</MenuItem>,
          currentActionOrder.etat === "en_attente" && (<MenuItem key="validate" onClick={() => execOpenValidateOrderDialog(currentActionOrder)}><ListItemIcon><AssignmentTurnedInIcon fontSize="small" /></ListItemIcon>Valider Commande</MenuItem>),
          currentActionOrder.etat === "validé" && currentActionOrder.resteAPayer > 0 && [
            <MenuItem key="addPayment" onClick={() => execOpenAddPaymentDialog(currentActionOrder)}><ListItemIcon><MonetizationOnIcon fontSize="small" /></ListItemIcon>Ajouter Paiement</MenuItem>,
            <MenuItem key="markPaid" onClick={() => execOpenMarkPaidDialog(currentActionOrder)}><ListItemIcon><PriceCheckIcon fontSize="small" /></ListItemIcon>Marquer Payé (Solde)</MenuItem>
          ].filter(Boolean), 
          (currentActionOrder.etat === "en_attente" || (currentActionOrder.etat === "validé" && currentActionOrder.resteAPayer > 0)) && (<Divider key="divider-actions-pre-pdf" sx={{ my: 0.5 }} />),
          <MenuItem key="pdf" onClick={() => execGenerateAndPreviewPdf(currentActionOrder)} disabled={isGeneratingPdf || !shopInfo}><ListItemIcon>{isGeneratingPdf && currentPdfOrder?.id === currentActionOrder.id ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon fontSize="small" />}</ListItemIcon>Générer PDF</MenuItem>,
          currentActionOrder.etat !== "validé" && (<Divider key="divider-actions-pre-delete" sx={{ my: 0.5 }} />),
          currentActionOrder.etat !== "validé" && (
            <MenuItem key="delete" onClick={() => execOpenDeleteOrderDialog(currentActionOrder)} sx={{color: theme.palette.error.main}}>
                <ListItemIcon><DeleteIcon fontSize="small" sx={{color: theme.palette.error.main}} /></ListItemIcon>Supprimer
            </MenuItem>
          ),
        ].flat().filter(Boolean)}
      </Menu>
      
      <Dialog open={Boolean(selectedOrderForPayment)} onClose={handleCloseAddPaymentDialog} PaperProps={{ sx: { borderRadius: 2.5, fontFamily: "inherit" } }} maxWidth="xs" fullWidth>
        <ModernDialogTitle><Stack direction="row" alignItems="center" spacing={1}><MonetizationOnIcon sx={{ fontSize: 22 }} /><span>Ajouter un Paiement</span></Stack><IconButton onClick={handleCloseAddPaymentDialog} sx={{ color: "common.white" }} size="small"><CloseIcon fontSize="small"/></IconButton></ModernDialogTitle>
        <ModernDialogContent dividers>
          {selectedOrderForPayment && (<>
              <Typography gutterBottom variant="caption" color="text.secondary">BC ID: {selectedOrderForPayment.id.substring(0,8)}...</Typography>
              <Typography gutterBottom variant="body2" fontWeight={500}>Fssr: {selectedOrderForPayment.supplierName}</Typography>
              <Typography gutterBottom sx={{ mt: 0.5, fontSize:'0.8rem' }}>Total: {selectedOrderForPayment.total.toFixed(2)} {devise}</Typography>
              <Typography gutterBottom sx={{ color: theme.palette.success.main, fontWeight: 500, fontSize:'0.8rem' }}>Payé: {selectedOrderForPayment.totalPaye.toFixed(2)} {devise}</Typography>
              <Typography gutterBottom sx={{ color: theme.palette.error.main, fontWeight: 'bold', fontSize:'0.8rem' }}>Reste: {selectedOrderForPayment.resteAPayer.toFixed(2)} {devise}</Typography>
              <TextField autoFocus margin="dense" size="small" id="payAmount" label={`Montant (${devise})`} type="number" fullWidth variant="outlined" value={payAmount}
                         onChange={(e) => { const value = parseFloat(e.target.value); setPayAmount(isNaN(value) ? 0 : value); }}
                         inputProps={{ min: 0.01, step: "0.01", max: selectedOrderForPayment?.resteAPayer.toFixed(2) }}
                         sx={{ mt: 1.5, "& .MuiOutlinedInput-root": {fontSize:'0.9rem'} }} />
            </>)}
        </ModernDialogContent>
        <DialogActions sx={{ p: 1.5, backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[50] }}>
          <Button onClick={handleCloseAddPaymentDialog} variant="outlined" size="small">Annuler</Button>
          <Button onClick={addPayment} variant="contained" size="small" disabled={!selectedOrderForPayment || payAmount <= 0 || payAmount > (selectedOrderForPayment?.resteAPayer + 0.001) }>Confirmer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmMarkPaidOpen} onClose={handleCloseMarkPaidDialog} PaperProps={{ sx: { borderRadius: 2.5, fontFamily: "inherit" } }} maxWidth="xs" fullWidth>
        <ModernDialogTitle><Stack direction="row" alignItems="center" spacing={1}><PriceCheckIcon sx={{ fontSize: 22 }} /><span>Confirmer Paiement Total</span></Stack><IconButton onClick={handleCloseMarkPaidDialog} sx={{ color: "common.white" }} size="small"><CloseIcon fontSize="small"/></IconButton></ModernDialogTitle>
        <ModernDialogContent><Typography variant="body2">Marquer cette commande comme intégralement payée ?</Typography>
          {orderToMarkPaid && (<Typography variant="caption" color="textSecondary" sx={{mt:0.5, display:'block'}}>Montant concerné : {orderToMarkPaid.resteAPayer.toFixed(2)} {devise}</Typography>)}
        </ModernDialogContent>
        <DialogActions sx={{ p: 1.5, backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[50] }}>
          <Button onClick={handleCloseMarkPaidDialog} variant="outlined" size="small">Annuler</Button>
          <Button onClick={confirmAndMarkPaid} variant="contained" size="small" color="success">Confirmer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmValidateOrderOpen} onClose={handleCloseValidateOrderDialog} PaperProps={{ sx: { borderRadius: 2.5, fontFamily: "inherit" } }} maxWidth="xs" fullWidth>
        <ModernDialogTitle><Stack direction="row" alignItems="center" spacing={1}><AssignmentTurnedInIcon sx={{ fontSize: 22 }} /><span>Confirmer Validation</span></Stack><IconButton onClick={handleCloseValidateOrderDialog} sx={{ color: "common.white" }} size="small"><CloseIcon fontSize="small"/></IconButton></ModernDialogTitle>
        <ModernDialogContent><Typography variant="body2">Valider cette commande ? Ceci mettra à jour les stocks.</Typography></ModernDialogContent>
        <DialogActions sx={{ p: 1.5, backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[50] }}>
          <Button onClick={handleCloseValidateOrderDialog} variant="outlined" size="small">Annuler</Button>
          <Button onClick={validateOrder} variant="contained" size="small" color="primary" disabled={isValidating}>{isValidating ? <CircularProgress size={18} color="inherit" /> : "Valider"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={orderDetailsOpen} onClose={handleCloseDetailsDialog} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2.5, overflow: "hidden", fontFamily: "inherit" } }}>
        <ModernDialogTitle><Stack direction="row" alignItems="center" spacing={1}><ReceiptIcon sx={{ fontSize: 24 }} /><span>Détails Bon de Commande</span></Stack><IconButton onClick={handleCloseDetailsDialog} sx={{ color: "common.white" }} size="small"><CloseIcon fontSize="small"/></IconButton></ModernDialogTitle>
        <ModernDialogContent dividers>
          {orderForDetails && shopInfo && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, color: "primary.main", borderBottom: "1px solid", borderColor: "primary.light", pb: 0.5, mb: 1, fontSize: '0.95rem'}}>Fournisseur & Commande</Typography>
                <DetailItem 
                    icon={<FingerprintIcon />} 
                    label="ID Bon de Commande" 
                    value={orderForDetails.id} 
                    isId 
                    onCopy={() => handleCopyOrderId(orderForDetails.id)}
                    copyLabel="Copier ID"
                />
                <DetailItem icon={<BusinessCenterIcon />} label="Nom Fournisseur" value={orderForDetails.supplierName} />
                {orderForDetails.supplierAdresse && (<DetailItem icon={<LocationOnIcon />} label="Adresse Fssr." value={orderForDetails.supplierAdresse} />)}
                {orderForDetails.supplierTelephone && (<DetailItem icon={<PhoneIcon />} label="Téléphone Fssr." value={orderForDetails.supplierTelephone} />)}
                <DetailItem icon={<ReceiptIcon />} label="ID Fournisseur" value={<Typography variant="caption" sx={{fontFamily:'monospace'}}>{orderForDetails.supplierId}</Typography>} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, color: "primary.main", borderBottom: "1px solid", borderColor: "primary.light", pb: 0.5, mb: 1, fontSize: '0.95rem'}}>Détails & Paiement</Typography>
                <DetailItem icon={<EventIcon />} label="Date création" value={formatDateTimeSafe(orderForDetails.createdAt)} />
                <DetailItem icon={<InventoryIcon />} label="État Commande" value={<Chip label={orderForDetails.etat.replace("_", " ").toUpperCase()} size="small" sx={{ fontSize:'0.7rem', height:'20px', bgcolor: orderForDetails.etat === "validé" ? "success.light" : "info.light", color: orderForDetails.etat === "validé" ? "success.dark" : "info.dark" }} />} />
                <DetailItem icon={<PaymentIcon />} label="Statut Paiement" value={<Chip label={orderForDetails.status.replace("_", " ").toUpperCase()} size="small" sx={{ fontSize:'0.7rem', height:'20px', bgcolor: orderForDetails.status === "payé" ? "success.light" : orderForDetails.status === "partiellement_payé" ? "warning.light" : "error.light", color: orderForDetails.status === "payé" ? "success.dark" : orderForDetails.status === "partiellement_payé" ? "warning.dark" : "error.dark" }} />} />
                <DetailItem icon={<EuroSymbolIcon />} label={`Total (${devise})`} value={orderForDetails.total.toFixed(2)} />
                <DetailItem icon={<PaidIcon />} label={`Payé (${devise})`} value={orderForDetails.totalPaye.toFixed(2)} />
                <DetailItem icon={<AccountBalanceWalletIcon />} label={`Reste (${devise})`} value={orderForDetails.resteAPayer.toFixed(2)} />
              </Grid>
              <Grid item xs={12} mt={1}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, color: "primary.main", borderBottom: "1px solid", borderColor: "primary.light", pb: 0.5, mb: 1, fontSize: '0.95rem'}}><ShoppingCartIcon sx={{ verticalAlign: "middle", mr: 0.5, fontSize:'1.1rem' }} /> Articles</Typography>
                {orderForDetails.items && orderForDetails.items.length > 0 ? (
                  <Paper variant="outlined" sx={{ borderRadius: 1.5, overflow: "hidden" }}>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: theme.palette.mode === "dark" ? "grey.700" : "grey.50" }}>
                        <TableRow sx={{"& th": { py:0.5, fontSize:'0.75rem', fontWeight:500 }}}>
                          <TableCell>Produit</TableCell>
                          <TableCell align="right">Qté</TableCell>
                          <TableCell align="right">P.U. ({devise})</TableCell>
                          <TableCell align="right">Sous-total ({devise})</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody sx={{"& td": { py:0.5, fontSize:'0.8rem' }}}>
                        {orderForDetails.items.map((item, index) => (
                          <TableRow key={`${item.productId}-${index}`} sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                            <TableCell>{item.nomProduit || item.productId}</TableCell>
                            <TableCell align="right">{item.quantite}</TableCell>
                            <TableCell align="right">{item.prixAchatUnitaire.toFixed(2)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 500 }}>{(item.quantite * item.prixAchatUnitaire).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                ) : ( <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.secondary" }}>Aucun article.</Typography> )}
              </Grid>
            </Grid>
          )}
        </ModernDialogContent>
        <DialogActions sx={{ p: 1.5, backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50] }}>
          <Button onClick={handleCloseDetailsDialog} variant="outlined" size="small">Fermer</Button>
        </DialogActions>
      </Dialog>
      
      <Dialog open={pdfPreviewOpen} onClose={handleClosePdfPreview} maxWidth="lg" fullWidth PaperProps={{sx: {height: '90vh', borderRadius: 2.5}}}>
        <DialogTitle sx={{ display:"flex", justifyContent:"space-between", alignItems:"center", py:1.5, px:2 }}>
            <Typography variant="h6" sx={{fontSize:'1.1rem'}}>Aperçu Bon de Commande</Typography>
            <IconButton onClick={handleClosePdfPreview} size="small"><CloseIcon/></IconButton>
        </DialogTitle>
        <DialogContent sx={{overflow: "hidden", p:0.5, bgcolor:'grey.300'}}>
          {isGeneratingPdf && !pdfDataUri && <Box sx={{display:'flex',flexDirection:'column', justifyContent:'center', alignItems:'center', height:'100%', bgcolor:'background.paper'}}><CircularProgress size={40}/><Typography sx={{mt:1}} variant="body2">Génération...</Typography></Box>}
          {pdfDataUri && (<iframe src={pdfDataUri} style={{ width: "100%", height: "100%", border: "none" }} title="Prévisualisation PDF"/>)}
        </DialogContent>
        <DialogActions sx={{py:1, px:2}}>
          <Button onClick={handleClosePdfPreview} size="small">Fermer</Button>
          <Button onClick={handleDownloadPdf} variant="contained" size="small" color="primary" startIcon={<DownloadIcon />} disabled={!pdfDataUri || isGeneratingPdf}>Télécharger</Button>
          <Button onClick={handlePrintPdf} variant="contained" size="small" color="secondary" startIcon={<PrintIcon />} disabled={!pdfDataUri || isGeneratingPdf}>Imprimer</Button>
        </DialogActions>
      </Dialog>

       {/* Dialog de confirmation de suppression */}
       <Dialog open={confirmDeleteOpen} onClose={handleCloseDeleteDialog} PaperProps={{ sx: { borderRadius: 2.5 } }} maxWidth="xs" fullWidth>
        <ModernDialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}><DeleteIcon sx={{ fontSize: 22 }} /><span>Confirmer Suppression</span></Stack>
            <IconButton onClick={handleCloseDeleteDialog} sx={{ color: "common.white" }} size="small"><CloseIcon fontSize="small"/></IconButton>
        </ModernDialogTitle>
        <ModernDialogContent>
            <Typography variant="body2">
                Êtes-vous sûr de vouloir supprimer le bon de commande <Typography component="span" fontWeight="bold">{orderToDelete?.id.substring(0,8)}...</Typography> ?
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" mt={1}>Cette action est irréversible.</Typography>
        </ModernDialogContent>
        <DialogActions sx={{ p: 1.5, backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[50] }}>
            <Button onClick={handleCloseDeleteDialog} variant="outlined" size="small">Annuler</Button>
            <Button onClick={handleDeleteOrder} variant="contained" size="small" color="error" disabled={isDeleting}>
                {isDeleting ? <CircularProgress size={18} color="inherit" /> : "Supprimer"}
            </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={handleSnackbarClose} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: "100%", fontFamily: "inherit" }} variant="filled" elevation={6}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
    </LocalizationProvider>
  );
}