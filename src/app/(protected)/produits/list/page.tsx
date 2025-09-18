// src/app/produits/page.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  Slide,
  Stack,
  IconButton,
  CircularProgress,
  Paper,
} from "@mui/material";
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import CloseIcon from "@mui/icons-material/Close";
import { TransitionProps } from '@mui/material/transitions';

import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  GetOptions,
} from "firebase/firestore";

import ProductStats from "@/components/ProductStats";
import AddProductForm from "@/components/AddProductForm";
import ProductTable from "@/components/ProductTable";
import SaleForm from "@/components/SaleForm";
import ExpirationAlerts from "@/components/ExpirationAlerts";
import EntreeProduitsHistory from "@/components/EntreeProduitsHistory";

interface Produit {
  id: string;
  nom: string;
  description?: string;
  numeroSerie?: string;
  categoryId?: string;
  categoryName?: string;
  emplacement?: string;
  cout?: number;
  unite?: string;
  prix?: number;
  stock?: number;
  stockMin?: number;
  supplierId?: string;
  supplierName?: string;
  dateExpiration?: { seconds: number; nanoseconds: number };
  createdAt?: { seconds: number; nanoseconds: number };
  updatedAt?: { seconds: number; nanoseconds: number };
  imageUrl?: string;
}

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement<any, any> },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// Styles communs pour les cartes d'action - ajustés pour un look plus compact
const actionCardStyles = (bgColor: string, hoverBgColor: string) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  p: {xs: 1.5, sm: 2},
  textAlign: 'center',
  borderRadius: 2,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  cursor: 'pointer',
  transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out, background-color 0.2s ease-out',
  minHeight: {xs: 100, sm: 130},
  backgroundColor: bgColor,
  color: '#fff',
  '&:hover': {
    transform: 'translateY(-3px)',
    boxShadow: '0 5px 15px rgba(0,0,0,0.1)',
    backgroundColor: hoverBgColor,
  },
  '& .MuiSvgIcon-root': {
    fontSize: {xs: '2rem', sm: '2.8rem'},
    mb: 1,
    opacity: 0.9,
  },
  '& .MuiTypography-root': {
    fontWeight: 500,
    fontSize: {xs: '0.8rem', sm: '1rem'},
  }
});


