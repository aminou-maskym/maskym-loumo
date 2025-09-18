"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import {
  Box,
  Paper,
  Typography,
  Grid,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import StockAlert from "./StockAlert"; // Assurez-vous que ce composant existe et fonctionne

interface Product {
  id: string;
  nom: string;
  cout?: number;
  stock?: number;
  stockMin?: number;
  dateExpiration?: string | object | null;
}

const parseDateExpiration = (dateStringInput?: string | object | null): Date | null => {
  // console.log("[parseDateExpiration] Input:", dateStringInput, "Type:", typeof dateStringInput);

  if (typeof dateStringInput !== 'string' || !dateStringInput.trim()) {
    if (dateStringInput !== undefined && dateStringInput !== null && typeof dateStringInput !== 'string') {
      // console.warn(
      //   `[parseDateExpiration] Reçu une valeur non-chaîne ou une chaîne vide:`,
      //   dateStringInput,
      //   `Type: ${typeof dateStringInput}`
      // );
    }
    return null;
  }
  const dateString = dateStringInput as string;

  const monthTranslations: { [key: string]: string } = {
    "janvier": "January", "février": "February", "mars": "March", "avril": "April",
    "mai": "May", "juin": "June", "juillet": "July", "août": "August",
    "septembre": "September", "octobre": "October", "novembre": "November", "décembre": "December",
  };

  try {
    let standardizedDateString = dateString.replace(" à ", " ");
    let monthFound = false;
    for (const frMonth in monthTranslations) {
      if (standardizedDateString.toLowerCase().includes(frMonth)) {
        const regex = new RegExp(frMonth, 'i');
        standardizedDateString = standardizedDateString.replace(regex, monthTranslations[frMonth]);
        monthFound = true;
        break;
      }
    }

    if (!monthFound) {
        // console.warn(`[parseDateExpiration] Mois français non trouvé dans: '${standardizedDateString}' (original: '${dateString}'). Tentative de parsing direct.`);
    }
    
    const dateObj = new Date(standardizedDateString);
    
    if (isNaN(dateObj.getTime())) {
        //  console.warn(`[parseDateExpiration] Échec de l'analyse (isNaN) pour: '${standardizedDateString}' (original: '${dateString}')`);
         return null;
    }
    // console.log(`[parseDateExpiration] Original: '${dateString}', Standardized: '${standardizedDateString}', Parsed Date Object:`, dateObj, "ISO:", dateObj.toISOString());
    return dateObj;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // console.error("[parseDateExpiration] Erreur critique lors de l'analyse:", dateString, error);
    return null;
  }
};

