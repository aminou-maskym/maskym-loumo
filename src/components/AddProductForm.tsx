"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import { supabase } from "@/lib/supabaseClient"; // <-- ajouté
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  writeBatch,
  Timestamp,
  FirestoreError,
  getDoc,
} from "firebase/firestore";
import {
  Box, Card, CardContent, Divider, Grid, TextField, Button, Autocomplete, Checkbox,
  FormControlLabel, Typography, Alert, CircularProgress, InputAdornment, Select,
  MenuItem, FormControl, InputLabel, Stack, useTheme, Paper, Chip, IconButton
} from "@mui/material";
import {
  Inventory2 as Inventory2Icon, Category as CategoryIcon, 
  AccountBalanceWallet as AccountBalanceWalletIcon, LocalShipping as LocalShippingIcon,
  AddCircleOutline as AddCircleOutlineIcon, CalendarMonth as CalendarMonthIcon,
  BrandingWatermark as BrandingWatermarkIcon, Description as DescriptionIcon,
  QrCodeScanner as QrCodeScannerIcon, LocationOn as LocationOnIcon, AttachMoney as AttachMoneyIcon,
  Scale as ScaleIcon, WarningAmber as WarningAmberIcon, Save as SaveIcon,
  SignalWifiOff as OfflineIcon, CloudDone as CloudDoneIcon, PhotoCamera as PhotoCameraIcon, Close as CloseIcon
} from "@mui/icons-material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { Dayjs } from "dayjs";
import "dayjs/locale/fr";

// Interfaces
interface Category { id: string; nom: string }
interface Supplier {
  id: string;
  nom: string;
  telephone?: string;
  adresse?: string;
  typeProduits?: string;
  entreprise?: string;
}
interface BoutiqueDocData {
  nom: string;
  devise?: string;
  utilisateursIds: string[];
}
interface Boutique extends BoutiqueDocData { id: string; }