export default function ProductsPage() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("");
  const [products, setProducts] = useState<Produit[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // role utilisateur (lu une seule fois)
  const [userRole, setUserRole] = useState<string | null>(null);

  const fetchBoutiqueInfo = useCallback(async () => {
    if (!user) return;
    try {
      const cacheOpts: GetOptions = { source: "cache" };
      const q = query(
        collection(db, "boutiques"),
        where("utilisateursIds", "array-contains", user.uid)
      );
      let snap = await getDocs(q, cacheOpts);
      if (snap.empty) {
        snap = await getDocs(q);
      }
      if (snap.empty) {
        setBoutiqueId("");
        setLoadingProducts(false);
        return;
      }
      const bId = snap.docs[0].id;
      setBoutiqueId(bId);

      const shopSnap = await getDoc(doc(db, "boutiques", bId));
      if (shopSnap.exists()) {
        const shopData = shopSnap.data();
        setDevise(shopData?.devise || "FCFA");
      } else {
        setDevise("FCFA");
      }
    } catch (error) {
      console.error("Erreur lors de la récupération de la boutique:", error);
      setBoutiqueId("");
      setLoadingProducts(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBoutiqueInfo();
  }, [fetchBoutiqueInfo]);

  // récupération du rôle utilisateur (une seule lecture users/{uid})
  useEffect(() => {
    if (!user) {
      setUserRole(null);
      return;
    }
    const fetchRole = async () => {
      try {
        const udoc = await getDoc(doc(db, "users", user.uid));
        if (udoc.exists()) {
          const data = udoc.data() as any;
          setUserRole((data?.role ?? null)?.toString() ?? null);
        } else {
          setUserRole(null);
        }
      } catch (err) {
        console.warn("Impossible de récupérer le rôle utilisateur:", err);
        setUserRole(null);
      }
    };
    fetchRole();
  }, [user]);

  useEffect(() => {
    if (!boutiqueId) {
      if (boutiqueId === "") setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    const productsCollectionRef = collection(db, "boutiques", boutiqueId, "products");
    const unsubscribe = onSnapshot(
      productsCollectionRef,
      (snapshot) => {
        const productList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Produit[];
        setProducts(productList);
        setLoadingProducts(false);
      },
      (error) => {
        console.error("Erreur lors de la récupération des produits: ", error);
        setLoadingProducts(false);
      }
    );
    return () => unsubscribe();
  }, [boutiqueId]);

  const [openAdd, setOpenAdd] = useState(false);
  const [openSale, setOpenSale] = useState(false);
  const [openCat, setOpenCat] = useState(false);

  if (loadingAuth || boutiqueId === null || (boutiqueId && loadingProducts)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: 'center', minHeight: "80vh" }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (boutiqueId === "") {
    return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
                Aucune boutique associée
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Veuillez contacter l'administrateur ou en créer une.
            </Typography>
        </Box>
    );
  }

  // rôles autorisés pour effectuer vente (carte visible uniquement pour eux)
  const allowedSaleRoles = ["gerant", "proprietaire", "admin"];
  const canPerformSale = allowedSaleRoles.includes((userRole ?? "").toLowerCase());

  return (
    <Box sx={{ p: {xs: 1.5, md: 2.5}, bgcolor: "grey.50", minHeight: "calc(100vh - 64px)" }}>
      {boutiqueId && products.length > 0 && <ExpirationAlerts products={products} devise={devise} />}

      {boutiqueId && <ProductStats boutiqueId={boutiqueId} devise={devise} />}

      <Typography variant="h6" fontWeight={600} sx={{ mt: 3, mb: 1.5, color: 'text.primary' }}>
        Actions Rapides
      </Typography>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{xs: 1.5, sm: 2}}
        my={2.5}
        alignItems="stretch"
      >
        <Paper
          elevation={0}
          sx={actionCardStyles('primary.main', 'primary.dark')}
          onClick={() => setOpenAdd(true)}
        >
          <AddShoppingCartIcon />
          <Typography>
            Ajouter Produit
          </Typography>
        </Paper>

        {canPerformSale && (
          <Paper
            elevation={0}
            sx={actionCardStyles('success.main', 'success.dark')}
            onClick={() => setOpenSale(true)}
          >
            <PointOfSaleIcon />
            <Typography>
              Effectuer Vente
            </Typography>
          </Paper>
        )}

        {/* Remplacé : Gérer catégories -> Historique des entrées (ouvre le dialog contenant EntreeProduitsHistory) */}
        <Paper
          elevation={0}
          sx={actionCardStyles('info.main', 'info.dark')}
          onClick={() => setOpenCat(true)}
        >
          <HistoryEduIcon />
          <Typography>
            Historique entrées
          </Typography>
        </Paper>
      </Stack>

      {/* ProductTable */}
      {boutiqueId && <ProductTable boutiqueId={boutiqueId} devise={devise} initialProducts={products} />}

      {/* NOTE: J'ai supprimé l'affichage en bas de page du composant EntreeProduitsHistory
                (tu l'as demandé : ne pas l'afficher deux fois). */}

      {/* --- Dialogs --- */}
      <Dialog PaperProps={{sx:{borderRadius:2}}} fullWidth maxWidth="md" open={openAdd} TransitionComponent={Transition} keepMounted onClose={() => setOpenAdd(false)}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'primary.main', color: 'white', py: 1.5, px: 2 }}>
          <Typography variant="h6" component="div">Ajouter un produit</Typography>
          <IconButton aria-label="close" onClick={() => setOpenAdd(false)} sx={{color: 'white', p:0.5}}><CloseIcon fontSize="small"/></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{p: {xs: 1.5, sm:2}}}>
          {boutiqueId && <AddProductForm boutiqueId={boutiqueId} devise={devise} onProductAdded={() => setOpenAdd(false)} />}
        </DialogContent>
      </Dialog>

      <Dialog PaperProps={{sx:{borderRadius:2}}} fullWidth maxWidth="lg" open={openSale} TransitionComponent={Transition} keepMounted onClose={() => setOpenSale(false)}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'success.main', color: 'white', py: 1.5, px: 2 }}>
          <Typography variant="h6" component="div">Effectuer une vente</Typography>
          <IconButton aria-label="close" onClick={() => setOpenSale(false)} sx={{color: 'white', p:0.5}}><CloseIcon fontSize="small"/></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{p: {xs: 1.5, sm:2}}}>
          {boutiqueId && <SaleForm boutiqueId={boutiqueId} devise={devise} products={products} onSaleCompleted={() => setOpenSale(false)} />}
        </DialogContent>
      </Dialog>

      {/* Dialog remplacé : ouvre l'historique des entrées */}
      <Dialog PaperProps={{sx:{borderRadius:2}}} fullWidth maxWidth="lg" open={openCat} TransitionComponent={Transition} keepMounted onClose={() => setOpenCat(false)}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'info.main', color: 'white', py: 1.5, px: 2 }}>
          <Typography variant="h6" component="div">Historique des entrées</Typography>
          <IconButton aria-label="close" onClick={() => setOpenCat(false)} sx={{color: 'white', p:0.5}}><CloseIcon fontSize="small"/></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{p: {xs: 1.5, sm:2}}}>
          {/* Le composant gère sa récupération. Si tu veux éviter une lecture supplémentaire,
              on peut le modifier pour lui passer boutiqueId en prop plus tard. */}
          <EntreeProduitsHistory />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
