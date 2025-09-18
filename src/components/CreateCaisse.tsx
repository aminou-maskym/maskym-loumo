// src/components/CreateCaisse.tsx
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import { useAuthState } from "react-firebase-hooks/auth";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  FirestoreError,
} from "firebase/firestore";

const auth = getAuth();
const db = getFirestore();

interface Boutique {
  id: string;
  nom: string;
}

export default function CreateCaisse() {
  const [user, loadingAuth, authError] = useAuthState(auth);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [loadingBoutiques, setLoadingBoutiques] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedBoutique, setSelectedBoutique] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  // Fetch boutiques where current user is proprietor
  useEffect(() => {
    if (!user) return;
    setLoadingBoutiques(true);
    const q = query(
      collection(db, "boutiques"),
      where("proprietaireId", "==", user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          nom: (d.data() as unknown).nom,
        }));
        setBoutiques(list);
        if (list.length > 0 && !selectedBoutique) {
          setSelectedBoutique(list[0].id);
        }
        setLoadingBoutiques(false);
      },
      (err) => {
        setFetchError(err.message);
        setLoadingBoutiques(false);
      }
    );
    return () => unsub();
  }, [selectedBoutique, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(false);
    if (!selectedBoutique) {
      setCreateError("Veuillez sélectionner une boutique.");
      return;
    }
    setCreating(true);
    try {
      await addDoc(
        collection(db, "boutiques", selectedBoutique, "caisse"),
        {
          solde: 0,
          status: "fermé",
          createdAt: new Date(),
        }
      );
      setCreateSuccess(true);
    } catch (err: unknown) {
      const fbErr = err as FirestoreError;
      setCreateError(fbErr.message || "Erreur lors de la création de la caisse.");
    } finally {
      setCreating(false);
    }
  };

  if (loadingAuth || loadingBoutiques) {
    return <CircularProgress />;
  }
  if (authError) {
    return <Alert severity="error">Erreur d&apos;authentification : {authError.message}</Alert>;
  }
  if (fetchError) {
    return <Alert severity="error">{fetchError}</Alert>;
  }
  if (boutiques.length === 0) {
    return <Alert severity="info">Vous n&apos;êtes propriétaire d&apos;aucune boutique.</Alert>;
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ display: "grid", gap: 2, p: 2, maxWidth: 400 }}
    >
      <Typography variant="h6">Créer une caisse</Typography>

      <FormControl fullWidth>
        <InputLabel id="boutique-select-label">Boutique</InputLabel>
        <Select
          labelId="boutique-select-label"
          value={selectedBoutique}
          label="Boutique"
          onChange={(e) => setSelectedBoutique(e.target.value)}
        >
          {boutiques.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.nom}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {createError && <Alert severity="error">{createError}</Alert>}
      {createSuccess && <Alert severity="success">Caisse créée avec succès !</Alert>}

      <Button
        type="submit"
        variant="contained"
        disabled={creating}
      >
        {creating ? "Création…" : "Créer la caisse"}
      </Button>
    </Box>
  );
}