export default function ProductStats() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingData, setLoadingData] = useState(true); // Renommé pour clarté, gère le chargement des données de la boutique/produits
  const [dataNotAvailable, setDataNotAvailable] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Cleanup function pour éviter les mises à jour d'état sur un composant démonté
    return () => {
      setIsMounted(false);
    };
  }, []);

  const fetchStatsFromCache = useCallback(async () => {
    if (!user || !isMounted) { // Attendre que le user soit là ET que le composant soit monté
        if (isMounted) setLoadingData(false); // Si monté mais pas d'user, arrêter le chargement des données
        return;
    }

    console.log("[fetchStatsFromCache] Début de la récupération...");
    setLoadingData(true);
    setDataNotAvailable(false);
    let currentBoutiqueId: string | null = null;

    try {
      const boutiquesQuery = query(
        collection(db, "boutiques"),
        where("utilisateursIds", "array-contains", user.uid)
      );
      const boutiqueSnapshot = await getDocs(boutiquesQuery, { source: "cache" });

      if (boutiqueSnapshot.empty) {
        console.warn("[fetchStatsFromCache] Aucune boutique trouvée dans le cache pour l'utilisateur:", user.uid);
        throw new Error("Aucune boutique trouvée dans le cache.");
      }
      
      currentBoutiqueId = boutiqueSnapshot.docs[0].id;
      if (!isMounted) return; // Vérifier après chaque await si le composant est toujours monté
      setBoutiqueId(currentBoutiqueId);
      console.log("[fetchStatsFromCache] Boutique ID:", currentBoutiqueId);
      
      const boutiqueDocRef = doc(db, "boutiques", currentBoutiqueId);
      const boutiqueDocSnap = await getDoc(boutiqueDocRef, { source: "cache" });

      if (!boutiqueDocSnap.exists()) {
        console.warn("[fetchStatsFromCache] Document boutique non trouvé dans le cache pour ID:", currentBoutiqueId);
        throw new Error("Document boutique non trouvé dans le cache.");
      }
      if (!isMounted) return;
      const boutiqueData = boutiqueDocSnap.data() as { devise?: string };
      setDevise(boutiqueData?.devise || "");
      console.log("[fetchStatsFromCache] Devise:", boutiqueData?.devise || "N/A");
      
      const productsCollectionRef = collection(db, "boutiques", currentBoutiqueId, "products");
      console.log("[fetchStatsFromCache] Récupération des produits pour la boutique:", currentBoutiqueId);
      const productsSnapshot = await getDocs(productsCollectionRef, { source: "cache" });
      
      console.log("[fetchStatsFromCache] Snapshot des produits reçu, nombre de documents:", productsSnapshot.docs.length);

      if (!isMounted) return;
      const fetchedProducts = productsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Product, 'id'>),
      }));

      setProducts(fetchedProducts);
      console.log("[fetchStatsFromCache] Produits mis à jour dans l'état. Nombre:", fetchedProducts.length);

    } catch (error: unknown) {
      console.error("[fetchStatsFromCache] Erreur pendant la récupération:", error.message, error.code);
      if (isMounted) {
        setDataNotAvailable(true);
        setProducts([]); 
        setBoutiqueId(null); // Réinitialiser boutiqueId aussi en cas d'erreur
      }
    } finally {
      if (isMounted) {
        setLoadingData(false);
        console.log("[fetchStatsFromCache] Fin de la récupération. LoadingData: false");
      }
    }
  }, [user, isMounted]); // isMounted est ajouté comme dépendance

  useEffect(() => {
    console.log("[useEffect trigger fetch] User:", user ? user.uid : "null", "LoadingAuth:", loadingAuth, "isMounted:", isMounted);
    if (user && isMounted) { // Déclencher fetch uniquement si user ET isMounted
      fetchStatsFromCache();
    } else if (!loadingAuth && !user && isMounted) { // Pas d'utilisateur après chargement auth, et composant monté
      console.log("[useEffect trigger fetch] Pas d'utilisateur après chargement auth, reset des états de données.");
      setLoadingData(false); // Arrêter le chargement des données
      setProducts([]);
      setBoutiqueId(null);
      setDataNotAvailable(false); // Pas nécessairement "non disponible", juste pas de données à charger
    } else if (!isMounted) {
        console.log("[useEffect trigger fetch] Composant non monté, ne rien faire.");
    } else if (loadingAuth) {
        console.log("[useEffect trigger fetch] Authentification en cours, attente...");
        setLoadingData(true); // Maintenir le chargement des données pendant l'auth
    }
  }, [user, loadingAuth, isMounted, fetchStatsFromCache]);

  const totalCount = products.length;

  const totalValue = useMemo(() => {
    return products.reduce((sum, p) => {
      const cost = p.cout ?? 0;
      const stock = p.stock ?? 0;
      return sum + cost * stock;
    }, 0);
  }, [products]);

  const expiredProducts = useMemo(() => {
    console.log(`[expiredProducts useMemo] Exécution. isMounted: ${isMounted}, products.length: ${products.length}`);

    // Ne calculer que si le composant est monté ET qu'il y a des produits à vérifier
    if (!isMounted || products.length === 0) {
        if (products.length === 0 && isMounted) {
            // console.log("[expiredProducts useMemo] isMounted mais products est vide. Retourne [].");
        }
        return [];
    }
    
    const now = new Date();
    // console.log("[expiredProducts useMemo] Calcul réel en cours. 'now' est:", now.toISOString(), "pour", products.length, "produits.");

    const filtered = products.filter((p) => {
      // console.log(`[expiredProducts filter] Vérification produit: ${p.nom} (ID: ${p.id}), DateExpiration brute:`, p.dateExpiration);
      const expirationDate = parseDateExpiration(p.dateExpiration);
      
      if (expirationDate) {
        // console.log(`[expiredProducts filter] Produit: ${p.nom}, Date parsée: ${expirationDate.toISOString()}, Expirée (vs ${now.toISOString()}): ${expirationDate < now}`);
        return expirationDate < now;
      } else {
        // console.log(`[expiredProducts filter] Produit: ${p.nom}, Date non parsable ou absente.`);
        return false;
      }
    });
    console.log("[expiredProducts useMemo] Nombre de produits expirés trouvés:", filtered.length);
    return filtered;
  }, [products, isMounted]);


  // Logique de rendu
  if (loadingAuth) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress /><Typography sx={{ml: 2}}>Authentification...</Typography>
      </Box>
    );
  }

  if (!isMounted) { // Attendre que le client soit monté pour éviter les erreurs d'hydratation et les calculs prématurés
    return (
     <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
       <CircularProgress /><Typography sx={{ml: 2}}>Préparation de l&apos;interface...</Typography>
     </Box>
   );
 }

  if (!user) { // Après isMounted, si pas d'utilisateur
     return (
      <Box textAlign="center" py={4}><Typography variant="h6" color="text.secondary">Veuillez vous connecter pour voir les statistiques.</Typography></Box>
    );
  }

  // Si l'utilisateur est connecté mais les données de la boutique/produits sont en train de charger
  if (loadingData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress /><Typography sx={{ml: 2}}>Chargement des statistiques depuis le cache...</Typography>
      </Box>
    );
  }
  
  // Si les données ne sont pas disponibles (erreur explicite du cache ou boutique non trouvée)
  if (dataNotAvailable) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="h6" color="error">
          Les statistiques ne sont pas disponibles hors ligne pour le moment.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Veuillez vous connecter à internet pour synchroniser les données initiales.
        </Typography>
      </Box>
    );
  }
  
  // Si l'utilisateur est connecté, chargement terminé, pas d'erreur "dataNotAvailable", 
  // mais aucune boutique n'a été identifiée (boutiqueId est null)
  // Cela peut arriver si fetchStatsFromCache n'a pas pu définir boutiqueId mais n'a pas non plus levé d'erreur menant à dataNotAvailable.
  // Normalement, une boutique non trouvée devrait mettre dataNotAvailable à true.
  if (!boutiqueId) { 
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="body1" color="text.secondary">
          Aucune boutique associée à ce compte n&apos;a été trouvée dans le cache.
        </Typography>
      </Box>
    );
  }

  // À ce stade: user est là, isMounted, !loadingData, !dataNotAvailable, boutiqueId est défini.
  // On peut donc afficher les stats.

  return (
    <>
      {/* StockAlert ne devrait être rendu que si products a du contenu pertinent */}
      {products.length > 0 && <StockAlert produits={products} />}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Paper elevation={3} sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, borderRadius: 2 }}>
            <Inventory2Icon color="primary" sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Total produits</Typography>
              <Typography variant="h5" fontWeight={700}>{totalCount}</Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Paper elevation={3} sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, borderRadius: 2 }}>
            <MonetizationOnIcon color="secondary" sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Valeur totale</Typography>
              <Typography variant="h5" fontWeight={700}>
                {totalValue.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {devise}
              </Typography>
            </Box>
          </Paper>
        </Grid>
        
      </Grid>

      
    </>
  );
}