"use client";

import React, { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { supabase } from "@/lib/supabaseClient";
import {
  Box,
  TextField,
  Button,
  CircularProgress,
  Typography,
  Alert,
  Paper,
  IconButton,
} from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';

// L'interface attendue (adaptée pour prendre éventuellement imageUrl/imagePath)
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
  dateExpiration?: any; // peut arriver sous forme de string (YYYY-MM-DD) ou Timestamp
  boutiqueId: string;
  imageUrl?: string | null;
  imagePath?: string | null;
}

interface EditProductFormProps {
  product: Produit;
  onDone: () => void;
}

export default function EditProductForm({ product, onDone }: EditProductFormProps) {
  const [user] = useAuthState(auth);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Champs du formulaire
  const [nom, setNom] = useState(product.nom);
  const [description, setDescription] = useState(product.description || "");
  const [numeroSerie, setNumeroSerie] = useState(product.numeroSerie || "");
  const [prix, setPrix] = useState<number>(product.prix ?? 0);
  const [unite, setUnite] = useState(product.unite || "");
  const [stockMin, setStockMin] = useState<number>(product.stockMin ?? 0);
  const [emplacement, setEmplacement] = useState(product.emplacement || "");

  // dateExpiration peut venir sous plusieurs formes -> on normalise en 'YYYY-MM-DD' pour l'input
  const deriveInitialDateString = (val: any) => {
    if (!val) return "";
    if (typeof val === "string") {
      // si déjà au format 2025-09-27
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
      // sinon tenter d'extraire
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      return "";
    }
    // Firestore Timestamp-like
    if (typeof val === "object" && (val.seconds || val._seconds)) {
      const seconds = (val.seconds ?? val._seconds) as number;
      const d = new Date(seconds * 1000);
      return d.toISOString().split("T")[0];
    }
    return "";
  };

  const [dateExpiration, setDateExpiration] = useState<string>(() => deriveInitialDateString(product.dateExpiration));

  // --- Etats pour l'image ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(product.imageUrl ?? null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  // -------------------------

  useEffect(() => {
    // cleanup preview objectURL si on a sélectionné un fichier local
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (file?: File | null) => {
    setFileError(null);
    if (!file) {
      // suppression sélection
      setSelectedFile(null);
      // si preview était blob, révoquer
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      // si il y avait une image distante (product.imageUrl), on laisse previewUrl tel quel
      setPreviewUrl(product.imageUrl ?? null);
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

    // crée preview blob
    const url = URL.createObjectURL(file);
    // révoque ancien blob si présent
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(url);
    setSelectedFile(file);
  };

  const handleDeleteExistingImage = async () => {
    if (!product.imagePath) {
      // pas de path, juste nettoyer imageUrl localement
      try {
        const prodRef = doc(db, "boutiques", product.boutiqueId, "products", product.id);
        setDeletingImage(true);
        await updateDoc(prodRef, { imageUrl: null, imagePath: null });
        setPreviewUrl(null);
      } catch (err) {
        console.error("Erreur suppression image (sans path):", err);
        setError("Impossible de supprimer l'URL d'image côté Firestore.");
      } finally {
        setDeletingImage(false);
      }
      return;
    }

    try {
      setDeletingImage(true);
      // supprime du bucket supabase
      const { error: removeError } = await supabase.storage.from("files").remove([product.imagePath]);
      if (removeError) {
        console.error("Erreur suppression supabase:", removeError);
        setError("Impossible de supprimer l'image du stockage. Vérifiez les permissions.");
        setDeletingImage(false);
        return;
      }
      // supprime les références en base
      const prodRef = doc(db, "boutiques", product.boutiqueId, "products", product.id);
      await updateDoc(prodRef, { imageUrl: null, imagePath: null });
      setPreviewUrl(null);
    } catch (err) {
      console.error("Erreur suppression image:", err);
      setError("Erreur lors de la suppression de l'image.");
    } finally {
      setDeletingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (!user || !product.boutiqueId || !product.id) {
      const errorMessage = "Erreur : Données manquantes pour la mise à jour (ID utilisateur, boutique ou produit).";
      console.error(errorMessage, { hasUser: !!user, hasBoutiqueId: !!product.boutiqueId, hasProductId: !!product.id });
      setError(errorMessage);
      setSubmitting(false);
      return;
    }

    try {
      const prodRef = doc(db, "boutiques", product.boutiqueId, "products", product.id);

      const updatedData: any = {
        nom,
        description: description || null,
        numeroSerie: numeroSerie || null,
        prix: Number(prix),
        unite: unite || null,
        stockMin: Number(stockMin),
        emplacement: emplacement || null,
        updatedAt: Timestamp.now(),
      };

      // Gérer la date d'expiration : convertir 'YYYY-MM-DD' en Timestamp à 00:00:00 locale
      if (dateExpiration) {
        // crée une date locale à minuit
        const localMidnight = new Date(dateExpiration + "T00:00:00");
        // stocker en tant que Firestore Timestamp
        updatedData.dateExpiration = Timestamp.fromDate(localMidnight);
      } else {
        updatedData.dateExpiration = null;
      }

      // Si l'utilisateur a choisi un nouveau fichier -> upload
      if (selectedFile) {
        setUploadingFile(true);
        // Si il y avait une image existante et un imagePath, on la supprime APRES upload réussi afin d'éviter perte
        const safeName = selectedFile.name.replace(/\s+/g, "_");
        const path = `products/${product.id}_${Date.now()}_${safeName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from("files").upload(path, selectedFile as File, { upsert: false });
        if (uploadError) {
          console.error("Erreur upload supabase:", uploadError);
          setError("Impossible d'uploader l'image. Le produit n'a pas été modifié.");
          setUploadingFile(false);
          setSubmitting(false);
          return;
        }
        // get public url
        const publicRes: any = supabase.storage.from("files").getPublicUrl(path);
        const publicUrl = publicRes?.data?.publicUrl ?? publicRes?.publicUrl ?? null;
        if (publicUrl) {
          // ajouter les champs image dans updatedData
          updatedData.imageUrl = publicUrl;
          updatedData.imagePath = path;

          // commit update DB
          await updateDoc(prodRef, updatedData);

          // après mise à jour base, supprimer l'ancienne image si elle existait
          if (product.imagePath) {
            const { error: removeError } = await supabase.storage.from("files").remove([product.imagePath]);
            if (removeError) console.warn("Impossible de supprimer ancienne image du bucket:", removeError);
          }
        } else {
          // dans le cas improbable où on n'a pas d'URL publique
          await updateDoc(prodRef, updatedData);
        }
        setUploadingFile(false);
      } else {
        // pas de nouveau fichier ; si previewUrl est null mais product had image -> user a peut-être supprimé via bouton
        // Pour supprimer l'image sans uploader, on gère le flag: si previewUrl === null && product.imagePath -> supprimer
        if (!previewUrl && (product.imagePath || product.imageUrl)) {
          // tenter de supprimer l'ancienne image dans le bucket si imagePath présent
          if (product.imagePath) {
            const { error: removeError } = await supabase.storage.from("files").remove([product.imagePath]);
            if (removeError) console.warn("Impossible de supprimer ancienne image du bucket:", removeError);
          }
          updatedData.imageUrl = null;
          updatedData.imagePath = null;
        }
        // simple update
        await updateDoc(prodRef, updatedData);
      }

      onDone();
    } catch (err) {
      console.error("Erreur lors de la mise à jour du produit :", err);
      setError("Une erreur est survenue lors de la sauvegarde. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
      setUploadingFile(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" component="h2">Modifier le produit</Typography>

      <Typography variant="body2" color="text.secondary"><strong>Catégorie :</strong> {product.categoryName || "Non spécifiée"}</Typography>
      <Typography variant="body2" color="text.secondary"><strong>Fournisseur :</strong> {product.supplierName || "Non spécifié"}</Typography>

      <TextField label="Nom du produit" value={nom} onChange={(e) => setNom(e.target.value)} required fullWidth autoFocus />
      <TextField label="Description" multiline rows={3} value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
      <TextField label="Numéro de série / SKU" value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} fullWidth />
      <TextField label="Prix de vente" type="number" value={prix} onChange={(e) => setPrix(Number(e.target.value))} InputProps={{ inputProps: { min: 0, step: "0.01" } }} fullWidth />
      <TextField label="Unité (ex: pièce, kg, litre)" value={unite} onChange={(e) => setUnite(e.target.value)} fullWidth />
      <TextField label="Seuil de stock minimum" type="number" value={stockMin} onChange={(e) => setStockMin(Number(e.target.value))} InputProps={{ inputProps: { min: 0 } }} fullWidth />
      <TextField label="Emplacement (ex: Allée 5, Rayon B)" value={emplacement} onChange={(e) => setEmplacement(e.target.value)} fullWidth />

      {/* Image: preview + upload + suppression */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Image du produit (optionnel)</Typography>
        {previewUrl ? (
          <Paper variant="outlined" sx={{ width: 180, height: 120, overflow: 'hidden', position: 'relative', mb: 1 }}>
            <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <IconButton size="small" onClick={async () => {
              // suppression visuelle + possible suppression backend au submit
              // Si l'image preview est la remote URL et qu'on veut la supprimer immédiatement, on peut appeler delete
              setPreviewUrl(null);
              setSelectedFile(null);
            }} sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.7)' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Paper>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Aucune image sélectionnée.</Typography>
        )}

        <Box display="flex" gap={1} alignItems="center">
          <Button variant="outlined" component="label">Choisir une image (≤1MB)
            <input hidden accept="image/*" type="file" onChange={e => handleFileChange(e.target.files ? e.target.files[0] : undefined)} />
          </Button>
          { (product.imageUrl || product.imagePath || previewUrl) && (
            <Button color="error" onClick={handleDeleteExistingImage} disabled={deletingImage}>{deletingImage ? 'Suppression...' : 'Supprimer l\'image'}</Button>
          )}
        </Box>
        {fileError && <Alert severity="error">{fileError}</Alert>}
      </Box>

      <TextField label="Date d'expiration" type="date" value={dateExpiration} onChange={(e) => setDateExpiration(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />

      {error && (<Typography color="error" variant="body2" sx={{ mt: 1 }}>{error}</Typography>)}

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}>
        <Button onClick={onDone} disabled={submitting}>Annuler</Button>
        <Button type="submit" variant="contained" disabled={submitting || uploadingFile}>
          {submitting || uploadingFile ? <CircularProgress size={24} color="inherit" /> : "Enregistrer les modifications"}
        </Button>
      </Box>
    </Box>
  );
}