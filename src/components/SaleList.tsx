import React, { useState, useEffect, useMemo } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  orderBy,
  limit,
  startAfter,
  Query,
  DocumentSnapshot,
  writeBatch,
  Timestamp,
  increment as firebaseIncrement,
} from "firebase/firestore";
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
} from "@mui/x-data-grid";
import { frFR } from "@mui/x-data-grid/locales";
import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  TextField,
  useTheme,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  CircularProgress,
  Menu as MuiMenu,
  IconButton,
  Stack,
  Divider,
} from "@mui/material";
import {
  PictureAsPdf as PdfIcon,
  Info as InfoIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ReceiptLong as ReceiptIcon,
} from "@mui/icons-material";
import SalesDetails from "@/components/SalesDetails";
import InvoiceGenerator from "@/components/InvoiceGenerator";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ---------- Interfaces (adaptées) ----------
interface SaleItem {
  productId: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

interface Sale {
  id: string;
  saleShortId?: string; // <-- nouveau champ utilisé pour la recherche / affichage
  customerId?: string;
  grandTotal: number;
  items: SaleItem[];
  paidAmount?: number;
  paymentStatus?: "payé" | "partiellement payé" | "non payé" | "à crédit";
  remainingAmount?: number;
  timestamp?: Date;
}

interface Boutique {
  id: string;
  nom?: string;
  logoUrl?: string;
  devise?: string;
}

interface Customer {
  id: string;
  name: string;
}

interface ProductMini {
  id: string;
  unite?: string;
  emplacement?: string;
  nom?: string;
}

// ---------- Utilitaires date & conversion image pour PDF (inchangés) ----------
const getStartOfDay = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};
const getEndOfDay = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
};
const getStartOfWeek = (date: Date): Date => {
  const newDate = new Date(date);
  const day = newDate.getDay();
  const diff = newDate.getDate() - day + (day === 0 ? -6 : 1);
  newDate.setDate(diff);
  return getStartOfDay(newDate);
};
const getEndOfWeek = (date: Date): Date => {
  const newDate = new Date(getStartOfWeek(date));
  newDate.setDate(newDate.getDate() + 6);
  return getEndOfDay(newDate);
};
const getStartOfMonth = (date: Date): Date => {
  const newDate = new Date(date.getFullYear(), date.getMonth(), 1);
  return getStartOfDay(newDate);
};
const getEndOfMonth = (date: Date): Date => {
  const newDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return getEndOfDay(newDate);
};
const toDataURL = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} for url ${url}`);
      return "";
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = (error) => {
        console.error("FileReader error:", error);
        reject(error);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Erreur lors de la conversion de l'image en base64:", error);
    return "";
  }
};

// ---------- Composant principal ----------
export default function SaleList() {
  const [user, loadingUser, authError] = useAuthState(auth);
  const [userId, setUserId] = useState<string | null>(null);
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, ProductMini>>({}); // map productId -> mini-info
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchId, setSearchId] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [filterStatus, setFilterStatus] = useState<"all" | "payé" | "partiellement payé" | "non payé" | "à crédit">("all");
  const [filterPeriodOption, setFilterPeriodOption] = useState<string>("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const [openDetail, setOpenDetail] = useState(false);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [openInvoice, setOpenInvoice] = useState(false);
  const [invoiceSaleId, setInvoiceSaleId] = useState<string | null>(null);
  const [openPaymentDialog, setOpenPaymentDialog] = useState(false);
  const [saleToPay, setSaleToPay] = useState<Sale | null>(null);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  // Pour menu déroulant produits
  const [productsMenuAnchorEl, setProductsMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [productsMenuSale, setProductsMenuSale] = useState<Sale | null>(null);

  const theme = useTheme();

  // ---------- Récupération userId ----------
  useEffect(() => {
    if (user) setUserId(user.uid);
  }, [user]);

  // ---------- Récupération boutique (cache prioritaire) ----------
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const q = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", userId));
        const snap = await getDocs(q, { source: "cache" }).catch(() => getDocs(q, { source: "server" }));
        if (!snap.empty) {
          const d = snap.docs[0];
          const boutiqueData = d.data();
          setBoutique({
            id: d.id,
            nom: boutiqueData.nom || "Ma Boutique",
            logoUrl: boutiqueData.logoUrl,
            devise: boutiqueData.devise,
          });
        } else {
          setBoutique(null);
          console.warn("Aucune boutique trouvée pour cet utilisateur.");
        }
      } catch (err) {
        console.error("Erreur fetch boutique:", err);
      }
    })();
  }, [userId]);

  // ---------- Récupération clients (cache prioritaire) ----------
  useEffect(() => {
    if (!boutique?.id) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "boutiques", boutique.id, "customers"), { source: "cache" }).catch(() =>
          getDocs(collection(db, "boutiques", boutique.id, "customers"), { source: "server" })
        );
        setCustomers(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).nom || "Anonyme" })));
      } catch (err) {
        console.error("Erreur fetch customers:", err);
      }
    })();
  }, [boutique?.id]);

  // ---------- Récupération produits (mini infos) pour afficher unité/emplacement dans le dropdown produits ----------
  useEffect(() => {
    if (!boutique?.id) return;
    (async () => {
      try {
        const pSnap = await getDocs(collection(db, "boutiques", boutique.id, "products"), { source: "cache" }).catch(() =>
          getDocs(collection(db, "boutiques", boutique.id, "products"), { source: "server" })
        );
        const map: Record<string, ProductMini> = {};
        pSnap.docs.forEach((d) => {
          const data = d.data() as any;
          map[d.id] = {
            id: d.id,
            unite: data.unite,
            emplacement: data.emplacement,
            nom: data.nom,
          };
        });
        setProductsMap(map);
      } catch (err) {
        console.error("Erreur fetch products:", err);
      }
    })();
  }, [boutique?.id]);

  // ---------- Chargement des ventes (pagination) ----------
  const fetchSales = async (isInitial = true) => {
    if (!boutique?.id || loadingMore || (!hasMore && !isInitial)) return;
    if (isInitial) {
      setLastVisible(null);
      setHasMore(true);
    }
    setLoadingMore(true);
    try {
      let salesQuery: Query = query(
        collection(db, "boutiques", boutique.id, "sales"),
        orderBy("timestamp", "desc"),
        limit(20)
      );

      if (!isInitial && lastVisible) {
        salesQuery = query(
          collection(db, "boutiques", boutique.id, "sales"),
          orderBy("timestamp", "desc"),
          startAfter(lastVisible),
          limit(20)
        );
      }

      const snap = await getDocs(salesQuery, { source: "cache" }).catch(() => getDocs(salesQuery, { source: "server" }));
      const newSales = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          saleShortId: data.saleShortId,
          customerId: data.customerId,
          grandTotal: data.grandTotal ?? 0,
          items: (data.items ?? []) as SaleItem[],
          paidAmount: data.paidAmount ?? 0,
          paymentStatus: data.paymentStatus ?? "non payé",
          remainingAmount: data.remainingAmount ?? data.grandTotal ?? 0,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : undefined,
        } as Sale;
      });

      if (isInitial) {
        setSales(newSales);
      } else {
        setSales((prev) => [...prev, ...newSales]);
      }

      if (snap.docs.length < 20) {
        setHasMore(false);
      } else {
        setLastVisible(snap.docs[snap.docs.length - 1]);
        setHasMore(true);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des ventes:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (boutique?.id && !isSearching) {
      fetchSales(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boutique?.id, isSearching]);

  // ---------- Recherche par saleShortId (modification demandée) ----------
  const searchSaleById = async () => {
    if (!boutique?.id || !searchId.trim()) return;
    setIsSearching(true);
    setLoadingMore(true);
    try {
      // Recherche via where('saleShortId', '==', searchId)
      const q = query(collection(db, "boutiques", boutique.id, "sales"), where("saleShortId", "==", searchId.trim()), limit(50));
      const snap = await getDocs(q, { source: "cache" }).catch(() => getDocs(q, { source: "server" }));
      const found = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          saleShortId: data.saleShortId,
          customerId: data.customerId,
          grandTotal: data.grandTotal ?? 0,
          items: (data.items ?? []) as SaleItem[],
          paidAmount: data.paidAmount ?? 0,
          paymentStatus: data.paymentStatus ?? "non payé",
          remainingAmount: data.remainingAmount ?? data.grandTotal ?? 0,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : undefined,
        } as Sale;
      });
      setSales(found);
      setHasMore(false);
    } catch (error) {
      console.error("Erreur lors de la recherche par saleShortId:", error);
      setSales([]);
    } finally {
      setLoadingMore(false);
    }
  };

  const resetSales = () => {
    setSearchId("");
    setIsSearching(false);
    // fetchSales will run due to useEffect listening to isSearching
  };

  // ---------- Marquer comme payé et enregistrement transaction (inchangé, garde ta logique) ----------
  const markAsPaidAndRecordTransaction = async (sale: Sale) => {
    if (!boutique || !userId || !sale) return;

    setConfirmingPayment(true);
    const batch = writeBatch(db);
    const saleRef = doc(db, "boutiques", boutique.id, "sales", sale.id);

    const amountNewlyPaid = sale.remainingAmount ?? (sale.grandTotal - (sale.paidAmount ?? 0));
    if (amountNewlyPaid <= 0) {
      console.warn("Tentative de marquer comme payé une vente sans montant restant ou déjà payée.");
      setConfirmingPayment(false);
      setSales((prev) =>
        prev.map((s) => (s.id === sale.id ? { ...s, paymentStatus: "payé", paidAmount: s.grandTotal, remainingAmount: 0 } : s))
      );
      return;
    }

    batch.update(saleRef, {
      paymentStatus: "payé",
      paidAmount: firebaseIncrement(amountNewlyPaid),
      remainingAmount: 0,
    });

    const caisseCol = collection(db, "boutiques", boutique.id, "caisse");
    const caisseSnap = await getDocs(caisseCol);

    if (!caisseSnap.empty) {
      const caisseDoc = caisseSnap.docs[0];
      const currentSolde = caisseDoc.data().solde ?? 0;
      const newSolde = currentSolde + amountNewlyPaid;

      batch.update(caisseDoc.ref, { solde: firebaseIncrement(amountNewlyPaid) });

      const transactionRef = doc(collection(db, "boutiques", boutique.id, "caisse", caisseDoc.id, "transactions"));
      batch.set(transactionRef, {
        saleId: sale.id,
        type: "paiement vente",
        montant: amountNewlyPaid,
        ancienSolde: currentSolde,
        nouveauSolde: newSolde,
        userId: userId,
        timestamp: Timestamp.fromDate(new Date()),
        paymentStatusBefore: sale.paymentStatus,
        paymentStatusAfter: "payé",
      });
    } else {
      console.error("Aucune caisse trouvée pour enregistrer la transaction.");
      setConfirmingPayment(false);
      return;
    }

    const todayDateKey = new Date().toISOString().split("T")[0];
    const dailyStatsDocRef = doc(db, "boutiques", boutique.id, "statsVentes", todayDateKey);
    const nowForStats = Timestamp.fromDate(new Date());

    batch.set(
      dailyStatsDocRef,
      {
        montantPercuTotalDuJour: firebaseIncrement(amountNewlyPaid),
        lastUpdated: nowForStats,
        date: todayDateKey,
        montantVenteTotalDuJour: firebaseIncrement(0),
      },
      { merge: true }
    );

    try {
      await batch.commit();
      setSales((prev) =>
        prev.map((s) => (s.id === sale.id ? { ...s, paymentStatus: "payé", paidAmount: s.grandTotal, remainingAmount: 0 } : s))
      );
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la vente et de la caisse:", error);
    } finally {
      setConfirmingPayment(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!saleToPay) return;
    await markAsPaidAndRecordTransaction(saleToPay);
    setOpenPaymentDialog(false);
    setSaleToPay(null);
  };

  // ---------- Filtrage / affichage ----------
  const displayedSales = useMemo(() => {
    let filtered = sales;
    if (isSearching) return filtered;
    if (filterStatus !== "all") {
      filtered = filtered.filter((s) => s.paymentStatus === filterStatus);
    }
    if (filterPeriodOption !== "all") {
      const now = new Date();
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      if (filterPeriodOption === "today") {
        startDate = getStartOfDay(now);
        endDate = getEndOfDay(now);
      } else if (filterPeriodOption === "thisWeek") {
        startDate = getStartOfWeek(now);
        endDate = getEndOfWeek(now);
      } else if (filterPeriodOption === "thisMonth") {
        startDate = getStartOfMonth(now);
        endDate = getEndOfMonth(now);
      } else if (filterPeriodOption === "custom" && customStartDate && customEndDate) {
        startDate = new Date(`${customStartDate}T00:00:00`);
        endDate = new Date(`${customEndDate}T23:59:59`);
      }
      if (startDate && endDate) {
        filtered = filtered.filter((s) => {
          if (!s.timestamp) return false;
          const saleDate = new Date(s.timestamp);
          return saleDate >= startDate && saleDate <= endDate;
        });
      }
    }
    return [...filtered].sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0));
  }, [sales, filterStatus, filterPeriodOption, customStartDate, customEndDate, isSearching]);

  // ---------- Cols DataGrid (ajout saleShortId & colonne Produits déroulants) ----------
  const columns: GridColDef[] = [
    {
      field: "saleShortId",
      headerName: "N° Vente",
      minWidth: 120,
      flex: 0.8,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {params.row.saleShortId || params.row.id}
        </Typography>
      ),
    },
    {
      field: "timestamp",
      headerName: "Date & Heure",
      minWidth: 170,
      flex: 1.4,
      renderCell: (params: GridRenderCellParams) =>
        (params.row.timestamp as Date)?.toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }) || "—",
    },
    {
      field: "customerId",
      headerName: "Client",
      minWidth: 160,
      flex: 1.2,
      renderCell: (params) => customers.find((c) => c.id === params.row.customerId)?.name || "Anonyme",
    },
    {
      field: "productsDropdown",
      headerName: "Produits",
      minWidth: 220,
      flex: 2,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const sale: Sale = params.row as Sale;
        // Button ouvre un menu qui affiche la liste des items
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              endIcon={<ExpandMoreIcon />}
              onClick={(e) => {
                setProductsMenuAnchorEl(e.currentTarget);
                setProductsMenuSale(sale);
              }}
              sx={{ textTransform: "none", fontSize: "0.8rem", px: 1, py: 0.5 }}
            >
              Voir ({sale.items?.length ?? 0})
            </Button>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Total: {(sale.grandTotal || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {boutique?.devise || ""}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "paymentStatus",
      headerName: "Statut",
      minWidth: 120,
      flex: 0.9,
      renderCell: (params) => {
        const status: string = params.row.paymentStatus || "";
        const cfg: Record<string, { color: "success" | "warning" | "error" | "info" | "default"; label: string }> = {
          payé: { color: "success", label: "Payé" },
          "partiellement payé": { color: "warning", label: "Partiel" },
          "non payé": { color: "error", label: "Impayé" },
          "à crédit": { color: "info", label: "Crédit" },
        };
        const c = cfg[status] ?? { color: "default", label: status };
        return <Chip label={c.label} color={c.color} variant="outlined" size="small" sx={{ fontWeight: 600 }} />;
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      minWidth: 220,
      flex: 1.4,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "nowrap" }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PdfIcon />}
            onClick={() => {
              setInvoiceSaleId(params.row.id);
              setOpenInvoice(true);
            }}
            sx={{ textTransform: "none", fontSize: "0.8rem", px: 1 }}
          >
            Facture
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<InfoIcon />}
            onClick={() => {
              setDetailSaleId(params.row.id);
              setOpenDetail(true);
            }}
            sx={{ textTransform: "none", fontSize: "0.8rem", px: 1 }}
          >
            Détails
          </Button>
          {/* Si la vente n'est pas payée, proposer d'ouvrir le dialogue paiement */}
     
        </Box>
      ),
    },
  ];

  // ---------- PDF generation (inchangé) ----------
  const handleDownloadPdf = async () => {
    if (!boutique) return;
    setIsPdfDownloading(true);
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
    let currentY = 15;
    let boutiqueNomY = currentY + 5;

    if (boutique.logoUrl) {
      const logoBase64 = await toDataURL(boutique.logoUrl);
      if (logoBase64) {
        try {
          const imgProps = doc.getImageProperties(logoBase64);
          const imgWidth = 25;
          const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
          const logoX = pageWidth - imgWidth - 15;
          doc.addImage(logoBase64, imgProps.format || "PNG", logoX, currentY, imgWidth, imgHeight);
          boutiqueNomY = currentY + imgHeight / 2 - doc.getFontSize() / (2 * doc.internal.scaleFactor);
          currentY = Math.max(currentY + imgHeight + 5, boutiqueNomY + 5);
        } catch (e) {
          console.error("Erreur PDF logo:", e);
          currentY += 5;
        }
      } else {
        currentY += 5;
      }
    } else {
      currentY += 5;
    }

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(boutique.nom || "Ma Boutique", 15, boutiqueNomY);

    currentY = Math.max(currentY, boutiqueNomY + 10);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Liste des Ventes", pageWidth / 2, currentY, { align: "center" });
    currentY += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const filterTextPdf = `Statut: ${filterStatus === "all" ? "Tous" : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}`;
    let periodTextPdf = "Période (liste): Toutes";
    if (filterPeriodOption !== "all") {
      if (filterPeriodOption === "today") periodTextPdf = "Période (liste): Aujourd'hui";
      else if (filterPeriodOption === "thisWeek") periodTextPdf = "Période (liste): Cette semaine";
      else if (filterPeriodOption === "thisMonth") periodTextPdf = "Période (liste): Ce mois";
      else if (filterPeriodOption === "custom" && customStartDate && customEndDate) {
        periodTextPdf = `Période (liste): du ${new Date(customStartDate + "T00:00:00").toLocaleDateString(
          "fr-FR"
        )} au ${new Date(customEndDate + "T00:00:00").toLocaleDateString("fr-FR")}`;
      }
    }
    doc.text(`${filterTextPdf} | ${periodTextPdf}`, 15, currentY);
    currentY += 7;

    const totalVentesAfficheesNumPdf = displayedSales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    const totalVentesFormattedForPdf = totalVentesAfficheesNumPdf.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const totalVentesAfficheesStrPdf = `${totalVentesFormattedForPdf} ${boutique.devise || ""}`;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Total des Ventes (liste affichée): ${totalVentesAfficheesStrPdf}`, 15, currentY);
    currentY += 10;

    const tableColumn = ["Date", "Client", "Total Vente", "Statut"];
    const tableRows: string[][] = displayedSales.map((sale) => {
      const grandTotalNum = Number(sale.grandTotal || 0);
      const grandTotalFormatted = grandTotalNum.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return [
        (sale.timestamp as Date)?.toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }) || "N/A",
        customers.find((c) => c.id === sale.customerId)?.name || "Anonyme",
        `${grandTotalFormatted} ${boutique.devise || ""}`,
        sale.paymentStatus ? sale.paymentStatus.charAt(0).toUpperCase() + sale.paymentStatus.slice(1) : "N/A",
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: currentY,
      theme: "striped",
      headStyles: { fillColor: [34, 102, 136], textColor: [255, 255, 255], fontSize: 10, fontStyle: "bold" },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [240, 240, 240] },
      margin: { top: 10, right: 15, bottom: 15, left: 15 },
      didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.text(`Page ${data.pageNumber}`, data.settings.margin.left, pageHeight - 7);
        doc.text(
          new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
          pageWidth - data.settings.margin.right,
          pageHeight - 7,
          { align: "right" }
        );
      },
    });

    doc.save(`Liste_Ventes_${boutique.nom?.replace(/\s+/g, "_") || "Boutique"}_${new Date().toISOString().slice(0, 10)}.pdf`);
    setIsPdfDownloading(false);
  };

  // ---------- UI loading & guards ----------
  if (loadingUser || (userId && !boutique && !authError && sales.length === 0)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Chargement des données...</Typography>
      </Box>
    );
  }
  if (authError) {
    return <Typography>Erreur d&apos;authentification: {authError.message}</Typography>;
  }
  if (!userId && !loadingUser) {
    return <Typography>Veuillez vous connecter pour voir les ventes.</Typography>;
  }
  if (userId && !boutique && !loadingUser && !authError) {
    return <Typography>Aucune boutique associée ou chargement des informations de la boutique en cours...</Typography>;
  }

  // ---------- Render ----------
  return (
    <Box
      sx={{
        width: "100%",
        px: { xs: 1, md: 2 },
        py: 2,
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
        Liste des ventes {boutique?.nom ? `- ${boutique.nom}` : ""}
      </Typography>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 2 }}>
        <Button
          variant="contained"
          color="secondary"
          startIcon={isPdfDownloading ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />}
          onClick={handleDownloadPdf}
          disabled={displayedSales.length === 0 || isPdfDownloading}
          sx={{ textTransform: "none", fontSize: "0.85rem", py: 0.6 }}
        >
          {isPdfDownloading ? "Génération..." : "Télécharger la Liste"}
        </Button>
      </Box>

      {/* ----- Filtres & recherche (recherche par saleShortId) ----- */}
      <Box
        sx={{
          mb: 2,
          p: 1.25,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1,
          display: "flex",
          gap: 1,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <TextField
          label="Rechercher par N° vente "
          variant="outlined"
          size="small"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          sx={{ minWidth: "200px", flexGrow: 1 }}
        />
        <Button
          variant="contained"
          startIcon={<SearchIcon />}
          onClick={searchSaleById}
          sx={{ textTransform: "none", fontSize: "0.85rem", py: 0.5 }}
          disabled={!searchId.trim() || loadingMore}
        >
          {loadingMore && isSearching ? <CircularProgress size={16} color="inherit" /> : "Rechercher"}
        </Button>
        {isSearching ? (
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={resetSales} sx={{ textTransform: "none", fontSize: "0.85rem" }} disabled={loadingMore}>
            Réinitialiser
          </Button>
        ) : (
          <>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Statut</InputLabel>
              <Select value={filterStatus} label="Statut" onChange={(e) => setFilterStatus(e.target.value as any)} sx={{ fontSize: "0.85rem" }}>
                {(["all", "payé", "partiellement payé", "non payé", "à crédit"] as const).map((status) => (
                  <MenuItem key={status} value={status}>
                    {status === "all" ? "Tous statuts" : status.charAt(0).toUpperCase() + status.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Période</InputLabel>
              <Select value={filterPeriodOption} label="Période (Liste)" onChange={(e) => setFilterPeriodOption(e.target.value)} sx={{ fontSize: "0.85rem" }}>
                <MenuItem value="all">Toutes</MenuItem>
                <MenuItem value="today">Aujourd&apos;hui</MenuItem>
                <MenuItem value="thisWeek">Cette semaine</MenuItem>
                <MenuItem value="thisMonth">Ce mois</MenuItem>
                <MenuItem value="custom">Période choisie</MenuItem>
              </Select>
            </FormControl>
            {filterPeriodOption === "custom" && (
              <Grid container spacing={1} alignItems="center" sx={{ maxWidth: { xs: "100%", sm: 320 }, flexGrow: 1.5 }}>
                <Grid item xs={12} sm={6}>
                  <TextField label="Début" type="date" size="small" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="Fin" type="date" size="small" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth inputProps={{ min: customStartDate }} />
                </Grid>
              </Grid>
            )}
          </>
        )}
      </Box>

      {/* ----- DataGrid: affichage compact (réduit) pour meilleure UX ----- */}
      <Box sx={{ flexGrow: 1, minHeight: 320, width: "100%" }}>
        <DataGrid
          rows={displayedSales}
          columns={columns}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
          autoHeight={false}
          sx={{
            border: 0,
            fontSize: "0.85rem",
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: theme.palette.mode === "light" ? theme.palette.grey[100] : theme.palette.grey[800],
              borderBottom: `1px solid ${theme.palette.divider}`,
              fontSize: "0.85rem",
            },
            "& .MuiDataGrid-cell": { borderBottom: `1px solid ${theme.palette.divider}`, py: 0.6, fontSize: "0.85rem" },
            "& .MuiDataGrid-footerContainer": { borderTop: `1px solid ${theme.palette.divider}`, fontSize: "0.85rem" },
            height: "calc(100vh - 360px)",
            minHeight: 320,
          }}
          localeText={frFR.components.MuiDataGrid.defaultProps.localeText}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
          density="compact" // compact pour réduire taille des lignes
          loading={loadingMore}
        />
      </Box>

      {/* ----- Charger plus ----- */}
      {!isSearching && hasMore && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Button variant="outlined" onClick={() => fetchSales(false)} disabled={loadingMore} sx={{ textTransform: "none", fontSize: "0.85rem" }}>
            {loadingMore ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            {loadingMore ? "Chargement..." : "Charger plus"}
          </Button>
        </Box>
      )}
      {!isSearching && !hasMore && sales.length > 0 && (
        <Typography textAlign="center" sx={{ mt: 2, color: "text.secondary" }}>
          Fin de la liste des ventes.
        </Typography>
      )}

      {/* ----- Dialog Encaisser ----- */}
      <Dialog open={openPaymentDialog} onClose={() => !confirmingPayment && setOpenPaymentDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Confirmer Paiement</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>Marquer cette vente comme payée ?</Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            Total Vente:{" "}
            <strong>
              {(saleToPay?.grandTotal || 0).toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              {boutique?.devise}
            </strong>
          </Typography>
          {saleToPay?.paymentStatus === "partiellement payé" && (saleToPay.paidAmount || 0) > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              (Déjà payé:{" "}
              {(saleToPay.paidAmount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              {boutique?.devise})
            </Typography>
          )}
          <Typography variant="body1" sx={{ mt: 1 }}>
            Montant à encaisser sur cette opération :{" "}
            <strong>
              {(saleToPay?.remainingAmount ?? (saleToPay?.grandTotal ?? 0) - (saleToPay?.paidAmount ?? 0)).toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              {boutique?.devise}
            </strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPaymentDialog(false)} sx={{ textTransform: "none" }} disabled={confirmingPayment}>
            Annuler
          </Button>
          <Button variant="contained" onClick={handleConfirmPayment} sx={{ textTransform: "none" }} disabled={confirmingPayment}>
            {confirmingPayment ? <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} /> : null}
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>

      {/* ----- Dialog Détails de vente ----- */}
      <Dialog open={openDetail} onClose={() => setOpenDetail(false)} fullWidth maxWidth="md">
        <DialogTitle>Détails de la vente</DialogTitle>
        <DialogContent>
          {boutique?.id && detailSaleId && <SalesDetails boutiqueId={boutique.id} saleId={detailSaleId} onClose={() => setOpenDetail(false)} />}
        </DialogContent>
      </Dialog>

      {/* ----- Dialog Facture ----- */}
      <Dialog open={openInvoice} onClose={() => setOpenInvoice(false)} fullWidth maxWidth="lg">
        <DialogTitle>Génération de la facture</DialogTitle>
        <DialogContent sx={{ minHeight: "70vh", p: 1 }}>
          {boutique?.id && invoiceSaleId && user && <InvoiceGenerator boutiqueId={boutique.id} saleId={invoiceSaleId} userId={user.uid} type="b2b" />}
        </DialogContent>
      </Dialog>

      {/* ----- Menu déroulant PRODUITS pour la ligne sélectionnée ----- */}
      <MuiMenu
        anchorEl={productsMenuAnchorEl}
        open={Boolean(productsMenuAnchorEl)}
        onClose={() => {
          setProductsMenuAnchorEl(null);
          setProductsMenuSale(null);
        }}
        PaperProps={{ sx: { minWidth: 360, maxWidth: 520, p: 1 } }}
      >
        <Box sx={{ px: 1, py: 0.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">Produits vendus</Typography>
            <Chip label={`Total ${productsMenuSale?.items?.length ?? 0}`} size="small" />
          </Stack>
          <Divider sx={{ mb: 1 }} />
          {productsMenuSale && productsMenuSale.items && productsMenuSale.items.length > 0 ? (
            productsMenuSale.items.map((it, idx) => {
              const pm = productsMap[it.productId];
              return (
                <Box key={idx} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.6, alignItems: "center" }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {pm?.nom ?? it.productId}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      Unité: {pm?.unite ?? "—"} • Emplacement: {pm?.emplacement ?? "—"}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", minWidth: 140 }}>
                    <Typography variant="body2">Qté: {it.quantite}</Typography>
                    <Typography variant="body2">PUV: {(it.prixUnitaire || 0).toLocaleString("fr-FR")} {boutique?.devise}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Montant: {(it.total || 0).toLocaleString("fr-FR")} {boutique?.devise}
                    </Typography>
                  </Box>
                </Box>
              );
            })
          ) : (
            <Typography variant="body2" sx={{ p: 1 }}>Aucun produit enregistré pour cette vente.</Typography>
          )}
        </Box>
      </MuiMenu>
    </Box>
  );
}
