"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  addDoc,
  Timestamp,
  doc,
  writeBatch,
  limit,
  getDoc,
  increment as firebaseIncrement,
} from "firebase/firestore";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Autocomplete,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Collapse,
  Card,
  Alert,
  Snackbar,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

interface Produit {
  id: string;
  nom: string;
  cout?: number; // <-- prise en compte du champ "cout"
  [k: string]: any;
}

interface Supplier {
  id: string;
  nom: string;
  adresse?: string;
  telephone?: string;
  solde?: number;
  [k: string]: any;
}

interface LigneAchat {
  uid: string;
  productId: string;
  productName: string;
  quantite: number; // stocké en number, mais l'input peut être vide si 0
  coutUnitaire: number; // stocké en number, input vide si 0
}

export default function AchatForm() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("FCFA");
  const [produits, setProduits] = useState<Produit[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [lignes, setLignes] = useState<LigneAchat[]>([]);
  const [status, setStatus] = useState<"non_payé" | "partiellement_payé" | "payé">("non_payé");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [montantPaye, setMontantPaye] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snack, setSnack] = useState<{open:boolean; message:string; severity?: "success"|"error"|"info"}>({open:false,message:"",severity:"success"});

  useEffect(() => {
    if (!user) return;
    const bq = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );
    const unsub = onSnapshot(bq, (snap) => {
      if (!snap.empty) {
        const bdoc = snap.docs[0];
        const data = bdoc.data() as any;
        setBoutiqueId(bdoc.id);
        setDevise(data.devise || "FCFA");
      }
      setLoading(false);
    }, (err) => {
      console.error("Erreur onSnapshot boutique:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!boutiqueId) return;
    (async () => {
      try {
        const pSnap = await getDocs(
          query(collection(db, "boutiques", boutiqueId, "products"))
        );
        // récupérer aussi le champ cout si présent
        setProduits(pSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Produit)));
        const sSnap = await getDocs(
          query(collection(db, "boutiques", boutiqueId, "suppliers"))
        );
        setSuppliers(sSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Supplier)));
      } catch (e) {
        console.warn("Erreur chargement produits/fournisseurs:", e);
      }
    })();
  }, [boutiqueId]);

  const total = useMemo(
    () => lignes.reduce((sum, l) => sum + l.quantite * l.coutUnitaire, 0),
    [lignes]
  );
  const totalPaye = useMemo(() => {
    if (status === "payé") return total;
    if (status === "non_payé") return 0;
    return montantPaye;
  }, [status, total, montantPaye]);
  const resteAPayer = useMemo(() => total - totalPaye, [total, totalPaye]);

  // ajout d'une ligne : quantite et coutUnitaire initialisés à 0 pour permettre l'effacement
  const ajouterLigne = () =>
    setLignes((prev) => [
      ...prev,
      { uid: Date.now().toString(), productId: "", productName: "", quantite: 0, coutUnitaire: 0 },
    ]);

  const mettreAJourLigne = (uid: string, field: keyof LigneAchat, val: any) =>
    setLignes((prev) => prev.map((l) => (l.uid === uid ? { ...l, [field]: val } : l)));

  const supprimerLigne = (uid: string) => setLignes((prev) => prev.filter((l) => l.uid !== uid));

  // Handler submit : enregistre le bon + écrit la transaction en caisse (si paiement) et crédite le fournisseur
  const handleSubmit = async () => {
    if (!boutiqueId || !user) return;
    if (!lignes.length) {
      setSnack({open:true,message:"Ajoutez au moins un produit.", severity:"info"});
      return;
    }
    if (!selectedSupplier) {
      setSnack({open:true,message:"Sélectionnez un fournisseur.", severity:"info"});
      return;
    }
    // Validation basique : quantités > 0
    for (const ln of lignes) {
      if (!ln.productId && !ln.productName) {
        setSnack({open:true,message:"Chaque ligne doit avoir un produit.", severity:"info"});
        return;
      }
      if (ln.quantite <= 0) {
        setSnack({open:true,message:"Quantité doit être supérieure à 0 pour chaque produit.", severity:"info"});
        return;
      }
      if (ln.coutUnitaire < 0) {
        setSnack({open:true,message:"Coût unitaire invalide.", severity:"info"});
        return;
      }
    }
    // début soumission
    setIsSubmitting(true);

    try {
      // Préparer payload du purchase order
      const supplierData = suppliers.find((s) => s.id === selectedSupplier);
      const commande: any = {
        userId: user.uid,
        createdAt: Timestamp.now(),
        status, // "non_payé" | "partiellement_payé" | "payé"
        supplierId: selectedSupplier,
        supplierName: supplierData?.nom || "",
        supplierAdresse: supplierData?.adresse || "",
        supplierTelephone: supplierData?.telephone || "",
        items: lignes.map((l) => ({
          productId: l.productId,
          nom: l.productName,
          quantite: l.quantite,
          coutUnitaire: l.coutUnitaire,
          total: l.quantite * l.coutUnitaire,
        })),
        total,
        totalPaye,
        resteAPayer,
      };

      // On va utiliser un batch pour écrire purchaseOrder + mise à jour caisse + transaction + crédit fournisseur
      const batch = writeBatch(db);
      const poRef = doc(collection(db, "boutiques", boutiqueId, "purchaseOrders"));
      batch.set(poRef, commande);

      // Si paiement > 0, tenter de trouver la caisse principale et faire les écritures
      if (totalPaye > 0) {
        // récupérer la caisse principale (premier doc dans collection "caisse")
        const caisseSnap = await getDocs(query(collection(db, "boutiques", boutiqueId, "caisse"), limit(1)));
        if (!caisseSnap.empty) {
          const caisseDoc = caisseSnap.docs[0];
          const caisseRef = doc(db, "boutiques", boutiqueId, "caisse", caisseDoc.id);
          const currentSolde = (caisseDoc.data() as any).solde ?? 0;
          const newSolde = currentSolde - totalPaye;

          batch.update(caisseRef, { solde: newSolde });

          // transaction dans la caisse
          const txRef = doc(collection(db, "boutiques", boutiqueId, "caisse", caisseDoc.id, "transactions"));
          batch.set(txRef, {
            referenceId: poRef.id,
            type: "achat marchandise",
            montant: -Math.abs(totalPaye),
            ancienSolde: currentSolde,
            nouveauSolde: newSolde,
            utilisateurId: user.uid,
            timestamp: Timestamp.now(),
            details: {
              purchaseOrderId: poRef.id,
              supplierId: selectedSupplier,
            }
          });
        } else {
          console.warn("Aucune caisse principale trouvée : impossible d'enregistrer la transaction de paiement dans la caisse.");
        }

        // créditer le fournisseur : incrémente champ 'solde' (créé si absent)
        const supplierRef = doc(db, "boutiques", boutiqueId, "suppliers", selectedSupplier);
        batch.update(supplierRef, { solde: firebaseIncrement(totalPaye) });
      }

      // Commit batch
      await batch.commit();

      // reset UI
      setLignes([]);
      setStatus("non_payé");
      setSelectedSupplier("");
      setMontantPaye(0);
      setSnack({open:true,message:"Bon de commande enregistré.", severity:"success"});
    } catch (err) {
      console.error("Erreur enregistrement bon de commande:", err);
      setSnack({open:true,message:"Erreur lors de l'enregistrement. Voir console.", severity:"error"});
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingAuth || loading) return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: "bold", color: "#1976d2" }}>
        Créer un Bon de Commande
      </Typography>

      {/* Section Produits */}
      <Paper elevation={4} sx={{ p: 3, borderRadius: 2, mb: 4 }}>
        <Typography variant="h6" gutterBottom>Produits</Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Produit</TableCell>
                <TableCell>Quantité</TableCell>
                <TableCell>Coût Unitaire</TableCell>
                <TableCell>Total</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lignes.map((l) => (
                <TableRow key={l.uid}>
                  <TableCell>
                    <Autocomplete
                      options={produits}
                      getOptionLabel={(opt) => opt.nom || ""}
                      value={produits.find(p => p.nom === l.productName) || null}
                      onChange={(_e, v) => {
                        // si l'utilisateur choisit une option existante
                        if (v) {
                          mettreAJourLigne(l.uid, "productName", v.nom);
                          mettreAJourLigne(l.uid, "productId", v.id);
                          // si le produit a un champ `cout`, on le place dans coutUnitaire (modifiable ensuite)
                          if (typeof v.cout === "number") {
                            mettreAJourLigne(l.uid, "coutUnitaire", v.cout);
                          }
                        } else {
                          // déselectionne -> conserve le nom libre
                          mettreAJourLigne(l.uid, "productName", "");
                          mettreAJourLigne(l.uid, "productId", "");
                        }
                      }}
                      onInputChange={(_e, inputValue, reason) => {
                        // support free text entry (freeSolo-like behaviour) via input change
                        if (reason === "input") {
                          mettreAJourLigne(l.uid, "productName", inputValue);
                          const prod = produits.find(p => p.nom === inputValue);
                          mettreAJourLigne(l.uid, "productId", prod?.id || "");
                          if (prod && typeof prod.cout === "number") {
                            mettreAJourLigne(l.uid, "coutUnitaire", prod.cout);
                          }
                        }
                      }}
                      renderInput={(params) => <TextField {...params} label="Produit" />}
                      sx={{ minWidth: 200 }}
                      freeSolo
                    />
                    {/* Afficher le coût du produit récupéré (si présent) */}
                    {l.productId && (
                      <Typography variant="caption" color="text.secondary">
                        {`(Produit ID: ${l.productId})`}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="text"
                      value={l.quantite === 0 ? "" : String(l.quantite)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") mettreAJourLigne(l.uid, "quantite", 0);
                        else {
                          const n = Number(v);
                          if (!Number.isNaN(n)) mettreAJourLigne(l.uid, "quantite", n);
                        }
                      }}
                      InputProps={{ inputProps: { min: 0 } }}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="text"
                      value={l.coutUnitaire === 0 ? "" : String(l.coutUnitaire)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") mettreAJourLigne(l.uid, "coutUnitaire", 0);
                        else {
                          const n = Number(v);
                          if (!Number.isNaN(n)) mettreAJourLigne(l.uid, "coutUnitaire", n);
                        }
                      }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">{devise}</InputAdornment>,
                      }}
                      sx={{ width: 140 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography>{(l.quantite * l.coutUnitaire).toLocaleString('fr-FR')} {devise}</Typography>
                  </TableCell>
                  <TableCell>
                    <IconButton onClick={() => supprimerLigne(l.uid)} color="error">
                      <DeleteOutlineIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Button
          variant="outlined"
          color="primary"
          onClick={ajouterLigne}
          sx={{ mt: 2, borderRadius: 2 }}
        >
          Ajouter un Produit
        </Button>
      </Paper>

      {/* Section Fournisseur */}
      <Paper elevation={4} sx={{ p: 3, borderRadius: 2, mb: 4 }}>
        <Typography variant="h6" gutterBottom>Fournisseur</Typography>
        <Autocomplete
          options={suppliers}
          getOptionLabel={(option) => option.nom}
          renderOption={(props, option) => (
            <li {...props}>
              <Box>
                <Typography>{option.nom}</Typography>
                <Typography variant="body2" color="textSecondary">
                  {option.adresse || "—"}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {option.telephone || "—"}
                </Typography>
              </Box>
            </li>
          )}
          value={suppliers.find((s) => s.id === selectedSupplier) || null}
          onChange={(e, v) => setSelectedSupplier(v?.id || "")}
          renderInput={(params) => <TextField {...params} label="Sélectionner un Fournisseur" />}
          sx={{ maxWidth: 400 }}
        />
      </Paper>

      {/* Section Paiement */}
      <Paper elevation={4} sx={{ p: 3, borderRadius: 2, mb: 4 }}>
        <Typography variant="h6" gutterBottom>Statut de Paiement</Typography>
        <ToggleButtonGroup
          value={status}
          exclusive
          onChange={(e, v) => v && setStatus(v as "non_payé" | "partiellement_payé" | "payé")}
          color="primary"
          sx={{ mb: 2 }}
        >
          <ToggleButton value="non_payé">Non Payé</ToggleButton>
          <ToggleButton value="partiellement_payé">Partiellement Payé</ToggleButton>
          <ToggleButton value="payé">Payé</ToggleButton>
        </ToggleButtonGroup>

        <Collapse in={status === "partiellement_payé"}>
          <TextField
            label="Montant Payé"
            type="text"
            fullWidth
            value={montantPaye === 0 ? "" : String(montantPaye)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") setMontantPaye(0);
              else {
                const n = Number(v);
                if (!Number.isNaN(n)) setMontantPaye(n);
              }
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start">{devise}</InputAdornment>,
            }}
            sx={{ maxWidth: 300 }}
          />
        </Collapse>
      </Paper>

      {/* Résumé */}
      <Card sx={{ p: 3, borderRadius: 2, boxShadow: 4 }}>
        <Typography variant="h6" gutterBottom>Résumé</Typography>
        <Typography variant="body1">
          Coût Total : <strong>{total.toLocaleString('fr-FR')} {devise}</strong>
        </Typography>
        <Typography variant="body1">
          Total Payé : <strong>{totalPaye.toLocaleString('fr-FR')} {devise}</strong>
        </Typography>
        <Typography variant="body1">
          Reste à Payer : <strong>{resteAPayer.toLocaleString('fr-FR')} {devise}</strong>
        </Typography>
      </Card>

      {/* Bouton Soumettre */}
      <Box sx={{ mt: 4 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            !lignes.length ||
            !selectedSupplier ||
            (status === "partiellement_payé" && montantPaye <= 0)
          }
          sx={{ py: 1.5, px: 4, borderRadius: 2, fontSize: "1.05rem" }}
        >
          {isSubmitting ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CircularProgress size={18} color="inherit" /> Enregistrement...
            </span>
          ) : (
            "Enregistrer le Bon de Commande"
          )}
        </Button>
      </Box>

      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack(s => ({...s, open:false}))}>
        <Alert onClose={() => setSnack(s => ({...s, open:false}))} severity={snack.severity || "info"} sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
