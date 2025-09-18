"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  CircularProgress,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Grid,
  Avatar,
  Chip,
  IconButton,
  Snackbar,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import PhoneIcon from "@mui/icons-material/Phone";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import DoneIcon from "@mui/icons-material/Done";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface SaleItem {
  productId: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

interface Sale {
  customerId: string;
  grandTotal: number;
  items: SaleItem[];
  saleStatus?: string;
  paymentStatus?: "payé" | "partiellement payé" | "non payé" | "à crédit";
  paidAmount?: number;
  remainingAmount?: number;
  userId?: string;
}

interface Customer {
  nom: string;
  telephone: string;
}

interface Product {
  nom: string;
}

interface ItemWithName {
  productName: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

interface SalesDetailsProps {
  boutiqueId: string;
  saleId: string;
  onClose: () => void;
}

export default function SalesDetails({ boutiqueId, saleId, onClose }: SalesDetailsProps) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sellerName, setSellerName] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [itemsWithName, setItemsWithName] = useState<ItemWithName[]>([]);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const saleRef = doc(db, "boutiques", boutiqueId, "sales", saleId);
        const saleSnap = await getDoc(saleRef);
        if (!saleSnap.exists()) throw new Error("Vente non trouvée");
        const data = saleSnap.data();
        const saleData: Sale = {
          customerId: data.customerId,
          grandTotal: data.grandTotal ?? 0,
          items: data.items ?? [],
          saleStatus: data.saleStatus,
          paymentStatus: data.paymentStatus,
          paidAmount: data.paidAmount,
          remainingAmount: data.remainingAmount,
          userId: data.userId,
        };
        setSale(saleData);

        const custRef = doc(db, "boutiques", boutiqueId, "customers", data.customerId);
        const custSnap = await getDoc(custRef);
        if (custSnap.exists()) setCustomer(custSnap.data() as Customer);

        const shopRef = doc(db, "boutiques", boutiqueId);
        const shopSnap = await getDoc(shopRef);
        if (shopSnap.exists()) {
          const shop = shopSnap.data();
          if (shop.devise) setCurrency(shop.devise);
        }

        const named = await Promise.all(
          saleData.items.map(async (it) => {
            const prodRef = doc(db, "boutiques", boutiqueId, "products", it.productId);
            const prodSnap = await getDoc(prodRef);
            const prod = prodSnap.exists() ? (prodSnap.data() as Product) : null;
            return {
              productName: prod?.nom || it.productId,
              quantite: it.quantite,
              prixUnitaire: it.prixUnitaire,
              total: it.total,
            };
          })
        );
        setItemsWithName(named);

        if (saleData.userId) {
          const userRef = doc(db, "users", saleData.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setSellerName(userData.fullName || saleData.userId);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [boutiqueId, saleId]);


  const handleMarkCompleted = async () => {
    const ref = doc(db, "boutiques", boutiqueId, "sales", saleId);
    await updateDoc(ref, { saleStatus: "effectué" });
    onClose();
  };

  const copySaleId = () => {
    navigator.clipboard.writeText(saleId);
    setSnackbarOpen(true);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (!sale) {
    return (
      <Typography align="center" variant="h6" color="textSecondary" sx={{ fontFamily: "Poppins, sans-serif" }}>
        Aucune donnée pour cette vente.
      </Typography>
    );
  }

  return (
    <Card elevation={6} sx={{ maxWidth: 640, mx: "auto", borderRadius: 3, p: 2, fontFamily: "Poppins, sans-serif" }}>
      <CardHeader
        avatar={<ShoppingCartIcon fontSize="large" color="primary" />}
        title={<Typography variant="h5" sx={{ fontWeight: 700, fontFamily: "Poppins, sans-serif" }}>Détails de la vente</Typography>}
        subheader={
          <Typography
            variant="body2"
            sx={{
              color: sale.saleStatus === "retourné" ? "error.main" : "success.main",
              textTransform: "uppercase",
              fontWeight: 500,
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {sale.saleStatus || "En cours"}
          </Typography>
        }
      />
      <Divider sx={{ my: 1 }} />
      <CardContent>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Box display="flex" alignItems="center">
              <Avatar sx={{ bgcolor: "primary.light", mr: 1 }}><PersonIcon /></Avatar>
              <Box>
                <Typography variant="subtitle2" sx={{ letterSpacing: 0.5, fontFamily: "Poppins, sans-serif" }}>Client</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, fontFamily: "Poppins, sans-serif" }}>
                  {customer ? customer.nom : sale.customerId}
                </Typography>
                {customer && (
                  <Box display="flex" alignItems="center" mt={0.5}>
                    <PhoneIcon fontSize="small" sx={{ mr: 0.5 }} />
                    <Typography variant="body2" sx={{ fontFamily: "Poppins, sans-serif" }}>{customer.telephone}</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box display="flex" alignItems="center">
              <Avatar sx={{ bgcolor: "secondary.light", mr: 1 }}><AttachMoneyIcon /></Avatar>
              <Box>
                <Typography variant="subtitle2" sx={{ letterSpacing: 0.5, fontFamily: "Poppins, sans-serif" }}>Montant total</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, fontFamily: "Poppins, sans-serif" }}>
                  {sale.grandTotal.toLocaleString("fr-FR")} {currency}
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box display="flex" alignItems="center">
              <Avatar sx={{ bgcolor: "info.light", mr: 1 }}><AttachMoneyIcon /></Avatar>
              <Box>
                <Typography variant="subtitle2" sx={{ letterSpacing: 0.5, fontFamily: "Poppins, sans-serif" }}>Statut de paiement</Typography>
                <Chip
                  label={sale.paymentStatus || "—"}
                  color={
                    sale.paymentStatus === "payé"
                      ? "success"
                      : sale.paymentStatus === "partiellement payé"
                      ? "warning"
                      : sale.paymentStatus === "non payé"
                      ? "error"
                      : "default"
                  }
                  sx={{ fontFamily: "Poppins, sans-serif", textTransform: "capitalize" }}
                />
                {sale.paymentStatus === "partiellement payé" && (
                  <Box mt={1}>
                    <Typography variant="body2" sx={{ fontFamily: "Poppins, sans-serif" }}>
                      Montant payé : <strong>{sale.paidAmount?.toLocaleString("fr-FR")} {currency}</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "Poppins, sans-serif" }}>
                      Montant restant : <strong>{sale.remainingAmount?.toLocaleString("fr-FR")} {currency}</strong>
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ letterSpacing: 0.5, mb: 1, fontFamily: "Poppins, sans-serif" }}>Articles</Typography>
            <List disablePadding>
              {itemsWithName.map((it, idx) => (
                <ListItem key={idx} sx={{ py: 1, px: 0, boxShadow: 2, mb: 1, borderRadius: 2 }}>
                  <Inventory2Icon sx={{ mr: 1, color: "text.secondary" }} />
                  <ListItemText
                    primary={<Typography variant="body1" sx={{ fontWeight: 500, fontFamily: "Poppins, sans-serif" }}>{it.productName}</Typography>}
                    secondary={
                      <Typography variant="body2" sx={{ color: "text.secondary", fontFamily: "Poppins, sans-serif" }}>
                        Qté : {it.quantite} × {it.prixUnitaire.toLocaleString("fr-FR")} = {it.total.toLocaleString("fr-FR")} {currency}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Grid>
          {sale.saleStatus === "en cours" && (
            <Grid item xs={12}>
              <Box textAlign="right">
                <Button
                  variant="contained"
                  startIcon={<DoneIcon />}
                  onClick={handleMarkCompleted}
                  sx={{ borderRadius: 2, textTransform: "none", px: 4, py: 1.5, boxShadow: 3, fontFamily: "Poppins, sans-serif" }}
                >
                  Marquer comme effectué
                </Button>
              </Box>
            </Grid>
          )}
          {sellerName && (
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" sx={{ fontStyle: "italic", fontFamily: "Poppins, sans-serif" }}>
                Vente effectuée par : <strong>{sellerName}</strong>
              </Typography>
            </Grid>
          )}
          <Grid item xs={12}>
            <Box display="flex" alignItems="center" justifyContent="flex-end" mt={2}>
              <Typography variant="body2" sx={{ mr: 1, fontFamily: "Poppins, sans-serif" }}>
                ID de la vente : {saleId}
              </Typography>
              <IconButton onClick={copySaleId} size="small">
                <ContentCopyIcon />
              </IconButton>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message="ID de la vente copié dans le presse-papiers"
      />
    </Card>
  );
}