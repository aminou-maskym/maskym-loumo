// src/components/InventoryReport.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image"; // Importation pour next/image
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  documentId,
  DocumentData,
  Timestamp as FirestoreTimestamp, // Renommé pour éviter la confusion avec le type global Timestamp
} from "firebase/firestore";
import {
  Box,
  Typography,
  Paper,
  Divider,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Stack,
  Chip,
  Button,
  CircularProgress,
  Pagination,
  Grid,
  Alert,
} from "@mui/material";
import { useTheme } from '@mui/material/styles';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import ProductDetailsModal from "./ProductDetailsModal"; // Assurez-vous que ce composant existe

// --- Interfaces ---
// FirebaseTimestamp est déjà utilisé pour FirestoreTimestamp, on peut l'utiliser directement

interface InventoryLineFirestoreData {
  productId: string;
  productName?: string; // Peut être dénormalisé ou récupéré
  stockTheorique: number;
  stockPhysique: number;
  ecart: number;
  motif: string;
  controllerName?: string;
  controlledAt?: FirestoreTimestamp | Date | null;
}

interface InventoryLine {
  id: string; // Document ID de la ligne d'inventaire
  productId: string;
  productName: string;
  stockTheorique: number;
  stockPhysique: number;
  ecart: number;
  motif: string;
  controllerName: string;
  controlledAt: Date | null;
  montantEcart?: number; // Calculé localement
}

interface InventoryMeta {
  id: string; // Document ID de l'inventaire
  createdAt: FirestoreTimestamp | Date;
  createdBy: string; // User ID
  creatorName?: string; // Optionnel, si vous le récupérez
  status: string;
  type: string;
  finishedAt?: FirestoreTimestamp | Date | null;
  finishedBy?: string; // User ID
  finishedByName?: string; // Optionnel
}

interface ProductDetails {
  id: string; // Document ID du produit
  nom: string;
  description?: string;
  marque?: string;
  numeroSerie?: string;
  categoryId?: string;
  supplierId?: string;
  createdAt?: FirestoreTimestamp | Date | string | null;
  cout?: number;
  prix?: number;
  stock?: number;
  stockMin?: number;
  emplacement?: string;
  unite?: string;
}

interface BoutiqueDetails {
  id: string; // Document ID de la boutique
  nom:string;
  logoUrl: string | null;
  logoDataUrl: string | null; // Pour le PDF
  devise: string;
  adresse?: string;
  telephone?: string;
  email?: string;
}

interface Props {
  inventoryId: string;
}


const toDateSafe = (timestamp: FirestoreTimestamp | Date | string | null | undefined): Date | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
  }
  // Vérifie si c'est un objet Firestore Timestamp (qui a une méthode toDate)
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as FirestoreTimestamp).toDate === 'function') {
    return (timestamp as FirestoreTimestamp).toDate();
  }
  return null;
};

const formatCurrency = (amount: number | undefined, currencyCode: string = 'XOF') => {
  if (amount === undefined || amount === null || isNaN(amount)) return "N/A";
  const safeCurrencyCode = (typeof currencyCode === 'string' && currencyCode.length === 3) ? currencyCode.toUpperCase() : 'XOF';
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: safeCurrencyCode }).format(amount);
  } catch (e) {
    console.warn(`Currency code ${safeCurrencyCode} may not be supported by Intl.NumberFormat. Error: ${e}. Falling back to XOF.`);
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(amount);
  }
};

const formatNumber = (value: number | undefined | null, options?: Intl.NumberFormatOptions) => {
  if (value === undefined || value === null || isNaN(value)) return "N/A";
  return new Intl.NumberFormat('fr-FR', options).format(value);
};

const formatValueForPdf = (value: number | string | undefined | null, type: 'number' | 'currency' = 'number', currencyCode: string = 'XOF') => {
    if (value === undefined || value === null || (typeof value === 'number' && isNaN(value))) return "N/A";
    let formatted: string;
    if (type === 'currency' && typeof value === 'number') {
        formatted = formatCurrency(value, currencyCode);
    } else if (typeof value === 'number') {
        formatted = formatNumber(value);
    } else {
        formatted = String(value);
    }
    return typeof formatted === 'string' ? formatted.replace(/\s/g, ' ') : formatted; // Remplace les espaces insécables par des espaces normaux pour PDF
};


