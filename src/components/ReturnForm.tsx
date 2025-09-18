"use client";
import * as React from "react";
import { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import {
  Box,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Typography,
  styled,
  Autocomplete,
} from "@mui/material";
import {
  LocalizationProvider,
  DesktopDatePicker,
} from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { fr } from "date-fns/locale";

const Container = styled(Box)(({ theme }) => ({
  maxWidth: 800,
  margin: '40px auto',
  padding: theme.spacing(4),
  background: theme.palette.background.default,
}));

const WizardPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  borderRadius: theme.shape.borderRadius * 4,
  boxShadow: theme.shadows[16],
}));

const steps = [
  'Motif & État',
  'Date & Action',
  'Sélection Vente',
  'Confirmation'
];

const initialMotif = 'produit défectueux';
const initialEtat = 'bon';
const initialAction = 'remboursement';
const initialSaleId: string | null = null;

export default function ModernReturnForm() {
  const [activeStep, setActiveStep] = useState(0);
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [salesIds, setSalesIds] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [motif, setMotif] = useState(initialMotif);
  const [etat, setEtat] = useState(initialEtat);
  const [dateRetour, setDateRetour] = useState<Date | null>(new Date());
  const [action, setAction] = useState(initialAction);
  const [saleId, setSaleId] = useState<string | null>(initialSaleId);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (loadingAuth) return;
    if (!user) {
      setError("Utilisateur non authentifié.");
      setLoadingData(false);
      setBoutiqueId(null);
      setSalesIds([]);
      return;
    }

    setLoadingData(true);
    let salesUnsub: (() => void) | undefined;

    const bQuery = query(
      collection(db, 'boutiques'),
      where('utilisateursIds', 'array-contains', user.uid)
    );

    const boutiqueUnsub = onSnapshot(
      bQuery,
      (shopSnap) => {
        if (salesUnsub) {
          salesUnsub();
          salesUnsub = undefined;
        }

        if (!shopSnap.empty) {
          const currentBoutiqueId = shopSnap.docs[0].id;
          setBoutiqueId(currentBoutiqueId);
          setError(null);

          salesUnsub = onSnapshot(
            collection(db, 'boutiques', currentBoutiqueId, 'sales'),
            (salesSnap) => {
              setSalesIds(salesSnap.docs.map(d => d.id));
              setLoadingData(false);
              setError(null);
            },
            (salesErr) => {
              console.error("Error fetching sales:", salesErr);
              setError(`Erreur de chargement des ventes: ${salesErr.message}`);
              setSalesIds([]);
              setLoadingData(false);
            }
          );
        } else {
          setError('Aucune boutique disponible pour cet utilisateur.');
          setBoutiqueId(null);
          setSalesIds([]);
          setLoadingData(false);
        }
      },
      (shopErr) => {
        console.error("Error fetching boutique:", shopErr);
        setError(`Erreur de chargement de la boutique: ${shopErr.message}`);
        setBoutiqueId(null);
        setSalesIds([]);
        setLoadingData(false);
      }
    );

    return () => {
      boutiqueUnsub();
      if (salesUnsub) {
        salesUnsub();
      }
    };
  }, [user, loadingAuth]);

  const handleNext = () => {
    if (activeStep === 2 && !saleId) {
      return;
    }
    setActiveStep(prev => prev + 1);
  }
  const handleBack = () => setActiveStep(prev => prev - 1);

  const resetFormFields = () => {
    setMotif(initialMotif);
    setEtat(initialEtat);
    setDateRetour(new Date());
    setAction(initialAction);
    setSaleId(initialSaleId);
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  const handleSubmit = async () => {
    if (!saleId) {
      setSubmitError("Veuillez sélectionner un ID de vente.");
      return;
    }
    if (!boutiqueId) {
      setSubmitError("ID de la boutique non trouvé. Impossible de soumettre.");
      return;
    }
    if (!dateRetour) {
      setSubmitError("Veuillez sélectionner une date de retour.");
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'boutiques', boutiqueId, 'returns'), {
        motif,
        etat,
        dateRetour: dateRetour.toISOString(), // MODIFIED: Store as ISO string
        action,
        saleId,
        createdAt: Timestamp.now(), // createdAt remains a Firestore Timestamp
        userId: user?.uid,
        boutiqueId: boutiqueId,
      });
      await updateDoc(
        doc(db, 'boutiques', boutiqueId, 'sales', saleId),
        { saleStatus: 'retourné', paymentStatus: 'retourné' }
      );
      setSubmitSuccess(true);
      handleNext();
    } catch (err: unknown) {
      console.error("Error submitting return:", err);
      setSubmitError(`Erreur lors de la soumission: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewReturn = () => {
    resetFormFields();
    setActiveStep(0);
  };

  if (loadingAuth) {
    return <Box textAlign="center" mt={8}><CircularProgress /></Box>;
  }
  if (loadingData && user) {
     return <Box textAlign="center" mt={8}><CircularProgress /></Box>;
  }

  if (!user || (error && !boutiqueId && salesIds.length === 0)) {
    return <Container><Alert severity="error">{error || "Impossible de charger les données du formulaire."}</Alert></Container>;
  }

  return (
    <Container>
      <WizardPaper>
        <Typography variant="h4" gutterBottom fontWeight={700} align="center">
          Formulaire de Retour
        </Typography>
        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
          {steps.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {!loadingData && !boutiqueId && activeStep < steps.length -1 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
                {error || "Aucune boutique n'est associée à votre compte. Impossible de continuer."}
            </Alert>
        )}

        {activeStep === 0 && (
          <Box>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="motif-label">Motif</InputLabel>
                  <Select labelId="motif-label" value={motif} label="Motif" onChange={e => setMotif(e.target.value)}>
                    <MenuItem value="produit défectueux">Produit défectueux</MenuItem>
                    <MenuItem value="non satisfait">Non satisfait</MenuItem>
                    <MenuItem value="erreur de commande">Erreur de commande</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="etat-label">État</InputLabel>
                  <Select labelId="etat-label" value={etat} label="État" onChange={e => setEtat(e.target.value)}>
                    <MenuItem value="bon">Bon</MenuItem>
                    <MenuItem value="neuf">Neuf</MenuItem>
                    <MenuItem value="endommagé">Endommagé</MenuItem>
                    <MenuItem value="inutilisable">Inutilisable</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        )}

        {activeStep === 1 && (
          <Box>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
              <DesktopDatePicker
                label="Date de retour"
                value={dateRetour}
                onChange={d => setDateRetour(d)}
                format="dd/MM/yyyy"
                slots={{
                  textField: (params) => (
                    <TextField
                      fullWidth
                      {...params}
                      helperText={params.inputProps?.placeholder || "JJ/MM/AAAA"}
                    />
                  ),
                }}
                enableAccessibleFieldDOMStructure={false}
              />
            </LocalizationProvider>
            <Box mt={3}>
              <FormControl fullWidth>
                <InputLabel id="action-label">Action</InputLabel>
                <Select labelId="action-label" value={action} label="Action" onChange={e => setAction(e.target.value)}>
                  <MenuItem value="remboursement">Remboursement</MenuItem>
                  <MenuItem value="remplacement">Remplacement</MenuItem>
                  <MenuItem value="credit">Crédit</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        )}

        {activeStep === 2 && (
          <Box>
            {error && salesIds.length === 0 && boutiqueId && (
                 <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>
            )}
            <Autocomplete
              options={salesIds}
              getOptionLabel={(option) => option}
              value={saleId}
              onChange={(event, newValue) => {
                setSaleId(newValue);
              }}
              isOptionEqualToValue={(option, value) => option === value}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="ID de Vente (Rechercher ou sélectionner)"
                  variant="outlined"
                  fullWidth
                />
              )}
              noOptionsText="Aucun ID de vente trouvé"
              disabled={salesIds.length === 0 || !boutiqueId}
            />
            {salesIds.length === 0 && !loadingData && boutiqueId && !error && (
                <Typography variant="caption" color="textSecondary" sx={{mt:1, display: 'block'}}>
                    Aucun ID de vente disponible pour cette boutique.
                </Typography>
            )}
          </Box>
        )}

        {activeStep === 3 && (
          <Box textAlign="center">
            {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}
            {submitSuccess
              ? <Alert severity="success">Retour enregistré avec succès !</Alert>
              : <Typography>Vérifiez les informations puis validez.</Typography>
            }
          </Box>
        )}

        <Box mt={4} display="flex" justifyContent={activeStep === steps.length -1 && submitSuccess ? "center" : "space-between"}>
          {!(activeStep === steps.length - 1 && submitSuccess) && (
            <Button
              disabled={activeStep === 0}
              onClick={handleBack}
              variant="text"
            >
              Précédent
            </Button>
          )}

          {activeStep < steps.length - 1 ? (
            <Button
              onClick={handleNext}
              variant="contained"
              disabled={
                !boutiqueId ||
                (activeStep === 2 && !saleId)
              }
            >
              Suivant
            </Button>
          ) : submitSuccess ? (
            <Button onClick={handleNewReturn} variant="contained">
              Effectuer un autre retour
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={submitting || !boutiqueId || !saleId}
            >
              {submitting ? <CircularProgress size={24} color="inherit" /> : 'Valider le retour'}
            </Button>
          )}
        </Box>
      </WizardPaper>
    </Container>
  );
}