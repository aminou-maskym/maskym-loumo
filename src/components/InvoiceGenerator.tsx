// src/components/InvoiceGenerator.tsx
"use client";

/* eslint-disable jsx-a11y/alt-text */

import React, { useEffect, useState } from "react";
import { Document, Page, StyleSheet, PDFDownloadLink, PDFViewer, Image, View, Text as PdfText } from "@react-pdf/renderer";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Box, Button, Typography } from "@mui/material";

/* ---------- Couleurs et constantes ---------- */
const COLORS = {
  primary: "#1f6feb",
  text: "#222",
  muted: "#666",
  lightGray: "#f6f6f6",
  paidBg: "#d4edda",
  partialBg: "#fff3cd",
  unpaidBg: "#f8d7da",
};

const POINTS_PER_MM = 72 / 25.4;
const THERMAL_80MM_WIDTH = Number((80 * POINTS_PER_MM).toFixed(2)); // ≈ 226.77
// hauteur suffisamment grande — on pagine pour éviter coupe
const THERMAL_PAGE_HEIGHT = 1200;

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  page: {
    width: THERMAL_80MM_WIDTH,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.text,
  },

  /* header compact */
  header: {
    alignItems: "center",
    marginBottom: 6,
  },
  logo: {
    width: 44,
    height: 44,
    marginBottom: 4,
  },
  shopName: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 2,
    textAlign: "center",
  },
  shopMeta: {
    fontSize: 7.5,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 1.1,
  },

  /* invoice id & meta row */
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  metaLeft: { fontSize: 8 },
  metaRight: { fontSize: 8, textAlign: "right" },

  /* client block */
  clientBlock: {
    marginBottom: 6,
    borderTop: `1px solid ${COLORS.lightGray}`,
    borderBottom: `1px solid ${COLORS.lightGray}`,
    paddingVertical: 6,
  },
  clientLine: { fontSize: 8, color: COLORS.muted },

  /* items table but single-column friendly */
  itemsHeader: {
    flexDirection: "row",
    paddingVertical: 4,
    borderTop: `1px solid ${COLORS.lightGray}`,
    borderBottom: `1px solid ${COLORS.lightGray}`,
    marginBottom: 4,
  },
  itemsHeaderLeft: { flex: 4, fontSize: 8, fontWeight: "bold" },
  itemsHeaderQty: { flex: 1, fontSize: 8, fontWeight: "bold", textAlign: "center" },
  itemsHeaderTotal: { flex: 2, fontSize: 8, fontWeight: "bold", textAlign: "right" },

  itemRow: {
    flexDirection: "row",
    marginBottom: 3,
    alignItems: "flex-start",
  },
  itemLeft: { flex: 4, fontSize: 8 },
  itemQty: { flex: 1, fontSize: 8, textAlign: "center" },
  itemTotal: { flex: 2, fontSize: 8, textAlign: "right" },
  itemDesc: { fontSize: 7, color: COLORS.muted },

  /* totals */
  totalsBlock: {
    marginTop: 6,
    borderTop: `1px solid ${COLORS.lightGray}`,
    paddingTop: 6,
  },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalsLabel: { fontSize: 8, color: COLORS.muted },
  totalsValue: { fontSize: 9, fontWeight: "bold", textAlign: "right" },

  /* badge */
  badge: {
    marginTop: 6,
    alignSelf: "center",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  badgeText: { fontSize: 8, fontWeight: "bold", textTransform: "uppercase" },

  /* footer in flow (not absolute) */
  footer: {
    marginTop: 8,
    borderTop: `1px dashed ${COLORS.lightGray}`,
    paddingTop: 6,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "center",
  },
});

/* ---------- Types ---------- */
interface InvoiceGeneratorProps {
  boutiqueId: string;
  saleId: string;
  type: "b2b" | "b2c";
  printer?: "thermal" | "mobile";
}

interface Boutique {
  nom?: string;
  adresse?: string;
  telephone?: string;
  logoUrl?: string;
  devise?: string;
  legal?: string;
  siteWeb?: string;
  tva?: number;
  receiptFooterMessage?: string;
}

interface Client {
  nom?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
}

interface SaleItem {
  productId: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
  nom?: string;
  description?: string;
  emplacement?: string;
}

type PaymentStatus = "payé" | "partiellement payé" | "Paiement sur compte";

interface Sale {
  customerId?: string;
  items: SaleItem[];
  timestamp: Timestamp;
  paymentStatus: PaymentStatus;
  paidAmount?: number;
  remainingAmount?: number;
  dueDate?: Timestamp;
  saleShortId?: string;
  guestCustomer?: { nom?: string; telephone?: string; adresse?: string } | null;
}

interface InvoiceData {
  sale: Sale;
  boutique: Boutique;
  client: Client;
  ht: number;
  tvaRate: number | null;
  tvaAmount: number;
  grandTotal: number;
  devise: string;
}