export default function AddProductForm() {
  const theme = useTheme();
  const [user, loadingAuth, authError] = useAuthState(auth);
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isOffline, setIsOffline] = useState(false);

  // Champs du formulaire
  const [nom, setNom] = useState("");
  const [marque, setMarque] = useState("");
  const [description, setDescription] = useState("");
  const [numeroSerie, setNumeroSerie] = useState("");
  const [categorie, setCategorie] = useState<Category | null>(null);
  const [createCategory, setCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [emplacement, setEmplacement] = useState("");
  const [cout, setCout] = useState<number | "">("");
  const [unite, setUnite] = useState<string>("piece");
  const [prix, setPrix] = useState<number | "">("");
  const [stock, setStock] = useState<number | "">("");
  const [stockMin, setStockMin] = useState<number | "">("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [createSupplier, setCreateSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState<Omit<Supplier, "id">>({
    nom: "", telephone: "", adresse: "", typeProduits: "", entreprise: ""
  });
  const [dateExpiration, setDateExpiration] = useState<Dayjs | null>(null);

  // --- Nouveaux états pour l'image ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  // ------------------------------------

  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{type: 'error' | 'success' | 'info', message: string} | null>(null);

  // Détection de l'état en ligne/hors ligne
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    if (typeof window !== "undefined") {
      setIsOffline(!window.navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // Récupération des données de la boutique
  const fetchBoutiqueData = useCallback(() => {
    if (!user) {
      if (!loadingAuth) {
        setInitError("Utilisateur non authentifié.");
        setInitLoading(false);
        setBoutique(null); setCategories([]); setSuppliers([]); 
      }
      return () => {};
    }

    setInitLoading(true);
    const boutiquesRef = collection(db, "boutiques");
    const q = query(boutiquesRef, where("utilisateursIds", "array-contains", user.uid));

    let unsubCategories: (() => void) | undefined;
    let unsubSuppliers: (() => void) | undefined;

    const unsubBoutique = onSnapshot(q,
      (snap) => {
        if (unsubCategories) unsubCategories();
        if (unsubSuppliers) unsubSuppliers();
        unsubCategories = undefined; unsubSuppliers = undefined;

        if (!snap.empty) {
          const boutiqueDoc = snap.docs[0];
          const boutiqueData = boutiqueDoc.data() as BoutiqueDocData;
          const currentBoutique: Boutique = { id: boutiqueDoc.id, ...boutiqueData };
          setBoutique(currentBoutique);
          setInitError(null);

          unsubCategories = onSnapshot(
            collection(db, "boutiques", currentBoutique.id, "categories"),
            (catSnap) => setCategories(catSnap.docs.map(d => ({ id: d.id, nom: (d.data() as { nom: string }).nom }))),
            (err) => { console.error("Erreur cat:", err); setInitError("Erreur chargement catégories."); }
          );
          unsubSuppliers = onSnapshot(
            collection(db, "boutiques", currentBoutique.id, "suppliers"),
            (supSnap) => setSuppliers(supSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Supplier, 'id'>) }))),
            (err) => { console.error("Erreur sup:", err); setInitError("Erreur chargement fournisseurs."); }
          );
          setInitLoading(false);
        } else {
          setInitError(isOffline ? "Données boutique non accessibles hors ligne." : "Vous n’êtes associé à aucune boutique active.");
          setInitLoading(false);
          setBoutique(null); setCategories([]); setSuppliers([]);
        }
      },
      (err) => {
        console.error("Erreur boutique:", err);
        setInitError(`Erreur base de données: ${err.message}`);
        setInitLoading(false);
        setBoutique(null); setCategories([]); setSuppliers([]);
      }
    );
    return () => { unsubBoutique(); if (unsubCategories) unsubCategories(); if (unsubSuppliers) unsubSuppliers(); };
  }, [user, loadingAuth, isOffline]);

  useEffect(() => {
    const cleanup = fetchBoutiqueData();
    return cleanup;
  }, [fetchBoutiqueData]);

  // Réinitialisation du formulaire
  const resetForm = () => {
    setNom(""); setMarque(""); setDescription(""); setNumeroSerie("");
    setCategorie(null); setCreateCategory(false); setNewCategoryName("");
    setEmplacement(""); setCout(""); setUnite("piece"); setPrix(""); setStock(""); setStockMin("");
    setSupplier(null); setCreateSupplier(false);
    setNewSupplier({ nom: "", telephone: "", adresse: "", typeProduits: "", entreprise: "" });
    setDateExpiration(null);
    // reset image states
    setSelectedFile(null);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setFileError(null);
  }

  // Gestion changement fichier
  const handleFileChange = (file?: File | null) => {
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      return;
    }
    if (!file.type.startsWith("image/")) {
      setFileError("Veuillez sélectionner une image valide.");
      return;
    }
    const maxBytes = 1 * 1024 * 1024; // 1 MB
    if (file.size > maxBytes) {
      setFileError("Taille maximale 1 MB. Choisissez une image plus petite.");
      return;
    }
    // crée un preview
    const url = URL.createObjectURL(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(url);
    setSelectedFile(file);
  }

  useEffect(() => {
    // cleanup preview on unmount
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Soumission du formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitFeedback(null);
    setFileError(null);

    if (!boutique?.id) {
      return setSubmitFeedback({type: "error", message: "ID de la boutique introuvable. Veuillez recharger."});
    }
    if (!nom.trim() || (!categorie && (!createCategory || !newCategoryName.trim())) || prix === "" || stock === "") {
      return setSubmitFeedback({type: "error", message: "Veuillez remplir les champs obligatoires (*)."});
    }
    if (createCategory && !newCategoryName.trim()) return setSubmitFeedback({type: "error", message: "Nom de la nouvelle catégorie requis."});
    if (createSupplier && !newSupplier.nom.trim()) return setSubmitFeedback({type: "error", message: "Nom du nouveau fournisseur requis."});
    if (selectedFile && selectedFile.size > 1 * 1024 * 1024) return setFileError("Image trop grande (>1MB).");

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      let catId: string;
      let catName: string;
      let newCatNameForStateUpdate: string | null = null;

      if (createCategory) {
        const newCatRef = doc(collection(db, "boutiques", boutique.id, "categories"));
        catId = newCatRef.id;
        catName = newCategoryName.trim();
        newCatNameForStateUpdate = catName;
        batch.set(newCatRef, { nom: catName, createdAt: Timestamp.now() });
      } else {
        catId = categorie!.id;
        catName = categorie!.nom;
      }

      let supId: string | null = null;
      let supName: string | null = null;
      let newSupForStateUpdate: (Supplier & { id: string }) | null = null;

      if (createSupplier) {
        const newSupRef = doc(collection(db, "boutiques", boutique.id, "suppliers"));
        supId = newSupRef.id;
        supName = newSupplier.nom.trim();
        const supplierDataToSave = { ...newSupplier, nom: supName, createdAt: Timestamp.now() };
        batch.set(newSupRef, supplierDataToSave);
        newSupForStateUpdate = { id: supId, ...supplierDataToSave };
      } else if (supplier) {
        supId = supplier.id;
        supName = supplier.nom;
      }

      const productRef = doc(collection(db, "boutiques", boutique.id, "products"));

      // --- Upload fichier sur Supabase (si sélectionné et en ligne) ---
      let imageUrl: string | null = null;
      let imagePath: string | null = null;
      if (selectedFile) {
        if (isOffline) {
          // si hors-ligne, on n'upload pas l'image — produit sera sauvegardé sans image
          setSubmitFeedback({ type: "info", message: "Hors-ligne : l'image n'a pas été téléchargée. Le produit est enregistré sans image." });
        } else {
          setUploadingFile(true);
          try {
            // sanitize filename
            const safeName = selectedFile.name.replace(/\s+/g, "_");
            const path = `products/${productRef.id}_${Date.now()}_${safeName}`;
            // upload
            const { data: uploadData, error: uploadError } = await supabase.storage.from("files").upload(path, selectedFile as File, { upsert: false });
            if (uploadError) {
              console.error("Supabase upload error:", uploadError);
              // on ne bloque pas l'enregistrement produit, on signale
              setSubmitFeedback({ type: "info", message: "Image non téléchargée (erreur upload). Le produit sera enregistré sans image." });
            } else {
              imagePath = path;
              // obtenir l'URL publique
              // Note: getPublicUrl retourne souvent { data: { publicUrl } } ou { publicUrl } selon version
              const publicUrlResult: any = supabase.storage.from("files").getPublicUrl(path);
              const publicUrl = publicUrlResult?.data?.publicUrl ?? publicUrlResult?.publicUrl ?? null;
              imageUrl = publicUrl;
            }
          } catch (err) {
            console.error("Erreur upload supabase:", err);
            setSubmitFeedback({ type: "info", message: "Échec téléchargement image; produit enregistré sans image." });
          } finally {
            setUploadingFile(false);
          }
        }
      }
      // --------------------------------------------------------------

      // Préparer les données produit (incluant image si obtenu)
      const productData: any = {
        nom: nom.trim(),
        marque: marque.trim() || null,
        description: description.trim() || null,
        numeroSerie: numeroSerie.trim() || null,
        categoryId: catId,
        categoryName: catName, // Ajout du nom de la catégorie
        emplacement: emplacement.trim() || null,
        cout: cout !== "" ? Number(cout) : null,
        unite,
        prix: Number(prix),
        stock: Number(stock),
        stockMin: stockMin !== "" ? Number(stockMin) : null,
        supplierId: supId,
        supplierName: supName, // Ajout du nom du fournisseur
        dateExpiration: dateExpiration ? Timestamp.fromDate(dateExpiration.toDate()) : null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      if (imageUrl) {
        productData.imageUrl = imageUrl;
      }
      if (imagePath) {
        productData.imagePath = imagePath; // utile si besoin de suppression ultérieure
      }

      batch.set(productRef, productData);

      // --- NOUVEAU: Enregistrement des stats d'entrée ---
      // On lit UNE SEULE fois le document utilisateur pour récupérer fullName
      try {
        let addedByName: string | null = null;
        if (user && user.uid) {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const ud = userDoc.data() as any;
            addedByName = ud?.fullName ?? null;
          }
        }

        const todayId = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        // IMPORTANT: pour créer une sous-collection sous un document "entreeproduits/{todayId}",
        // il faut appeler `collection(..., 'entreeproduits', todayId, '<subcollectionName>')` —
        // utiliser directement collection(db, 'boutiques', bId, 'entreeproduits', todayId) est invalide
        // parce que ça termine sur un document (nombre de segments pair).
        // Ici on crée la structure: boutiques/{boutiqueId}/entreeproduits/{todayId}/entries/{autoDoc}
        // Enregistrer la stat d'entrée directement sous la collection `entreeproduits` avec
        // l'ID du document égal à l'ID du produit (productRef.id). Cela évite d'utiliser la date
        // comme ID (qui posait problème en apparaissant comme "document inexistant").
        // Chemin final : boutiques/{boutiqueId}/entreeproduits/{productId}
        const entryRef = doc(db, "boutiques", boutique.id, "entreeproduits", productRef.id);
        const entryData = {
          productId: productRef.id,
          productName: productData.nom,
          quantity: Number(stock),
          addedByUid: user?.uid ?? null,
          addedByName: addedByName,
          imageUrl: imageUrl ?? null,
          createdAt: Timestamp.now(),
        };
        batch.set(entryRef, entryData);
      } catch (err) {
        // Si la lecture de l'utilisateur échoue, on n'empêche pas l'enregistrement du produit
        console.error("Erreur lors de l'enregistrement des stats d'entrée:", err);
        // On pourrait aussi ajouter un log séparé dans une collection 'logs' si besoin
      }
      // -----------------------------------------------------

      await batch.commit();

      // Mise à jour optimiste de l'état local
      if (newCatNameForStateUpdate) {
        setCategories(prev => [...prev, {id: catId, nom: newCatNameForStateUpdate!}]);
      }
      if (newSupForStateUpdate) {
        setSuppliers(prev => [...prev, newSupForStateUpdate!]);
      }

      resetForm();
      if (isOffline) {
        setSubmitFeedback(prev => prev ?? {type: "info", message: "Produit enregistré localement ! Il sera synchronisé dès le retour de la connexion."});
      } else {
        // si uploadingFile en cours ou feedback set précédemment, combine messages
        if (uploadingFile) {
          setSubmitFeedback({type: "success", message: "Produit ajouté avec succès ! (upload image en cours)"});
        } else if (submitFeedback && submitFeedback.type === "info") {
          // conserve le message info (image non uploadée) si existant
        } else {
          setSubmitFeedback({type: "success", message: "Produit ajouté avec succès !"});
        }
      }
      setTimeout(() => setSubmitFeedback(null), 5000);

    } catch (err: unknown) {
      console.error("Erreur d'ajout produit:", err);
      let userMessage = `Erreur d'enregistrement: ${(err as FirestoreError).message || 'Erreur inconnue'}`;
      if (isOffline || (err as any)?.code && ((err as any).code.startsWith("network-error") || (err as any).code === "unavailable" || (err as any).message.toLowerCase().includes("connection failed"))) {
        userMessage = "La connexion au serveur a échoué. Le produit a été mis en file d'attente si possible. Vérifiez votre connexion.";
      }
      setSubmitFeedback({type: "error", message: userMessage});
    } finally {
      setSubmitting(false);
      setUploadingFile(false);
    }
  };

  // Gestion des états de chargement et d'erreur
  if (loadingAuth || initLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh"><CircularProgress size={60} /><Typography variant="h6" sx={{ ml: 2 }}>Chargement...</Typography></Box>;
  }
  if (authError) return <Alert severity="error" sx={{ m: 2 }}>Erreur d&apos;authentification: {authError.message}</Alert>;
  if (initError && !boutique) return <Alert severity="error" sx={{ m: 2 }}>{initError}</Alert>;
  if (!boutique) return <Alert severity="warning" sx={{ m: 2 }}>Aucune boutique configurée ou en cours de chargement.</Alert>;

  const deviseAffichage = boutique?.devise || "€";

  // Rendu du formulaire
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
      <Card sx={{ maxWidth: 900, mx: "auto", my: 4, boxShadow: theme.shadows[8], borderRadius: 2.5, p: { xs: 2, md: 4 }, bgcolor: theme.palette.background.default }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h4" fontWeight="bold" color="primary.main">
              <Inventory2Icon sx={{ mr: 1, verticalAlign: 'middle', fontSize: '2.5rem' }} />
              Nouveau Produit
            </Typography>
            {isOffline && <Chip label="MODE HORS-LIGNE" color="warning" icon={<OfflineIcon />} size="small"/>}
          </Stack>
          <Divider sx={{ my: 3 }} ><Chip label="Détails du produit" /></Divider>

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={4}>
              <Paper elevation={2} sx={{ p: {xs: 2, sm: 3}, borderRadius: 2}}>
                <Typography variant="h6" gutterBottom fontWeight={500} color="text.primary" sx={{ mb: 2.5 }}>
                  Informations Générales <Typography component="span" color="error.main">*</Typography>
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <TextField label="Nom du produit" value={nom} onChange={e => setNom(e.target.value)} required fullWidth InputProps={{ startAdornment: (<InputAdornment position="start"><Inventory2Icon color="action" /></InputAdornment>)}} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Stack spacing={1}>
                      {createCategory ? (
                        <TextField label="Nom nouvelle catégorie" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} required fullWidth InputProps={{ startAdornment: (<InputAdornment position="start"><CategoryIcon color="action" /></InputAdornment>)}} />
                      ) : (
                        <Autocomplete options={categories} getOptionLabel={opt => opt.nom} value={categorie} onChange={(_, v) => setCategorie(v)}
                          renderInput={params => (<TextField {...params} label="Catégorie" required={!createCategory} fullWidth InputProps={{...params.InputProps, startAdornment: (<InputAdornment position="start"><CategoryIcon color="action" /></InputAdornment>)}} /> )} 
                        />
                      )}
                      <FormControlLabel control={<Checkbox checked={createCategory} onChange={e => setCreateCategory(e.target.checked)} icon={<AddCircleOutlineIcon />} checkedIcon={<AddCircleOutlineIcon color="primary"/>}/>} label="Créer catégorie" />
                    </Stack>
                  </Grid>
                  <Grid item xs={12} sm={6} md={6}>
                    <TextField label="Prix de vente" type="number" value={prix} onChange={e => setPrix(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} required fullWidth inputProps={{ min: 0, step: "0.01" }} InputProps={{ startAdornment: (<InputAdornment position="start"><AttachMoneyIcon color="action" /></InputAdornment>), endAdornment: <InputAdornment position="end">{deviseAffichage}</InputAdornment>}} />
                  </Grid>
                  <Grid item xs={12} sm={6} md={6}>
                    <TextField label="Stock disponible" type="number" value={stock} onChange={e => setStock(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} required fullWidth inputProps={{ min: 0, step: "1" }} InputProps={{ startAdornment: (<InputAdornment position="start"><Inventory2Icon color="action" /></InputAdornment>)}} />
                  </Grid>
                </Grid>
              </Paper>

              <Paper elevation={1} sx={{ p: {xs: 2, sm: 3}, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom fontWeight={500} color="text.secondary" sx={{ mb: 2.5 }}>
                  Informations Complémentaires (Optionnel)
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}><TextField label="Marque" value={marque} onChange={e => setMarque(e.target.value)} fullWidth InputProps={{ startAdornment: (<InputAdornment position="start"><BrandingWatermarkIcon color="action" /></InputAdornment>)}} /></Grid>
                  <Grid item xs={12} sm={6}><TextField label="Ref. Produit" value={numeroSerie} onChange={e => setNumeroSerie(e.target.value)} fullWidth InputProps={{ startAdornment: (<InputAdornment position="start"><QrCodeScannerIcon color="action" /></InputAdornment>)}} /></Grid>
                  <Grid item xs={12}><TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={3} InputProps={{ startAdornment: (<InputAdornment position="start" sx={{alignItems: 'flex-start', mt:1.5}}><DescriptionIcon color="action" /></InputAdornment>)}} /></Grid>
                  <Grid item xs={12} sm={6} md={4}><TextField label="MG" value={emplacement} onChange={e => setEmplacement(e.target.value)} fullWidth InputProps={{ startAdornment: (<InputAdornment position="start"><LocationOnIcon color="action" /></InputAdornment>)}} /></Grid>
                  <Grid item xs={12} sm={6} md={4}><TextField label="Coût d'achat" type="number" value={cout} onChange={e => setCout(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} fullWidth inputProps={{ min: 0, step: "0.01" }} InputProps={{ startAdornment: (<InputAdornment position="start"><AccountBalanceWalletIcon color="action" /></InputAdornment>), endAdornment: <InputAdornment position="end">{deviseAffichage}</InputAdornment>}} /></Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControl fullWidth><InputLabel id="unite-label">Unité</InputLabel>
                      <Select labelId="unite-label" value={unite} label="Unité" onChange={e => setUnite(e.target.value as string)} startAdornment={<InputAdornment position="start"><ScaleIcon color="action" /></InputAdornment>}>
                        {['pièce', 'kg', 'g', 'L', 'Crt', 'm', 'cm', 'set', 'Pqt', 'Bid'].map(u => (<MenuItem key={u} value={u.toLowerCase()}>{u.charAt(0).toUpperCase() + u.slice(1)}</MenuItem>))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={6}><TextField label="Stock minimum d'alerte" type="number" value={stockMin} onChange={e => setStockMin(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} fullWidth inputProps={{ min: 0, step: "1" }} InputProps={{ startAdornment: (<InputAdornment position="start"><WarningAmberIcon color="action" /></InputAdornment>)}} /></Grid>
                  <Grid item xs={12} sm={6} md={6}><DatePicker label="Date d'expiration" value={dateExpiration} onChange={(nv) => setDateExpiration(nv)} slotProps={{ textField: { fullWidth: true, InputProps: { startAdornment: (<InputAdornment position="start"><CalendarMonthIcon color="action" /></InputAdornment>) }}}} /></Grid>

                  {/* --- Champ d'upload image optionnel --- */}
                  <Grid item xs={12} sm={6} md={6}>
                    <Typography variant="subtitle2" gutterBottom>Image du produit (optionnel)</Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Button variant="outlined" component="label" startIcon={<PhotoCameraIcon />}>
                        Choisir une image
                        <input hidden accept="image/*" type="file" onChange={e => handleFileChange(e.target.files ? e.target.files[0] : undefined)} />
                      </Button>
                      {selectedFile && (
                        <Typography variant="body2" sx={{ ml: 1 }}>{selectedFile.name}</Typography>
                      )}
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>Max 1 MB. Format image accepté.</Typography>
                    {fileError && <Alert severity="error" sx={{ mt: 1 }}>{fileError}</Alert>}
                    {previewUrl && (
                      <Box mt={1} display="flex" alignItems="center" gap={1}>
                        <Paper variant="outlined" sx={{ width: 96, height: 96, overflow: 'hidden', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img src={previewUrl} alt="aperçu" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
                        </Paper>
                        <Stack>
                          <Typography variant="body2">{(selectedFile && (selectedFile.size / 1024).toFixed(0))} KB</Typography>
                          <Box>
                            <Button size="small" onClick={() => {
                              if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
                              setSelectedFile(null);
                              setFileError(null);
                            }} startIcon={<CloseIcon />} sx={{ textTransform: 'none' }}>Supprimer</Button>
                          </Box>
                        </Stack>
                      </Box>
                    )}
                  </Grid>
                  {/* -------------------------------------- */}

                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom color="text.secondary" sx={{mt:1, mb: 1}}>Fournisseur</Typography>
                    <Stack spacing={1}>
                    {createSupplier ? (
                      <><Grid container spacing={2} >
                        {(["nom", "telephone", "adresse", "typeProduits", "entreprise"] as const).map(field => (
                          <Grid item xs={12} sm={field === "adresse" || field === "typeProduits" ? 12 : 6} md={field === "adresse" || field === "typeProduits" ? 6 : (field === "entreprise" ? 12 : 4)} key={field}>
                            <TextField label={field.charAt(0).toUpperCase() + field.slice(1).replace("typeProduits", "Type de produits")} value={(newSupplier as unknown)[field]} onChange={e => setNewSupplier(prev => ({ ...prev, [field]: e.target.value }))} required={field === "nom"} fullWidth size="small" InputProps={{ startAdornment: (<InputAdornment position="start"><LocalShippingIcon fontSize="small" color="action" /></InputAdornment>)}}/>
                          </Grid>
                        ))}
                      </Grid><Button size="small" onClick={() => setCreateSupplier(false)} sx={{alignSelf: 'flex-start'}}>Choisir existant</Button></>
                    ) : (
                       <Autocomplete options={suppliers} getOptionLabel={opt => `${opt.nom} ${opt.entreprise ? `(${opt.entreprise})` : ''}`} value={supplier} onChange={(_, v) => setSupplier(v)} renderInput={params => (<TextField {...params} label="Choisir fournisseur" fullWidth InputProps={{...params.InputProps, startAdornment: (<InputAdornment position="start"><LocalShippingIcon color="action" /></InputAdornment>)}} />)}/>
                    )}
                     <FormControlLabel control={<Checkbox checked={createSupplier} onChange={e => setCreateSupplier(e.target.checked)} icon={<AddCircleOutlineIcon />} checkedIcon={<AddCircleOutlineIcon color="primary"/>}/>} label="Ajouter nouveau fournisseur"/>
                    </Stack>
                  </Grid>
                </Grid>
              </Paper>

              {submitFeedback && <Alert severity={submitFeedback.type} sx={{borderRadius: 1.5}} icon={submitFeedback.type === 'info' ? <CloudDoneIcon/> : undefined} onClose={()=>setSubmitFeedback(null)}>{submitFeedback.message}</Alert>}

              <Box textAlign="right" sx={{ mt: 3 }}>
                <Button type="submit" variant="contained" color="primary" size="large" disabled={submitting} startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />} sx={{ fontWeight: 'bold', py: 1.5, px: 4, borderRadius: 1.5 }}>
                  {submitting ? "Enregistrement..." : "Enregistrer le Produit"}
                </Button>
              </Box>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </LocalizationProvider>
  );
}