function hexToRgb(hex: string): [number, number, number] | null {
  if (!hex || typeof hex !== 'string') return null;
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

const ITEMS_PER_PAGE = 10;

export default function InventoryReport({ inventoryId }: Props) {
  const theme = useTheme();
  const [user, authLoading] = useAuthState(auth);
  
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [boutiqueDetails, setBoutiqueDetails] = useState<BoutiqueDetails | null>(null);
  const [meta, setMeta] = useState<InventoryMeta | null>(null);
  const [lines, setLines] = useState<InventoryLine[]>([]);

  const [isLoadingBoutiqueId, setIsLoadingBoutiqueId] = useState(true);
  const [isLoadingBoutiqueDetails, setIsLoadingBoutiqueDetails] = useState(true);
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isLoadingLines, setIsLoadingLines] = useState(true);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetails | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const isLoading = authLoading || isLoadingBoutiqueId || isLoadingBoutiqueDetails || isLoadingMeta || isLoadingLines;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoadingBoutiqueId(false);
      setBoutiqueId(null);
      return;
    }
    setIsLoadingBoutiqueId(true);
    const q = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid));
    const unsub = onSnapshot(q, 
      (snap) => {
        if (!snap.empty) {
          setBoutiqueId(snap.docs[0].id);
        } else {
          console.warn("InventoryReport: Aucune boutique trouvée pour l'utilisateur:", user.uid);
          setBoutiqueId(null);
        }
        setIsLoadingBoutiqueId(false);
      },
      (error) => {
        console.error("InventoryReport: Erreur de chargement boutiqueId:", error);
        setBoutiqueId(null);
        setIsLoadingBoutiqueId(false);
      }
    );
    return () => unsub();
  }, [user, authLoading]);

  useEffect(() => {
    if (!boutiqueId) {
      setBoutiqueDetails(null);
      setIsLoadingBoutiqueDetails(false);
      return;
    }
    setIsLoadingBoutiqueDetails(true);
    const boutiqueRef = doc(db, "boutiques", boutiqueId);
    
    const unsubBoutique = onSnapshot(boutiqueRef, 
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as DocumentData;
          const nom = data?.nom || "Nom de boutique inconnu";
          const logoUrl = data?.logoUrl || null;
          const devise = data?.devise || "XOF";
          let logoDataUrl: string | null = null;

          if (logoUrl) {
            try {
              // Note: Fetching image like this might have CORS issues depending on storage rules
              // It's better if logoUrl is a publicly accessible URL or handled via Firebase Storage SDK
              const response = await fetch(logoUrl);
              if (response.ok) {
                const blob = await response.blob();
                logoDataUrl = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
              } else {
                console.warn(`InventoryReport: Impossible de charger le logo depuis ${logoUrl}. Statut: ${response.status}`);
              }
            } catch (error) {
              console.error("InventoryReport: Erreur lors du chargement ou de la conversion du logo:", error);
            }
          }
          setBoutiqueDetails({ id: docSnap.id, nom, logoUrl, logoDataUrl, devise, adresse: data?.adresse, telephone: data?.telephone, email: data?.email });
        } else {
          console.warn(`InventoryReport: Détails de la boutique non trouvés pour l'ID: ${boutiqueId}`);
          setBoutiqueDetails({ id: boutiqueId, nom: "Boutique Inconnue", logoUrl: null, logoDataUrl: null, devise: "XOF" });
        }
        setIsLoadingBoutiqueDetails(false);
      },
      (error) => {
        console.error("InventoryReport: Erreur de chargement des détails de la boutique:", error);
        setBoutiqueDetails(null);
        setIsLoadingBoutiqueDetails(false);
      }
    );
    return () => unsubBoutique();
  }, [boutiqueId]);

  useEffect(() => {
    if (!boutiqueId || !inventoryId) {
      setMeta(null);
      setIsLoadingMeta(false);
      return;
    }
    setIsLoadingMeta(true);
    const invRef = doc(db, "boutiques", boutiqueId, "inventaires", inventoryId);
    
    const unsubMeta = onSnapshot(invRef, 
      async (docSnap) => {
        if (docSnap.exists()) {
          const metaData = docSnap.data() as Omit<InventoryMeta, 'id'>; // Data from Firestore won't have the id field itself
          // Fetch creator name if needed
          let creatorNameDisplay = metaData.createdBy; // Default to ID
          if(metaData.createdBy) {
            try {
                const userDoc = await getDoc(doc(db, "users", metaData.createdBy));
                if(userDoc.exists()) creatorNameDisplay = userDoc.data()?.fullName || metaData.createdBy;
            } catch (e) { console.warn("Could not fetch creator name", e)}
          }
          setMeta({ ...metaData, id: docSnap.id, creatorName: creatorNameDisplay });
        } else {
          console.warn(`InventoryReport: Inventaire meta non trouvé: ${inventoryId}`);
          setMeta(null);
        }
        setIsLoadingMeta(false);
      },
      (error) => {
        console.error("InventoryReport: Erreur de chargement meta inventaire:", error);
        setMeta(null);
        setIsLoadingMeta(false);
      }
    );
    return () => unsubMeta();
  }, [boutiqueId, inventoryId]);

  useEffect(() => {
    if (!boutiqueId || !inventoryId) {
      setLines([]);
      setIsLoadingLines(false);
      return;
    }
    setIsLoadingLines(true);
    setCurrentPage(1); 
    const linesColRef = collection(db, "boutiques", boutiqueId, "inventaires", inventoryId, "lignesInventaires");

    const unsubLines = onSnapshot(linesColRef, 
      async (linesSnapshot) => {
        const rawLinesData: (InventoryLineFirestoreData & { id: string })[] = linesSnapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as InventoryLineFirestoreData),
        }));

        if (rawLinesData.length === 0) {
          setLines([]);
          setIsLoadingLines(false);
          return;
        }

        const productIds = [...new Set(rawLinesData.map(line => line.productId).filter(Boolean))];
        const productsData: Record<string, { nom: string; prix?: number }> = {};

        if (productIds.length > 0) {
          const MAX_IDS_PER_QUERY = 30; // Firestore 'in' query limit
          const productPromises = [];
          for (let i = 0; i < productIds.length; i += MAX_IDS_PER_QUERY) {
            const batchIds = productIds.slice(i, i + MAX_IDS_PER_QUERY);
            if (batchIds.length > 0) { // Ensure batchIds is not empty
              const productsQuery = query(
                collection(db, "boutiques", boutiqueId, "products"),
                where(documentId(), "in", batchIds)
              );
              productPromises.push(getDocs(productsQuery));
            }
          }
          
          const productSnapshotsArray = await Promise.all(productPromises);
          for (const productSnaps of productSnapshotsArray) {
            productSnaps.forEach(prodDoc => {
              const data = prodDoc.data() as DocumentData;
              productsData[prodDoc.id] = { 
                nom: data?.nom || "Produit inconnu",
                prix: typeof data?.prix === 'number' ? data.prix : undefined
              };
            });
          }
        }

        const enrichedLines: InventoryLine[] = rawLinesData.map(line => {
          const productInfo = productsData[line.productId];
          const prixProduit = productInfo?.prix;
          let montantEcartVal: number | undefined = undefined;
          if (prixProduit !== undefined && typeof line.ecart === 'number') {
            montantEcartVal = line.ecart * prixProduit;
          }

          return {
            id: line.id,
            productId: line.productId,
            productName: productInfo?.nom || line.productName || line.productId, // Fallback
            stockTheorique: line.stockTheorique,
            stockPhysique: line.stockPhysique,
            ecart: line.ecart,
            motif: line.motif || "",
            controllerName: line.controllerName || "N/A",
            controlledAt: toDateSafe(line.controlledAt),
            montantEcart: montantEcartVal,
          };
        });

        setLines(enrichedLines.sort((a,b) => (a.productName || "").localeCompare(b.productName || ""))); // Sort by name
        setIsLoadingLines(false);
      },
      (error) => {
        console.error("InventoryReport: Erreur de chargement lignes inventaire:", error);
        setLines([]);
        setIsLoadingLines(false);
      }
    );
    return () => unsubLines();
  }, [boutiqueId, inventoryId]);

  const { totalGains, totalLosses, netDifference } = useMemo(() => {
    let gains = 0;
    let losses = 0;
    lines.forEach(line => {
      if (line.montantEcart !== undefined) {
        if (line.montantEcart > 0) gains += line.montantEcart;
        else if (line.montantEcart < 0) losses += Math.abs(line.montantEcart);
      }
    });
    return { totalGains: gains, totalLosses: losses, netDifference: gains - losses };
  }, [lines]);

  const paginatedLines = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return lines.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [lines, currentPage]);

  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setCurrentPage(value);
  };
  
  const linesWithEcartCount = useMemo(() => lines.filter(l => l.ecart !== 0).length, [lines]);
  const sumEcartQty = useMemo(() => lines.reduce((sum, l) => sum + (l.ecart || 0), 0), [lines]);

  const invName = useMemo(() => {
    if (!meta?.createdAt) return `INV_${inventoryId.substring(0, 6)}`;
    const d = toDateSafe(meta.createdAt);
    if (!d) return `INV_${inventoryId.substring(0, 6)}`;
    return `INV_${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
  }, [meta, inventoryId]);

  const handleOpenModal = useCallback(async (productId: string) => {
    if (!boutiqueId) return;
    try {
      const pSnap = await getDoc(doc(db, "boutiques", boutiqueId, "products", productId));
      if (!pSnap.exists()) {
          console.warn(`InventoryReport: Product details not found for ID: ${productId}`);
          setSelectedProduct(null); // Or some error state
          setModalOpen(true); // Open modal to show "not found" or similar
          return;
      }
      const d = pSnap.data() as Omit<ProductDetails, 'id'>; 
      setSelectedProduct({
        id: pSnap.id,
        nom: d.nom || "Produit Inconnu",
        description: d.description,
        marque: d.marque,
        numeroSerie: d.numeroSerie,
        categoryId: d.categoryId,
        supplierId: d.supplierId,
        createdAt: toDateSafe(d.createdAt),
        cout: d.cout,
        prix: d.prix,
        stock: d.stock,
        stockMin: d.stockMin,
        emplacement: d.emplacement,
        unite: d.unite,
      });
      setModalOpen(true);
    } catch (error) {
      console.error("InventoryReport: Error fetching product details for modal:", error);
      setSelectedProduct(null); // Handle error state appropriately
      // Optionally open modal with an error message
    }
  }, [boutiqueId]);

  const exportPDF = useCallback(() => {
    if (!meta || !boutiqueDetails) return;

    const pdfDoc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const createdAtDate = toDateSafe(meta.createdAt);
    const pageMargin = 15;
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageHeight = pdfDoc.internal.pageSize.getHeight();
    let currentY = pageMargin;
    const currentDevise = boutiqueDetails.devise || "XOF";

    // Header
    if (boutiqueDetails.logoDataUrl) {
      try {
        const imgProps = pdfDoc.getImageProperties(boutiqueDetails.logoDataUrl);
        const aspectRatio = imgProps.width / imgProps.height;
        const logoHeight = 15; // mm
        const logoWidth = logoHeight * aspectRatio;
        const maxLogoWidth = pageWidth / 3; // Max 1/3 of page width
        const finalLogoWidth = Math.min(logoWidth, maxLogoWidth);
        const finalLogoHeight = finalLogoWidth / aspectRatio;

        pdfDoc.addImage(boutiqueDetails.logoDataUrl, 'PNG', pageMargin, currentY, finalLogoWidth, finalLogoHeight);
        currentY += finalLogoHeight + 5; 
      } catch (e) {
        console.error("InventoryReport: Erreur d'ajout du logo au PDF:", e);
      }
    }
    pdfDoc.setFontSize(14);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text(boutiqueDetails.nom, pageMargin, currentY);
    currentY += 6;
    if(boutiqueDetails.adresse) {
        pdfDoc.setFontSize(9);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(boutiqueDetails.adresse, pageMargin, currentY);
        currentY += 4;
    }
    if(boutiqueDetails.telephone) {
        pdfDoc.setFontSize(9);
        pdfDoc.text(`Tél: ${boutiqueDetails.telephone}`, pageMargin, currentY);
        currentY += 4;
    }
    currentY += 2; // Extra space
    
    pdfDoc.setDrawColor(180, 180, 180);
    pdfDoc.line(pageMargin, currentY, pageWidth - pageMargin, currentY);
    currentY += 8;

    pdfDoc.setFontSize(18);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text(`Rapport d'Inventaire: ${invName}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;

    pdfDoc.setFontSize(10);
    pdfDoc.setFont("helvetica", "normal");
    const metaInfoX = pageMargin;
    const metaInfoX2 = pageWidth / 2 + 10;
    
    pdfDoc.text(`ID Inventaire :`, metaInfoX, currentY);
    pdfDoc.text(inventoryId, metaInfoX + 35, currentY);
    pdfDoc.text(`Type :`, metaInfoX2, currentY);
    pdfDoc.text(String(meta.type || 'N/A'), metaInfoX2 + 20, currentY);
    currentY += 5;
    
    pdfDoc.text(`Statut :`, metaInfoX, currentY);
    pdfDoc.text(String(meta.status || 'N/A'), metaInfoX + 35, currentY);
    pdfDoc.text(`Créé le :`, metaInfoX2, currentY);
    pdfDoc.text(createdAtDate ? createdAtDate.toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'}) : 'N/A', metaInfoX2 + 20, currentY);
    currentY += 5;

    pdfDoc.text(`Par :`, metaInfoX, currentY);
    pdfDoc.text(String(meta.creatorName || meta.createdBy || 'N/A'), metaInfoX + 35, currentY);
    if(meta.status === 'termine' && meta.finishedAt) {
        const finishedAtDate = toDateSafe(meta.finishedAt);
        pdfDoc.text(`Terminé le :`, metaInfoX2, currentY);
        pdfDoc.text(finishedAtDate ? finishedAtDate.toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'}) : 'N/A', metaInfoX2 + 20, currentY);
    }
    currentY += 8;
   
    const pdfDocTyped = pdfDoc as jsPDF & { lastAutoTable: { finalY: number } }; // Type assertion for lastAutoTable
    autoTable(pdfDocTyped, {
      startY: currentY,
      head: [["Produit", "Théor.", "Phys.", "Écart", `Val. Écart (${currentDevise})`, "Motif", "Par", "Date Ctrl."]],
      body: lines.map(l => [
        String(l.productName || 'N/A'),
        formatValueForPdf(l.stockTheorique),
        formatValueForPdf(l.stockPhysique),
        formatValueForPdf(l.ecart),
        formatValueForPdf(l.montantEcart, 'currency', currentDevise),
        String(l.motif || "—"),
        String(l.controllerName || "—"),
        l.controlledAt ? l.controlledAt.toLocaleDateString('fr-FR') : "—",
      ]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, font: "helvetica", overflow: 'linebreak' },
      headStyles: { 
        fillColor: hexToRgb(theme.palette.grey[200]) || [220,220,220],
        textColor: hexToRgb(theme.palette.common.black) || [0,0,0],
        fontStyle: 'bold', fontSize: 7.5
      },
      columnStyles: {
        0: { cellWidth: 45 }, // Produit
        4: { cellWidth: 20, halign: 'right'}, // Val Ecart
        1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
      },
      margin: { left: pageMargin, right: pageMargin },
      didDrawPage: (data) => { // Footer for each page
        pdfDoc.setFontSize(8);
        pdfDoc.setFont("helvetica", "italic");
        pdfDoc.setTextColor(150, 150, 150);
        pdfDoc.text(`Page ${data.pageNumber} sur ${pdfDoc.internal.getNumberOfPages()}`, 
                    pageWidth - pageMargin, pageHeight - 10, { align: 'right' });
      }
    });

    currentY = pdfDocTyped.lastAutoTable.finalY + 10;

    // Summary section
    pdfDoc.setFontSize(10);
    pdfDoc.setFont("helvetica", "bold");
    if (currentY + 30 > pageHeight - pageMargin) { // Check if space for summary
        pdfDoc.addPage();
        currentY = pageMargin;
    }
    pdfDoc.text("Résumé des Écarts", pageMargin, currentY);
    currentY += 6;

    const summaryItems = [
      { label: "Lignes avec écart:", value: formatValueForPdf(linesWithEcartCount) },
      { label: "Somme des écarts (unités):", value: formatValueForPdf(sumEcartQty) },
      { label: "Écarts Positifs (Valeur):", value: formatValueForPdf(totalGains, 'currency', currentDevise), color: theme.palette.success.main },
      { label: "Écarts Négatifs (Valeur):", value: formatValueForPdf(totalLosses, 'currency', currentDevise), color: theme.palette.error.main },
      { label: "Différence Nette (Valeur):", value: formatValueForPdf(netDifference, 'currency', currentDevise), color: netDifference >= 0 ? theme.palette.success.main : theme.palette.error.main },
    ];
    
    summaryItems.forEach(item => {
        if (currentY > pageHeight - pageMargin - 10) { // Check space for each item
            pdfDoc.addPage();
            currentY = pageMargin;
        }
        const defaultColorRgb: [number,number,number] = hexToRgb(theme.palette.text.primary) || [0,0,0];
        let itemColorRgb: [number,number,number] = defaultColorRgb;

        if (item.color) {
            itemColorRgb = hexToRgb(item.color) || defaultColorRgb;
        }
        pdfDoc.setTextColor(itemColorRgb[0], itemColorRgb[1], itemColorRgb[2]);
        pdfDoc.setFont("helvetica", item.color ? "bold" : "normal");
        
        pdfDoc.text(String(item.label || ''), pageMargin, currentY);
        pdfDoc.text(String(item.value || ''), pageWidth / 1.8, currentY, {align: 'left'});
        pdfDoc.setTextColor(defaultColorRgb[0],defaultColorRgb[1],defaultColorRgb[2]); // Reset color
        currentY += 6;
    });
    
    pdfDoc.save(`${invName}_RapportInventaire.pdf`);
  }, [meta, lines, invName, inventoryId, linesWithEcartCount, sumEcartQty, totalGains, totalLosses, netDifference, boutiqueDetails, theme]);

  const exportExcel = useCallback(async () => {
    if (!meta || !boutiqueDetails) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Rapport Inventaire");
    const createdAtDate = toDateSafe(meta.createdAt);
    const currentDevise = boutiqueDetails.devise || "XOF";

    // Header
    let rowNum = 1;
    if (boutiqueDetails.nom) {
        ws.getCell(`A${rowNum}`).value = boutiqueDetails.nom;
        ws.getCell(`A${rowNum}`).font = { size: 16, bold: true };
        ws.mergeCells(`A${rowNum}:D${rowNum}`);
        rowNum++;
    }
    ws.getCell(`A${rowNum}`).value = `Rapport d'Inventaire: ${invName}`;
    ws.getCell(`A${rowNum}`).font = { size: 14, bold: true };
    ws.mergeCells(`A${rowNum}:D${rowNum}`);
    rowNum+=2;

    const metaInfo = [
        ["ID Inventaire:", inventoryId],
        ["Type:", meta.type],
        ["Statut:", meta.status],
        ["Créé le:", createdAtDate ? createdAtDate.toLocaleString('fr-FR') : 'N/A'],
        ["Par:", meta.creatorName || meta.createdBy || 'N/A'],
    ];
    if(meta.status === 'termine' && meta.finishedAt) {
        metaInfo.push(["Terminé le:", toDateSafe(meta.finishedAt)?.toLocaleString('fr-FR') || 'N/A']);
    }
    metaInfo.forEach(item => {
        ws.getCell(`A${rowNum}`).value = item[0]; ws.getCell(`B${rowNum}`).value = item[1];
        ws.getCell(`A${rowNum}`).font = {bold: true};
        rowNum++;
    });
    rowNum++;

    // Summary
    const summaryData = [
        ["Écarts Positifs (Valeur)", totalGains],
        ["Écarts Négatifs (Valeur)", totalLosses],
        ["Différence Nette (Valeur)", netDifference],
        ["Lignes avec écart", linesWithEcartCount],
        ["Somme des écarts (unités)", sumEcartQty],
    ];
    summaryData.forEach((item, index) => {
        ws.getCell(`A${rowNum}`).value = item[0]; ws.getCell(`B${rowNum}`).value = item[1];
        ws.getCell(`A${rowNum}`).font = {bold: true};
        if(index <= 2) ws.getCell(`B${rowNum}`).numFmt = `#,##0.00 "${currentDevise}"`;
        else ws.getCell(`B${rowNum}`).numFmt = '#,##0';
        rowNum++;
    });
    rowNum++;

    // Table Header
    const headerRow = ws.addRow([
      "Produit", "Stock Théorique", "Stock Physique", "Écart (Qté)", `Montant Écart (${currentDevise})`, 
      "Motif", "Contrôlé par", "Date Contrôle"
    ]);
    headerRow.font = { bold: true, color: {argb: 'FF000000'} };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; // Light grey
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    rowNum++;

    // Table Body
    lines.forEach(l => {
      const dataRow = ws.addRow([
        l.productName, 
        l.stockTheorique,
        l.stockPhysique,
        l.ecart,
        l.montantEcart,
        l.motif || "—", 
        l.controllerName || "—", 
        l.controlledAt // ExcelJS handles Date objects well
      ]);
      dataRow.getCell(2).numFmt = '#,##0'; // Theorique
      dataRow.getCell(3).numFmt = '#,##0'; // Physique
      dataRow.getCell(4).numFmt = '#,##0'; // Ecart Qté
      dataRow.getCell(5).numFmt = `#,##0.00 "${currentDevise}"`; // Montant Ecart
      dataRow.getCell(8).numFmt = 'dd/mm/yyyy hh:mm'; // Date Controle
      rowNum++;
    });
    
    // Auto-fit columns
    ws.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            let cellLength = cell.value ? cell.value.toString().length : 10;
            if (cell.numFmt && typeof cell.value === 'number') { // Approximate length for formatted numbers/dates
                 if (cell.numFmt.includes('yy')) cellLength = 16; // Date with time
                 else if (cell.numFmt.includes(currentDevise)) cellLength = String(cell.value).length + currentDevise.length + 5; // Currency
                 else cellLength = String(cell.value).length + 3; // Number with thousands separators
            }
            if (cellLength > maxLength) {
                maxLength = cellLength;
            }
        });
        column.width = Math.min(Math.max(maxLength + 2, 12), 50); // Min width 12, max 50
    });

    const buf = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `${invName}_RapportInventaire.xlsx`
    );
  }, [meta, lines, invName, inventoryId, linesWithEcartCount, sumEcartQty, totalGains, totalLosses, netDifference, boutiqueDetails]);


  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" sx={{ py: 4, minHeight: '300px' }}>
        <CircularProgress /> <Typography sx={{ml: 2}}>Chargement du rapport...</Typography>
      </Box>
    );
  }

  if (!authLoading && !user) {
    return ( <Alert severity="error" sx={{m:2}}>Veuillez vous connecter pour voir ce rapport.</Alert>);
  }
  
  if (!isLoadingBoutiqueId && !boutiqueId && !authLoading && user) {
    return ( <Alert severity="warning" sx={{m:2}}>Aucune boutique n'est associée à votre compte.</Alert>);
  }
  
  if (!isLoadingBoutiqueDetails && !boutiqueDetails && boutiqueId) {
    return ( <Alert severity="error" sx={{m:2}}>Impossible de charger les détails de la boutique.</Alert>);
  }

  if (!isLoadingMeta && !meta && inventoryId) {
    return ( <Alert severity="error" sx={{m:2}}>Les données de cet inventaire (ID: {inventoryId}) sont introuvables.</Alert>);
  }
  
  // After individual loading states, if meta or boutiqueDetails are still null, it's a critical data issue
  if (!meta || !boutiqueDetails) { 
    return ( <Alert severity="error" sx={{m:2}}>Données essentielles pour le rapport non chargées. Veuillez réessayer ou contacter le support.</Alert>);
  }

  const metaCreatedAtDate = toDateSafe(meta.createdAt);
  const currentDevise = boutiqueDetails.devise || "XOF";

  return (
    <Box sx={{py:2}}>
      <Paper elevation={3} sx={{ p: {xs: 2, sm:3}, mb: 3, borderRadius: 2 }}>
        {boutiqueDetails && (
          <>
            <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} alignItems="center" sx={{mb: 2}}>
              {boutiqueDetails.logoUrl && (
                // IMPORTANT: Requires `images: { unoptimized: true }` in next.config.js for `output: 'export'`
                // OR configure domain in next.config.js if not unoptimized.
                <Box sx={{ width: {xs: 120, sm: 150}, height: {xs:40, sm:50}, position: 'relative', mb: {xs:1, sm:0} }}>
                  <Image 
                    src={boutiqueDetails.logoUrl} 
                    alt={`${boutiqueDetails.nom} logo`} 
                    layout="fill"
                    objectFit="contain"
                    priority // Consider if this is a Largest Contentful Paint element
                  />
                </Box>
              )}
              <Typography variant="h6" component="h1" sx={{textAlign: {xs:'center', sm:'left'}}}>{boutiqueDetails.nom}</Typography>
            </Stack>
            <Divider sx={{ mb: 2 }} />
          </>
        )}
        <Typography variant="h5" component="h2" gutterBottom sx={{textAlign: 'center'}}>{`Rapport d'Inventaire - ${invName}`}</Typography>
        <Grid container spacing={1} sx={{mb:2, fontSize: '0.9rem'}}>
            <Grid item xs={12} sm={6}><strong>ID :</strong> {inventoryId}</Grid>
            <Grid item xs={12} sm={6}><strong>Type :</strong> {meta.type}</Grid>
            <Grid item xs={12} sm={6}><strong>Statut :</strong> {meta.status}</Grid>
            <Grid item xs={12} sm={6}><strong>Créé le :</strong> {metaCreatedAtDate ? metaCreatedAtDate.toLocaleString('fr-FR', {dateStyle:'medium', timeStyle:'short'}) : 'N/A'}</Grid>
            <Grid item xs={12} sm={6}><strong>Par :</strong> {meta.creatorName || meta.createdBy || 'N/A'}</Grid>
            {meta.status === 'termine' && meta.finishedAt && (
                <Grid item xs={12} sm={6}><strong>Terminé le :</strong> {toDateSafe(meta.finishedAt)?.toLocaleString('fr-FR', {dateStyle:'medium', timeStyle:'short'}) || 'N/A'}</Grid>
            )}
        </Grid>
      </Paper>

      <Paper elevation={1} sx={{ p: {xs:1.5, sm:2}, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" component="h3" sx={{textAlign:'center', mb:2}}>Résumé des Écarts</Typography>
        <Grid container spacing={2} justifyContent="center">
          <Grid item xs={12} md={4} textAlign="center">
            <Typography variant="subtitle1" sx={{ color: theme.palette.success.dark, fontWeight: 'medium' }}>
              Gains (Valeur)
            </Typography>
            <Typography variant="h6" sx={{ color: theme.palette.success.main, fontWeight: 'bold' }}>
              {formatCurrency(totalGains, currentDevise)}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4} textAlign="center">
            <Typography variant="subtitle1" sx={{ color: theme.palette.error.dark, fontWeight: 'medium' }}>
              Pertes (Valeur)
            </Typography>
            <Typography variant="h6" sx={{ color: theme.palette.error.main, fontWeight: 'bold' }}>
              {formatCurrency(totalLosses, currentDevise)}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4} textAlign="center">
            <Typography variant="subtitle1" sx={{ color: netDifference >= 0 ? theme.palette.success.dark : theme.palette.error.dark, fontWeight: 'medium' }}>
              Différence Nette (Valeur)
            </Typography>
            <Typography variant="h6" sx={{ color: netDifference >= 0 ? theme.palette.success.main : theme.palette.error.main, fontWeight: 'bold' }}>
              {formatCurrency(netDifference, currentDevise)}
            </Typography>
          </Grid>
        </Grid>
        <Divider sx={{ my: 2 }}/>
        <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap">
          <Chip label={`Lignes avec écart : ${formatNumber(linesWithEcartCount)}`} color="info" variant="outlined" />
          <Chip label={`Écart total (unités) : ${formatNumber(sumEcartQty)}`} color={sumEcartQty === 0 ? "default" : (sumEcartQty > 0 ? "success" : "warning")} variant="outlined"/>
        </Stack>
      </Paper>

      <Stack direction={{xs:'column', sm:"row"}} spacing={2} sx={{ mb: 2 }} justifyContent="flex-end">
        <Button variant="outlined" onClick={exportPDF} disabled={isLoading || lines.length === 0} startIcon={<span>📄</span>}>
          Exporter PDF
        </Button>
        <Button variant="outlined" onClick={exportExcel} disabled={isLoading || lines.length === 0} startIcon={<span>📊</span>}>
          Exporter Excel
        </Button>
      </Stack>

      <TableContainer component={Paper} elevation={2} sx={{ mb: 3, borderRadius: 2 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{minWidth: 170, fontWeight:'bold'}}>Produit</TableCell>
              <TableCell align="right" sx={{fontWeight:'bold'}}>Théorique</TableCell>
              <TableCell align="right" sx={{fontWeight:'bold'}}>Physique</TableCell>
              <TableCell align="right" sx={{fontWeight:'bold'}}>Écart (Qté)</TableCell>
              <TableCell align="right" sx={{minWidth: 130, fontWeight:'bold'}}>{`Val. Écart (${currentDevise})`}</TableCell>
              <TableCell sx={{minWidth: 120, fontWeight:'bold'}}>Motif</TableCell>
              <TableCell sx={{minWidth: 150, fontWeight:'bold'}}>Contrôlé par</TableCell>
              <TableCell align="right" sx={{minWidth: 140, fontWeight:'bold'}}>Date Contrôle</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoadingLines ? (
                <TableRow>
                    <TableCell colSpan={8} align="center" sx={{py:3}}>
                        <CircularProgress size={24} sx={{mr:1}}/> Chargement des lignes...
                    </TableCell>
                </TableRow>
            ) : paginatedLines.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={8} align="center" sx={{py:3}}>
                        Aucune ligne d&apos;inventaire à afficher pour cet enregistrement.
                    </TableCell>
                </TableRow>
            ) : (
                paginatedLines.map((l) => (
                    <TableRow hover key={l.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell component="th" scope="row">
                        <Button
                            variant="text"
                            size="small"
                            onClick={() => handleOpenModal(l.productId)}
                            sx={{ textTransform: 'none', justifyContent: 'flex-start', textAlign: 'left', p:0, lineHeight: 1.2, fontWeight: 'normal' }}
                            title={`Détails pour ${l.productName}`}
                        >
                            {l.productName}
                        </Button>
                        </TableCell>
                        <TableCell align="right">{formatNumber(l.stockTheorique)}</TableCell>
                        <TableCell align="right">{formatNumber(l.stockPhysique)}</TableCell>
                        <TableCell align="right" sx={{fontWeight: l.ecart !== 0 ? 'bold' : 'normal', color: l.ecart === 0 ? 'text.primary' : (l.ecart > 0 ? theme.palette.success.main : theme.palette.error.main)}}>
                            {formatNumber(l.ecart)}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          sx={{ 
                            fontWeight: l.montantEcart !== undefined && l.montantEcart !== 0 ? 'bold' : 'normal',
                            color: l.montantEcart === undefined || l.montantEcart === 0 ? 'text.primary' : (l.montantEcart > 0 ? theme.palette.success.main : theme.palette.error.main)
                          }}
                        >
                          {formatCurrency(l.montantEcart, currentDevise)}
                        </TableCell>
                        <TableCell sx={{maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace:'nowrap'}} title={l.motif}>{l.motif || "—"}</TableCell>
                        <TableCell>{l.controllerName || "—"}</TableCell>
                        <TableCell align="right">
                        {l.controlledAt ? l.controlledAt.toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'}) : "—"}
                        </TableCell>
                    </TableRow>
                    ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {lines.length > ITEMS_PER_PAGE && !isLoadingLines && (
        <Stack spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Pagination
            count={Math.ceil(lines.length / ITEMS_PER_PAGE)}
            page={currentPage}
            onChange={handlePageChange}
            color="primary"
            showFirstButton 
            showLastButton
          />
        </Stack>
      )}

      {selectedProduct && (
        <ProductDetailsModal
          open={modalOpen}
          onClose={() => {setModalOpen(false); setSelectedProduct(null);}}
          product={selectedProduct}
          boutiqueId={boutiqueId} // ProductDetailsModal might need this
        />
      )}
    </Box>
  );
}