/* ---------- Composant ---------- */
export default function InvoiceGenerator({ boutiqueId, saleId, type, printer = "thermal" }: InvoiceGeneratorProps) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const saleSnap = await getDoc(doc(db, "boutiques", boutiqueId, "sales", saleId));
      if (!saleSnap.exists()) {
        console.error("Sale not found");
        setReady(true);
        return;
      }
      const saleRaw = saleSnap.data() as any;

      const sale: Sale = {
        ...saleRaw,
        timestamp: saleRaw.timestamp ?? Timestamp.now(),
        saleShortId: saleRaw.saleShortId ?? saleSnap.id,
        guestCustomer: saleRaw.guestCustomer ?? null,
      };

      const bSnap = await getDoc(doc(db, "boutiques", boutiqueId));
      const boutique: Boutique = bSnap.exists() ? (bSnap.data() as Boutique) : {};
      const devise = typeof boutique.devise === "string" ? boutique.devise : "XOF";

      let client: Client = {};
      if (sale.customerId) {
        const cSnap = await getDoc(doc(db, "boutiques", boutiqueId, "customers", sale.customerId));
        client = cSnap.exists() ? (cSnap.data() as Client) : {};
      } else if (sale.guestCustomer) {
        client = {
          nom: sale.guestCustomer.nom || "",
          adresse: sale.guestCustomer.adresse || "",
          telephone: sale.guestCustomer.telephone || "",
        };
      }

      // enrich items with product info (if available)
      const prodIds = sale.items.map((it) => it.productId);
      const prodMap: Record<string, any> = {};
      if (prodIds.length > 0) {
        const productSnaps = await Promise.all(prodIds.map((id) => getDoc(doc(db, "boutiques", boutiqueId, "products", id))));
        productSnaps.forEach((ps) => {
          if (ps.exists()) {
            const d = ps.data() as any;
            prodMap[ps.id] = { nom: d.nom, description: d.description, emplacement: d.emplacement };
          }
        });
      }

      sale.items = sale.items.map((it: SaleItem) => ({
        ...it,
        nom: prodMap[it.productId]?.nom || it.nom || it.productId,
        description: prodMap[it.productId]?.description || it.description || "",
        emplacement: prodMap[it.productId]?.emplacement || it.emplacement || "",
      }));

      const grandTotal = sale.items.reduce((s, it) => s + (it.total ?? 0), 0);
      const tvaRate: number | null = boutique.tva ?? null;
      const tvaAmount = tvaRate != null ? (grandTotal * tvaRate) / (100 + tvaRate) : 0;
      const ht = grandTotal - tvaAmount;

      setData({ sale, boutique, client, ht, tvaRate, tvaAmount, grandTotal, devise });
      setReady(true);
    };

    fetchData().catch((e) => {
      console.error("Erreur fetch invoice data:", e);
      setReady(true);
    });
  }, [boutiqueId, saleId]);

  if (!ready) {
    return (
      <Box sx={{ py: 4, textAlign: "center" }}>
        <Typography>Chargement du document…</Typography>
      </Box>
    );
  }
  if (!data) {
    return (
      <Box sx={{ py: 4, textAlign: "center" }}>
        <Typography>Données non trouvées.</Typography>
      </Box>
    );
  }

  const docDate = data.sale.timestamp.toDate();
  const dd = String(docDate.getDate()).padStart(2, "0");
  const mm = String(docDate.getMonth() + 1).padStart(2, "0");
  const yy = String(docDate.getFullYear()).slice(-2);
  const rand2 = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  const formattedInvoiceNumber = `FAC-${dd}${mm}${yy}-${rand2}`;
  const primaryInvoiceId = data.sale.saleShortId || saleId;
  const fileNamePrefix = type === "b2b" ? `facture_${primaryInvoiceId}` : `ticket_${primaryInvoiceId}`;

  let badgeBg = COLORS.unpaidBg;
  let badgeLabel = "Paiement sur compte";
  if (data.sale.paymentStatus === "payé") {
    badgeBg = COLORS.paidBg;
    badgeLabel = "Payé";
  } else if (data.sale.paymentStatus === "partiellement payé") {
    badgeBg = COLORS.partialBg;
    badgeLabel = "Partiellement payé";
  }

  // pagination: safe nb items per page for thermal 80mm
  const ITEMS_PER_PAGE = 10;
  const pagesCount = Math.max(1, Math.ceil(data.sale.items.length / ITEMS_PER_PAGE));

  const renderPage = (pageIndex: number) => {
    const start = pageIndex * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = data.sale.items.slice(start, end);

    return (
      <Page key={`page-${pageIndex}`} size={[THERMAL_80MM_WIDTH, THERMAL_PAGE_HEIGHT]} style={styles.page}>
        {/* header */}
        <View style={styles.header}>
          {data.boutique.logoUrl && <Image style={styles.logo} src={data.boutique.logoUrl} />}
          <PdfText style={styles.shopName}>{data.boutique.nom || "Ma Boutique"}</PdfText>
          {data.boutique.adresse && <PdfText style={styles.shopMeta}>{data.boutique.adresse}</PdfText>}
          {data.boutique.telephone && <PdfText style={styles.shopMeta}>Tél : {data.boutique.telephone}</PdfText>}
        </View>

        {/* meta row */}
        <View style={styles.metaRow}>
          <PdfText style={styles.metaLeft}>N°: {primaryInvoiceId}</PdfText>
          <PdfText style={styles.metaRight}>{docDate.toLocaleString("fr-FR")}</PdfText>
        </View>

        {/* client */}
        <View style={styles.clientBlock}>
          <PdfText style={{ fontSize: 8, fontWeight: "bold" }}>{pageIndex === 0 ? "FACTURÉ À" : "—"}</PdfText>
          {data.client.nom ? <PdfText style={styles.clientLine}>{data.client.nom}</PdfText> : null}
          {data.client.telephone ? <PdfText style={styles.clientLine}>Tél: {data.client.telephone}</PdfText> : null}
          {data.client.adresse ? <PdfText style={styles.clientLine}>{data.client.adresse}</PdfText> : null}
        </View>

        {/* items header */}
        <View style={styles.itemsHeader}>
          <PdfText style={styles.itemsHeaderLeft}>Article</PdfText>
          <PdfText style={styles.itemsHeaderQty}>Qté</PdfText>
          <PdfText style={styles.itemsHeaderTotal}>Total</PdfText>
        </View>

        {/* items */}
        {pageItems.map((it, idx) => (
          <View key={`${it.productId}-${idx}`} style={styles.itemRow}>
            <View style={styles.itemLeft}>
              <PdfText>{it.nom || it.productId}</PdfText>
              {it.description ? <PdfText style={styles.itemDesc} wrap>{it.description}</PdfText> : null}
              {it.emplacement ? <PdfText style={styles.itemDesc}>Empl.: {it.emplacement}</PdfText> : null}
            </View>
            <PdfText style={styles.itemQty}>{String(it.quantite)}</PdfText>
            <PdfText style={styles.itemTotal}>{(it.total ?? 0).toFixed(2)} {data.devise}</PdfText>
          </View>
        ))}

        {/* totals (only on last page) */}
        {pageIndex === pagesCount - 1 && (
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <PdfText style={styles.totalsLabel}>Montant HT</PdfText>
              <PdfText style={styles.totalsValue}>{data.ht.toFixed(2)} {data.devise}</PdfText>
            </View>
            {data.tvaRate != null && (
              <View style={styles.totalsRow}>
                <PdfText style={styles.totalsLabel}>TVA ({data.tvaRate}%)</PdfText>
                <PdfText style={styles.totalsValue}>{data.tvaAmount.toFixed(2)} {data.devise}</PdfText>
              </View>
            )}
            <View style={[styles.totalsRow, { marginTop: 3 }]}>
              <PdfText style={styles.totalsLabel}>Total TTC</PdfText>
              <PdfText style={styles.totalsValue}>{data.grandTotal.toFixed(2)} {data.devise}</PdfText>
            </View>

            {data.sale.paymentStatus === "partiellement payé" && (
              <>
                <View style={styles.totalsRow}>
                  <PdfText style={styles.totalsLabel}>Montant payé</PdfText>
                  <PdfText style={styles.totalsValue}>{(data.sale.paidAmount ?? 0).toFixed(2)} {data.devise}</PdfText>
                </View>
                <View style={styles.totalsRow}>
                  <PdfText style={styles.totalsLabel}>Reste</PdfText>
                  <PdfText style={styles.totalsValue}>{(data.sale.remainingAmount ?? 0).toFixed(2)} {data.devise}</PdfText>
                </View>
              </>
            )}

            <View style={[styles.badge, { backgroundColor: badgeBg }]}>
              <PdfText style={styles.badgeText}>{badgeLabel}</PdfText>
            </View>
          </View>
        )}

        {/* footer (in flow) */}
        <View style={styles.footer}>
          {data.boutique.receiptFooterMessage ? <PdfText>{data.boutique.receiptFooterMessage}</PdfText> : null}
          <PdfText> Note: les marchandises vendues ne sont ni reprises ni échangées </PdfText>
          {data.boutique.siteWeb ? <PdfText>{data.boutique.siteWeb}</PdfText> : null}
        </View>
      </Page>
    );
  };

  const pages = Array.from({ length: pagesCount }, (_, i) => renderPage(i));
  const pdfDoc = <Document>{pages}</Document>;

  return (
    <Box>
      <Button variant="outlined" onClick={() => setShowPreview((v) => !v)} sx={{ mb: 2 }}>
        {showPreview ? "Masquer l’aperçu" : "Afficher l’aperçu"}
      </Button>

      {showPreview && (
        <PDFViewer width={THERMAL_80MM_WIDTH + 18} height={600} style={{ border: "1px solid #ccc", marginBottom: 12 }}>
          {pdfDoc}
        </PDFViewer>
      )}

      <PDFDownloadLink document={pdfDoc} fileName={`${fileNamePrefix}_${formattedInvoiceNumber}.pdf`}>
        {({ loading, error }) => {
          if (error) {
            console.error("Error generating PDF:", error);
            return <Button variant="contained" color="error">Erreur PDF</Button>;
          }
          return <Button variant="contained" disabled={loading}>{loading ? "Génération…" : "📥 Télécharger PDF"}</Button>;
        }}
      </PDFDownloadLink>
    </Box>
  );
}
