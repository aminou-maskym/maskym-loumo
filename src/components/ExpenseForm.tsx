"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase"; // Assurez-vous que la persistance est activée ici!
import {
  collection,
  query,
  where,
  onSnapshot, // Gardé pour boutique et catégories
  addDoc,
  getDocs,
  doc,
  updateDoc,
  FirestoreError,
  Timestamp,
} from "firebase/firestore";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Divider,
  Grid,
  TextField,
  Button,
  Autocomplete,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import {
  Money as MoneyIcon,
  Category as CategoryIcon,
  Payment as PaymentIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  Description as DescriptionIcon,
  Save as SaveIcon,
} from "@mui/icons-material";
import { DateTimePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

interface ExpenseCategory {
  id: string;
  nom: string;
}

export default function ExpenseForm() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Form fields
  const [montant, setMontant] = useState<number | "">("");
  const [categorie, setCategorie] = useState<ExpenseCategory | null>(null);
  const [createCat, setCreateCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [modePaiement, setModePaiement] = useState<string>("Espèces");
  const [date, setDate] = useState<Date | null>(new Date());
  const [beneficiaire, setBeneficiaire] = useState("");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Load boutique id & categories
  useEffect(() => {
    if (!user) {
      setInitLoading(false);
      return;
    }

    const q = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );

    const unsubBoutique = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const bId = snap.docs[0].id;
          setBoutiqueId(bId);
        } else {
          setInitError("Aucune boutique trouvée pour cet utilisateur.");
          setBoutiqueId(null);
          setInitLoading(false);
        }
      },
      (err) => {
        console.error("Error finding boutique:", err);
        setInitError("Erreur recherche boutique: " + err.message);
        setBoutiqueId(null);
        setInitLoading(false);
      }
    );

    return () => unsubBoutique();
  }, [user]);

  // Load categories for boutique once boutiqueId is known
  useEffect(() => {
    if (!boutiqueId) {
      setCategories([]);
      setInitLoading(false);
      return;
    }

    setInitLoading(true);
    let unsubCategories: (() => void) | undefined;

    try {
      unsubCategories = onSnapshot(
        collection(db, "boutiques", boutiqueId, "expenseCategories"),
        (catSnap) => {
          setCategories(
            catSnap.docs.map((d) => ({
              id: d.id,
              nom: (d.data() as any).nom,
            }))
          );
          setInitLoading(false);
        },
        (err) => {
          console.error("Error loading categories:", err);
          setInitError((prev) =>
            prev ? `${prev}\nErreur chargement catégories: ${err.message}` : `Erreur chargement catégories: ${err.message}`
          );
          setInitLoading(false);
        }
      );
    } catch (err) {
      console.error("Erreur initialisation catégories:", err);
      setInitError("Erreur initialisation catégories.");
      setInitLoading(false);
    }

    return () => {
      if (unsubCategories) unsubCategories();
    };
  }, [boutiqueId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    // Validation
    if (
      montant === "" ||
      (!categorie && !createCat) ||
      !date ||
      !beneficiaire
    ) {
      setSubmitError("Veuillez remplir tous les champs obligatoires (*)");
      return;
    }

    if (!boutiqueId) {
      setSubmitError("ID de la boutique non disponible. Impossible de continuer.");
      return;
    }

    setSubmitting(true);
    try {
      // create category if needed
      let catId: string;
      let catNom: string;
      if (createCat) {
        if (!newCatName.trim()) {
          setSubmitError("Le nom de la nouvelle catégorie est requis.");
          setSubmitting(false);
          return;
        }
        const refCat = await addDoc(
          collection(db, "boutiques", boutiqueId, "expenseCategories"),
          { nom: newCatName.trim() }
        );
        catId = refCat.id;
        catNom = newCatName.trim();
      } else {
        catId = categorie!.id;
        catNom = categorie!.nom;
      }

      // prepare expense document (no link to ventes)
      const expenseData = {
        montant: Number(montant),
        categorieId: catId,
        categorieNom: catNom,
        modePaiement,
        date: Timestamp.fromDate(date!),
        beneficiaire: beneficiaire.trim(),
        description: description ? description.trim() : null,
        createdBy: user!.uid,
        createdAt: Timestamp.now(),
      };

      // save expense
      const expenseRef = await addDoc(
        collection(db, "boutiques", boutiqueId, "expenses"),
        expenseData
      );

      // Update caisse: deduct the expense amount and record transaction
      // We try to find a caisse document called "Principale", otherwise take the first caisse doc
      const caisseQuery = query(collection(db, "boutiques", boutiqueId, "caisse"));
      const caisseSnap = await getDocs(caisseQuery);
      if (!caisseSnap.empty) {
        // prefer document with nom: "Principale"
        let caisseDoc = caisseSnap.docs.find((d) => (d.data() as any).nom === "Principale") ?? caisseSnap.docs[0];
        const currentSolde = (caisseDoc.data() as any).solde ?? 0;
        const montantToSubtract = Number(montant);
        const newSolde = currentSolde - montantToSubtract;

        // update caisse solde
        await updateDoc(doc(db, "boutiques", boutiqueId, "caisse", caisseDoc.id), {
          solde: newSolde,
        });

        // add transaction (including the user who performed it)
        await addDoc(
          collection(db, "boutiques", boutiqueId, "caisse", caisseDoc.id, "transactions"),
          {
            referenceId: expenseRef.id,
            type: "dépenses",
            montant: -montantToSubtract,
            ancienSolde: currentSolde,
            nouveauSolde: newSolde,
            utilisateurId: user!.uid, // <-- utilisateur qui a effectué la transaction (conserver)
            userId: user!.uid,         // <-- AJOUTÉ : champ userId contenant l'uid de l'utilisateur connecté
            timestamp: Timestamp.now(),
            details: {
              categorieId: catId,
              categorieNom: catNom,
              beneficiaire: beneficiaire.trim(),
              description: description ? description.trim() : null,
            },
          }
        );
      } else {
        console.warn("Aucune caisse trouvée pour mettre à jour le solde (dépense enregistrée sans transaction en caisse).");
      }

      // success, reset form
      setSubmitSuccess(true);
      setMontant("");
      setCategorie(null);
      setCreateCat(false);
      setNewCatName("");
      setModePaiement("Espèces");
      setDate(new Date());
      setBeneficiaire("");
      setDescription("");
    } catch (e: unknown) {
      console.error("Submit error:", e);
      setSubmitError("Erreur soumission: " + ((e as FirestoreError).message || String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  // UI states
  if (loadingAuth || initLoading) {
    return (
      <Box textAlign="center" py={6}>
        <CircularProgress />
        <Typography>Chargement initial des données...</Typography>
      </Box>
    );
  }

  if (initError && !boutiqueId) {
    return <Alert severity="error" sx={{ m: 2 }}>Erreur critique: {initError}</Alert>;
  }

  if (!user) {
    return <Alert severity="warning" sx={{ m: 2 }}>Veuillez vous connecter pour créer une dépense.</Alert>;
  }

  if (!boutiqueId && user) {
    return (
      <Box textAlign="center" py={6}>
        <Typography>{initError || "Aucune boutique n'est associée à votre compte ou elle n'a pas pu être chargée."}</Typography>
      </Box>
    );
  }

  return (
    <Card sx={{ maxWidth: 700, mx: "auto", mt: 4, boxShadow: 4, borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Nouvelle Dépense
        </Typography>
        <Divider sx={{ mb: 3 }} />
        {initError && <Alert severity="warning" sx={{ mb: 2 }}>{initError}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Montant */}
            <Grid item xs={12} sm={6}>
              <TextField
                label="Montant *"
                type="number"
                value={montant}
                onChange={(e) => setMontant(e.target.value === "" ? "" : Number(e.target.value))}
                required
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <MoneyIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            {/* Catégorie */}
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={<Checkbox checked={createCat} onChange={(e) => setCreateCat(e.target.checked)} />}
                label="Nouv. catégorie"
              />
              {createCat ? (
                <TextField
                  label="Nom nouvelle catégorie *"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  required={createCat}
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <CategoryIcon color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              ) : (
                <Autocomplete
                  options={categories}
                  getOptionLabel={(opt) => opt.nom}
                  value={categorie}
                  onChange={(_, v) => setCategorie(v)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Catégorie dépense *"
                      required={!createCat}
                      fullWidth
                    />
                  )}
                  disabled={categories.length === 0 && !createCat}
                  noOptionsText={categories.length === 0 ? "Aucune catégorie" : "Tapez pour rechercher"}
                />
              )}
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="mode-paiement-label">Mode paiement</InputLabel>
                <Select
                  labelId="mode-paiement-label"
                  value={modePaiement}
                  label="Mode paiement"
                  onChange={(e) => setModePaiement(e.target.value as string)}
                  startAdornment={
                    <InputAdornment position="start">
                      <PaymentIcon color="action" />
                    </InputAdornment>
                  }
                >
                  <MenuItem value="Espèces">Espèces</MenuItem>
                  <MenuItem value="Carte Bancaire">Carte Bancaire</MenuItem>
                  <MenuItem value="Virement">Virement</MenuItem>
                  <MenuItem value="Chèque">Chèque</MenuItem>
                  <MenuItem value="Autre">Autre</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DateTimePicker
                  label="Date et Heure *"
                  value={date}
                  onChange={(newVal) => setDate(newVal)}
                  renderInput={(params: any) => (
                    <TextField
                      {...params}
                      fullWidth
                      required
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <InputAdornment position="start">
                            <CalendarIcon color="action" />
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />
              </LocalizationProvider>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="Bénéficiaire / Fournisseur *"
                value={beneficiaire}
                onChange={(e) => setBeneficiaire(e.target.value)}
                required
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Description / Notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <DescriptionIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>

          {submitError && (
            <Alert severity="error" sx={{ mt: 3 }}>
              {submitError}
            </Alert>
          )}
          {submitSuccess && (
            <Alert severity="success" sx={{ mt: 3 }} onClose={() => setSubmitSuccess(false)}>
              Dépense enregistrée avec succès !
            </Alert>
          )}

          <Box textAlign="right" mt={3}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              disabled={submitting || initLoading || !boutiqueId}
              sx={{ boxShadow: 3 }}
            >
              {submitting ? "Enregistrement..." : "Enregistrer la Dépense"}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
