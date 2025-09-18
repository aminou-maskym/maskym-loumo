// src/components/StockAlert.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  keyframes,
  Card,
  CardContent,
  Stack,
  TextField,
  IconButton,
  Divider,
  CircularProgress,
  useTheme,
  InputAdornment,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import NotesIcon from "@mui/icons-material/Notes";
import PersonIcon from "@mui/icons-material/Person";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase"; // Assurez-vous que db est initialisé avec la persistance
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  serverTimestamp,
  FirestoreError,
  DocumentData, // Import pour typer shop.data()
} from "firebase/firestore";

interface Product {
  id: string;
  nom: string;
  stock: number;
  stockMin: number;
  description?: string;
  prix?: number;
}

interface StockAlertProps {
  produits: Product[];
}

// Définir un type plus précis pour les données de la boutique si possible
interface BoutiqueData extends DocumentData {
  devise?: string;
  // ... autres champs de la boutique
}


const blink = keyframes`
  0%   { opacity: 1; }
  50%  { opacity: 0.3; }
  100% { opacity: 1; }
`;

export default function StockAlert({ produits }: StockAlertProps) {
  const theme = useTheme();
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [, setDevise] = useState<string>("");
  const [criticals, setCriticals] = useState<Product[]>([]);
  const [openMain, setOpenMain] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState<number>(0);
  const [note, setNote] = useState<string>("");

  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  const [snackError, setSnackError] = useState<boolean>(false);

  // Récupère boutiqueId & devise UNIQUEMENT depuis le cache
  const fetchBoutiqueDataFromCache = useCallback(async () => {
    if (!user) return;

    const q = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );

    try {
      // Lire UNIQUEMENT depuis le cache
      const querySnapshot = await getDocs(q, { source: "cache" });

      if (!querySnapshot.empty) {
        const boutiqueDoc = querySnapshot.docs[0];
        const id = boutiqueDoc.id;
        setBoutiqueId(id);

        // Essayer de récupérer les détails de la boutique (devise) depuis le cache
        const boutiqueDocRef = doc(db, "boutiques", id);
        const shopSnap = await getDoc(boutiqueDocRef, { source: "cache" });

        if (shopSnap.exists()) { // .exists() est vrai même si les données proviennent du cache
          const shopData = shopSnap.data() as BoutiqueData; // Utilisation du type BoutiqueData
          if (shopData.devise) {
            setDevise(shopData.devise);
          } else {
            console.warn(`La devise n'a pas été trouvée dans le cache pour la boutique ID: ${id}.`);
            // La devise restera vide, ce qui est géré par votre UI.
          }
        } else {
          console.warn(`Les détails de la boutique (ID: ${id}) n'ont pas été trouvés dans le cache.`);
          // La devise restera vide.
        }
      } else {
        console.warn(`Aucune boutique associée à l'utilisateur ${user.uid} n'a été trouvée dans le cache. Le composant attendra que les données soient mises en cache.`);
        // boutiqueId restera null, le CircularProgress continuera.
      }
    } catch (error) {
      // Gérer les erreurs spécifiques à la lecture du cache si nécessaire
      // Par exemple, si le cache est corrompu ou indisponible (rare)
      console.error("Erreur lors de la tentative de lecture des données de la boutique depuis le cache:", error);
      // boutiqueId restera null.
    }
  }, [user]);

  useEffect(() => {
    if (user) { // Exécuter seulement si user est chargé
        fetchBoutiqueDataFromCache();
    }
  }, [fetchBoutiqueDataFromCache, user]); // Ajouter user aux dépendances

  // Filtre produits en rupture
  useEffect(() => {
    setCriticals(
      produits.filter((p) => p.stockMin !== undefined && p.stock <= p.stockMin)
    );
  }, [produits]);

  const handleOpenAddStock = (product: Product) => {
    setSelectedProduct(product);
    setQty(0);
    setNote("");
    setDialogOpen(true);
  };

  const handleSubmitAddStock = async () => {
    if (!selectedProduct || !user || !boutiqueId) return;
    try {
      // 1) Log d'ajout stock sous boutiques/{boutiqueId}/updateStock
      await addDoc(
        collection(db, "boutiques", boutiqueId, "updateStock"),
        {
          date: serverTimestamp(),
          qty,
          note,
          productId: selectedProduct.id,
          userId: user.uid,
        }
      );
      // 2) Mise à jour du stock produit
      const newStock = selectedProduct.stock + qty;
      await updateDoc(
        doc(db, "boutiques", boutiqueId, "products", selectedProduct.id),
        { stock: newStock }
      );
      // Feedback
      setSnackMsg("Stock mis à jour avec succès");
      setSnackError(false);
      setDialogOpen(false);
      setOpenMain(false); // Optionnel: fermer aussi la liste des critiques
      // Vous devrez rafraîchir la prop `produits` pour voir le changement immédiatement
      // ou implémenter un listener sur les produits.
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof FirestoreError ? err.message : "Erreur inattendue";
      setSnackMsg(`Erreur d'enregistrement : ${message}`);
      setSnackError(true);
    }
  };

  // Afficher le loader si l'authentification est en cours OU si boutiqueId n'a pas encore été récupéré du cache
  if (loadingAuth || boutiqueId === null) {
    return (
      <Box textAlign="center" py={2}>
        <CircularProgress size={24} />
        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
          Chargement des données de la boutique depuis le cache...
        </Typography>
      </Box>
    );
  }

  // Si aucune boutique n'a été trouvée (après que loadingAuth soit false et que la tentative de lecture cache soit faite)
  // et que boutiqueId est toujours null, cela signifie que les données ne sont pas dans le cache.
  // Le CircularProgress ci-dessus gère déjà ce cas.
  // Cependant, si vous voulez un message spécifique après un certain temps, vous pourriez ajouter un timeout.
  // Pour l'instant, on s'en tient à "patienter" avec le spinner.

  if (criticals.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      {/* Snackbar */}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg(null)}
        message={snackMsg}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        ContentProps={{
          sx: { backgroundColor: snackError ? theme.palette.error.main : theme.palette.success.main },
        }}
      />

      {/* Alerte stock */}
      <Alert
        severity="warning"
        onClick={() => setOpenMain(true)}
        sx={{
          cursor: "pointer",
          animation: `${blink} 1s infinite`,
        }}
      >
        {`Attention : ${criticals.length} produit${criticals.length > 1 ? "s sont" : " est"} en rupture de stock ! Cliquez pour voir.`}
      </Alert>

      {/* Liste produits critiques */}
      <Dialog open={openMain} onClose={() => setOpenMain(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ bgcolor: theme.palette.primary.main, color: "#fff" }}>
          <AddCircleOutlineIcon sx={{ verticalAlign: "middle", mr: 1 }} />
          Produits en rupture de stock
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: 400, p: 0 }}>
          <Stack spacing={2} sx={{ p: 2 }}>
            {criticals.map((p) => (
              <Card key={p.id} variant="outlined" sx={{ boxShadow: 3 }}>
                <CardContent sx={{ display: "flex", alignItems: "center" }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6">{p.nom}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Stock : {p.stock} / Min : {p.stockMin}
                    </Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                  <IconButton color="primary" onClick={() => handleOpenAddStock(p)}>
                    <AddCircleOutlineIcon />
                  </IconButton>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenMain(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Modal mise à jour stock */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: "#fafafa",
            boxShadow: theme.shadows[8],
          }
        }}
      >
        <DialogTitle>
          <Inventory2Icon sx={{ mr: 1, color: theme.palette.primary.main }} />
          <Typography component="span" fontWeight="bold">
            {selectedProduct?.nom}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Quantité à ajouter"
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Inventory2Icon color="primary" />
                  </InputAdornment>
                )
              }}
            />
            <TextField
              label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <NotesIcon color="primary" />
                  </InputAdornment>
                )
              }}
            />
            <TextField
              label="Utilisateur"
              value={user?.displayName || user?.email || user?.uid || "Utilisateur inconnu"}
              fullWidth
              disabled
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonIcon />
                  </InputAdornment>
                )
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleSubmitAddStock}
            disabled={qty <= 0}
            sx={{ boxShadow: theme.shadows[4] }}
          >
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}