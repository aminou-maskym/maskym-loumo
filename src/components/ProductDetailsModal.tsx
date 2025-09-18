// src/components/ProductDetailsModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  IconButton,
  Stack,
  Box,
  useTheme,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  InfoOutlined,
  BusinessOutlined,
  QrCodeScannerOutlined,
  CategoryOutlined,
  StorefrontOutlined,
  CalendarMonthOutlined,
  AttachMoneyOutlined,
  Inventory2Outlined,
  WarningAmberOutlined,
  PlaceOutlined,
  SquareFootOutlined,
} from "@mui/icons-material";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  GetDocOptions,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";

// --- Helpers pour formatage ---
const formatDate = (d: Date | Timestamp | null): string => {
  if (!d) return "—";
  const date = d instanceof Timestamp ? d.toDate() : d;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const formatCurrency = (
  value: number | null | undefined,
  currency: string
): string => {
  if (value == null) return "—";
  const displayCurr = currency === "XOF" ? "FCFA" : currency;
  try {
    return value.toLocaleString("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${value.toFixed(2)} ${displayCurr}`;
  }
};
const formatNumber = (value: number | null | undefined): string =>
  value == null ? "—" : value.toLocaleString("fr-FR");
const displayValue = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : v;

// --- Types ---
interface ProductDetails {
  nom: string;
  description?: string | null;
  marque?: string | null;
  numeroSerie?: string | null;
  categoryId: string;
  supplierId: string;
  createdAt: Date | Timestamp | null;
  cout: number;
  prix: number;
  stock: number;
  stockMin: number;
  emplacement?: string | null;
  unite?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  product: ProductDetails | null;
}

export default function ProductDetailsModal({
  open,
  onClose,
  product,
}: Props) {
  const theme = useTheme();
  const [user] = useAuthState(auth);

  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [boutiqueCurrency, setBoutiqueCurrency] = useState<string>("XOF");
  const [categoryName, setCategoryName] = useState<string>("—");
  const [supplierName, setSupplierName] = useState<string>("—");

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Récupérer boutiqueId à partir du cache (puis serveur)
  useEffect(() => {
    if (!user) return;
    const fetchBoutiqueId = async () => {
      const cacheOpts: GetDocOptions = { source: "cache" };
      const q = query(
        collection(db, "boutiques"),
        where("utilisateursIds", "array-contains", user.uid)
      );
      let snap = await getDocs(q, cacheOpts);
      if (snap.empty) snap = await getDocs(q);
      if (!snap.empty) {
        setBoutiqueId(snap.docs[0].id);
      }
    };
    fetchBoutiqueId();
  }, [user]);

  // 2) Dès qu’on a l’ID de la boutique et le produit, charger tous les détails
  useEffect(() => {
    if (!open || !product || !boutiqueId) {
      // reset on close or missing data
      setBoutiqueCurrency("XOF");
      setCategoryName("—");
      setSupplierName("—");
      setError(null);
      setIsLoading(false);
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      const cacheOpts: GetDocOptions = { source: "cache" };

      try {
        // 2.1) Devise de la boutique
        const bRef = doc(db, "boutiques", boutiqueId);
        let bSnap = await getDoc(bRef, cacheOpts);
        if (!bSnap.exists()) bSnap = await getDoc(bRef);
        setBoutiqueCurrency(bSnap.data()?.devise || "XOF");

        // 2.2) Nom de la catégorie
        if (product.categoryId) {
          const cRef = doc(
            db,
            "boutiques",
            boutiqueId,
            "categories",
            product.categoryId
          );
          let cSnap = await getDoc(cRef, cacheOpts);
          if (!cSnap.exists()) cSnap = await getDoc(cRef);
          setCategoryName(cSnap.data()?.nom || `ID: ${product.categoryId}`);
        }

        // 2.3) Nom du fournisseur
        if (product.supplierId) {
          const sRef = doc(
            db,
            "boutiques",
            boutiqueId,
            "suppliers",
            product.supplierId
          );
          let sSnap = await getDoc(sRef, cacheOpts);
          if (!sSnap.exists()) sSnap = await getDoc(sRef);
          setSupplierName(sSnap.data()?.nom || `ID: ${product.supplierId}`);
        }
      } catch (e: unknown) {
        console.error(e);
        setError(e.message || "Erreur de chargement");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [open, product, boutiqueId]);

  if (!product) return null;

  const details = [
    { label: "Description", icon: InfoOutlined, value: displayValue(product.description) },
    { label: "Marque", icon: BusinessOutlined, value: displayValue(product.marque) },
    { label: "N° de série", icon: QrCodeScannerOutlined, value: displayValue(product.numeroSerie) },
    {
      label: "Catégorie",
      icon: CategoryOutlined,
      value: isLoading ? <CircularProgress size={14} /> : categoryName,
    },
    {
      label: "Fournisseur",
      icon: StorefrontOutlined,
      value: isLoading ? <CircularProgress size={14} /> : supplierName,
    },
    { label: "Date création", icon: CalendarMonthOutlined, value: formatDate(product.createdAt) },
    {
      label: "Coût",
      icon: AttachMoneyOutlined,
      value: formatCurrency(product.cout, boutiqueCurrency),
    },
    {
      label: "Prix",
      icon: AttachMoneyOutlined,
      value: formatCurrency(product.prix, boutiqueCurrency),
    },
    { label: "Stock", icon: Inventory2Outlined, value: formatNumber(product.stock) },
    { label: "Stock min", icon: WarningAmberOutlined, value: formatNumber(product.stockMin) },
    {
      label: "Emplacement",
      icon: PlaceOutlined,
      value: displayValue(product.emplacement),
    },
    { label: "Unité", icon: SquareFootOutlined, value: displayValue(product.unite) },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: { borderRadius: 4, boxShadow: theme.shadows[6] },
      }}
    >
      <DialogTitle
        sx={{
          position: "relative",
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
          disabled={isLoading}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3, bgcolor: "background.default" }}>
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          {product.nom}
        </Typography>
        {error && (
          <Typography color="error" mb={2}>
            {error}
          </Typography>
        )}
        <Stack spacing={2}>
          {details.map(({ label, icon: Icon, value }) => (
            <Box key={label}>
              <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                <Icon fontSize="small" color="primary" />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  {label}
                </Typography>
              </Stack>
              <Typography
                variant="body1"
                sx={{ pl: 4, wordBreak: "break-word", minHeight: 20 }}
              >
                {value}
              </Typography>
            </Box>
          ))}
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}
      >
        <Button onClick={onClose} disabled={isLoading}>
          Fermer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
