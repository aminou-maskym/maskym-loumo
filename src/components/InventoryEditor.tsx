// src/components/InventoryEditor.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react"; // Réintroduit React pour la clarté et par convention
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  doc,
  query,
  where,
  getDoc,
  onSnapshot,
  QuerySnapshot,
  Timestamp,
  DocumentData,
  FirestoreError,
} from "firebase/firestore";
import {
  Box,
  Typography,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Autocomplete,
  FormControlLabel,
  Checkbox,
  useTheme,
  useMediaQuery,
  Grid,
  CircularProgress,
  Alert,
} from "@mui/material";

// Interfaces
interface UserProfile {
  fullName: string;
  // autres champs potentiels du profil utilisateur
}

interface Line {
  productId: string;
  name: string;
  fournisseurId?: string;
  fournisseurNom?: string;
  categorieId?: string;
  categorieNom?: string;
  emplacement?: string;
  stockTheorique: number;
  stockPhysique: number;
  ecart: number;
  motif: string;
  controlled: boolean;
  controllerName?: string;
  controlledAt?: Timestamp | Date; // Timestamp from Firestore, Date for local optimistic updates
}

interface Supplier { id: string; nom: string }
interface Category { id: string; nom: string }

// Types pour les documents Firestore
interface SupplierDoc { nom: string }
interface CategoryDoc { nom: string }
interface ProductDoc {
  nom: string;
  supplierId?: string;
  categoryId?: string;
  emplacement?: string;
  stock: number; // En supposant que 'stock' est toujours un nombre
}
interface InventoryLineFirestoreData {
  productId: string;
  productName: string;
  fournisseurId?: string | null;
  categorieId?: string | null;
  stockTheorique: number;
  stockPhysique: number;
  ecart: number;
  motif: string;
  controlledAt: Timestamp; // Ou serverTimestamp() lors de l'écriture
  controlledBy: string;
  controllerName: string;
}

interface Props { inventoryId: string }

export default function InventoryEditor({ inventoryId }: Props) {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const [user] = useAuthState(auth);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<"encours" | "termine">("encours");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);

  const [isLoadingBoutique, setIsLoadingBoutique] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false); // Initialement false, devient true quand boutiqueId est là
  const [dataError, setDataError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [showControlledOnly, setShowControlledOnly] = useState(false);
  const [showNonControlledOnly, setShowNonControlledOnly] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [currentLine, setCurrentLine] = useState<Line | null>(null);
  const [inputPhysique, setInputPhysique] = useState(0);
  const [inputMotif, setInputMotif] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const categoriesMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c.nom])),
    [categories]
  );

  useEffect(() => {
    if (user) {
      const userDocRef = doc(db, "users", user.uid);
      const fetchUserProfile = async () => {
        try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
            console.log("InventoryEditor: User profile loaded:", docSnap.data());
          } else {
            console.warn("InventoryEditor: User profile document not found for UID:", user.uid);
            setUserProfile({ fullName: user.displayName || user.email || "Utilisateur Inconnu" });
          }
        } catch (error) {
          console.error("InventoryEditor: Error fetching user profile:", error);
          setUserProfile({ fullName: user.displayName || user.email || "Erreur chargement nom" });
        }
      };
      fetchUserProfile();
    } else {
      setUserProfile(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIsLoadingBoutique(false);
      return;
    }
    setIsLoadingBoutique(true);
    setDataError(null);

    const fetchBoutique = async () => {
      const bqQuery = query(
        collection(db, "boutiques"),
        where("utilisateursIds", "array-contains", user.uid)
      );
      let snap: QuerySnapshot<DocumentData>;
      try {
        snap = await getDocs(bqQuery, { source: "cache" });
        if (snap.empty) {
          console.log("InventoryEditor: Boutique not in cache or cache empty, fetching from server...");
          snap = await getDocs(bqQuery);
        } else {
          console.log("InventoryEditor: Boutique found in cache.");
        }

        if (!snap.empty) {
          setBoutiqueId(snap.docs[0].id);
        } else {
          setDataError("Aucune boutique trouvée pour cet utilisateur.");
          setBoutiqueId(null);
        }
      } catch (err: unknown) {
        let errorMessage = "Erreur de chargement de la boutique.";
        let errorCode: string | undefined = undefined;

        if (typeof err === 'object' && err !== null) {
          if ('message' in err && typeof (err as {message: unknown}).message === 'string') {
            errorMessage = (err as {message: string}).message;
          }
          if ('code' in err && typeof (err as {code: unknown}).code === 'string') {
            errorCode = (err as {code: string}).code;
          }
        }

        if (errorCode === 'unavailable') {
          console.log("InventoryEditor: Boutique cache unavailable, fetching from server...");
          try {
            snap = await getDocs(bqQuery); // Fetch from server
            if (!snap.empty) {
              setBoutiqueId(snap.docs[0].id);
            } else {
              setDataError("Aucune boutique trouvée pour cet utilisateur (après échec cache).");
              setBoutiqueId(null);
            }
          } catch (serverErr: unknown) {
            let serverErrorMessage = "Erreur de chargement de la boutique (serveur).";
             if (typeof serverErr === 'object' && serverErr !== null && 'message' in serverErr && typeof (serverErr as {message: unknown}).message === 'string') {
                serverErrorMessage = (serverErr as {message: string}).message;
            }
            console.error("InventoryEditor: Error fetching boutique from server after cache failure:", serverErr);
            setDataError(serverErrorMessage);
            setBoutiqueId(null);
          }
        } else {
          console.error("InventoryEditor: Error fetching boutique:", err);
          setDataError(errorMessage);
          setBoutiqueId(null);
        }
      } finally {
        setIsLoadingBoutique(false);
      }
    };
    fetchBoutique();
  }, [user]);

  useEffect(() => {
    if (!boutiqueId || !inventoryId) {
      setInventoryStatus("encours"); // Default or reset
      return;
    }
    const invRef = doc(db, "boutiques", boutiqueId, "inventaires", inventoryId);
    const unsubscribe = onSnapshot(invRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data?.status) {
            setInventoryStatus(data.status as "encours" | "termine");
            console.log("InventoryEditor: Inventory status updated:", data.status);
          } else {
             console.warn(`InventoryEditor: Inventory document ${inventoryId} exists but status field is missing or invalid.`);
          }
        } else {
          console.warn(`InventoryEditor: Inventory document ${inventoryId} not found.`);
          setDataError(`L'inventaire avec l'ID ${inventoryId} n'a pas été trouvé.`);
        }
      },
      (error: FirestoreError) => {
        console.error("InventoryEditor: Error listening to inventory status:", error);
        setDataError(`Erreur de lecture du statut de l'inventaire: ${error.message}`);
      }
    );
    return () => unsubscribe();
  }, [boutiqueId, inventoryId]);

  useEffect(() => {
    if (!boutiqueId || !inventoryId) {
      setLines([]); // Clear lines if no boutiqueId or inventoryId
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    setDataError(null);
    const currentBoutiqueId = boutiqueId; // Capture stable value for async operations

    const fetchDataForInventory = async () => {
      try {
        const fetchCollection = async (collectionName: string): Promise<QuerySnapshot<DocumentData>> => {
          let snap: QuerySnapshot<DocumentData>;
          const collRef = collection(db, "boutiques", currentBoutiqueId, collectionName);
          try {
            snap = await getDocs(collRef, { source: 'cache' });
            if (snap.empty) { // If cache is empty, try server (unless it's lines)
              console.log(`InventoryEditor: ${collectionName} - cache vide -> serveur`);
              snap = await getDocs(collRef);
            } else {
              console.log(`InventoryEditor: ${collectionName} - cache hit (${snap.size} docs)`);
            }
          } catch (e: unknown) {
            if (typeof e === 'object' && e !== null && (e as {code?:string}).code === 'unavailable') {
              console.log(`InventoryEditor: ${collectionName} - cache indisponible -> serveur`);
              snap = await getDocs(collRef);
            } else { throw e; }
          }
          return snap;
        };
        
        const invLinesCollRef = collection(db, "boutiques", currentBoutiqueId, "inventaires", inventoryId, "lignesInventaires");
        let invLinesSnap: QuerySnapshot<DocumentData>;
         try { // Specific cache handling for inventory lines, often read/write
            invLinesSnap = await getDocs(invLinesCollRef, { source: 'cache' });
            console.log(`InventoryEditor: lignesInventaires - cache hit (${invLinesSnap.size} docs)`);
            if (invLinesSnap.empty) { // If lines are empty in cache, fetch from server too
                 console.log(`InventoryEditor: lignesInventaires - cache vide -> serveur`);
                 invLinesSnap = await getDocs(invLinesCollRef);
            }
        } catch (e: unknown) {
            if (typeof e === 'object' && e !== null && (e as {code?:string}).code === 'unavailable') {
                console.log(`InventoryEditor: lignesInventaires - cache indisponible -> serveur`);
                invLinesSnap = await getDocs(invLinesCollRef);
            } else { throw e; }
        }

        const [supSnap, catSnap, prodSnap] = await Promise.all([
          fetchCollection("suppliers"),
          fetchCollection("categories"),
          fetchCollection("products"),
        ]);

        const loadedSuppliers = supSnap.docs.map(d => ({ id: d.id, nom: (d.data() as SupplierDoc).nom || "Fournisseur sans nom" }));
        const loadedCategories = catSnap.docs.map(d => ({ id: d.id, nom: (d.data() as CategoryDoc).nom || "Catégorie sans nom" }));
        setSuppliers(loadedSuppliers);
        setCategories(loadedCategories);

        const tempSuppliersMap = Object.fromEntries(loadedSuppliers.map(s => [s.id, s.nom]));
        const tempCategoriesMap = Object.fromEntries(loadedCategories.map(c => [c.id, c.nom]));

        const prodsData: ProductDoc[] = prodSnap.docs.map(d => ({id: d.id, ...d.data()} as ProductDoc & {id:string}));

        const initialLines: Line[] = prodsData.map(data => {
          return {
            productId: data.id,
            name: data.nom || "Produit sans nom",
            fournisseurId: data.supplierId,
            fournisseurNom: data.supplierId ? tempSuppliersMap[data.supplierId] : undefined,
            categorieId: data.categoryId,
            categorieNom: data.categoryId ? tempCategoriesMap[data.categoryId] : undefined,
            emplacement: data.emplacement,
            stockTheorique: typeof data.stock === 'number' ? data.stock : 0,
            stockPhysique: typeof data.stock === 'number' ? data.stock : 0, // Initialisé au stock théorique
            ecart: 0,
            motif: "",
            controlled: false,
          };
        });
        setLocations(Array.from(new Set(initialLines.map(p => p.emplacement).filter(Boolean) as string[])));

        const controlledMap: Record<string, { stockPhysique: number; motif: string; controllerName?: string; controlledAt?: Timestamp }> = {};
        invLinesSnap.docs.forEach(d => {
          const dt = d.data() as InventoryLineFirestoreData;
          if (dt.productId) { // Ensure productId exists
            controlledMap[dt.productId] = {
              stockPhysique: dt.stockPhysique,
              motif: dt.motif,
              controllerName: dt.controllerName,
              controlledAt: dt.controlledAt,
            };
          }
        });

        setLines(initialLines.map(p => {
          const ctrlData = controlledMap[p.productId];
          if (ctrlData) {
            return {
                ...p,
                stockPhysique: ctrlData.stockPhysique,
                ecart: ctrlData.stockPhysique - p.stockTheorique,
                motif: ctrlData.motif,
                controlled: true,
                controllerName: ctrlData.controllerName,
                controlledAt: ctrlData.controlledAt, // Timestamp from Firestore
            };
          }
          return p;
        }));

      } catch (err: unknown) {
        let errorMessage = "Impossible de charger les détails de l'inventaire.";
        if (err instanceof Error) {
            errorMessage = err.message;
        }
        console.error("InventoryEditor: Erreur chargement données inventaire (suppliers/cats/prods/lines):", err);
        setDataError(errorMessage);
        setLines([]); // Clear lines on error
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchDataForInventory();
  }, [boutiqueId, inventoryId]); // Rerun if boutiqueId or inventoryId changes


  const controlledCount = useMemo(() => lines.filter(l => l.controlled).length, [lines]);
  const toControlCount = lines.length - controlledCount;

  const filteredLines = useMemo(() => lines.filter(l => {
    const searchLower = searchText.toLowerCase();
    if (searchText && !l.name.toLowerCase().includes(searchLower) &&
        !(l.fournisseurNom && l.fournisseurNom.toLowerCase().includes(searchLower)) &&
        !(l.categorieNom && l.categorieNom.toLowerCase().includes(searchLower)) &&
        !(l.emplacement && l.emplacement.toLowerCase().includes(searchLower)) // Added emplacement to search
    ) return false;
    if (supplierFilter && l.fournisseurId !== supplierFilter) return false;
    if (categoryFilter && l.categorieId !== categoryFilter) return false;
    if (locationFilter && l.emplacement !== locationFilter) return false;
    if (showControlledOnly && !l.controlled) return false;
    if (showNonControlledOnly && l.controlled) return false;
    return true;
  }), [lines, searchText, supplierFilter, categoryFilter, locationFilter, showControlledOnly, showNonControlledOnly]);

  const handleOpenModal = (line: Line) => {
    setCurrentLine(line);
    setInputPhysique(line.stockPhysique);
    setInputMotif(line.motif);
    setModalOpen(true);
  };

  const handleModalSave = async () => {
    if (!user || !boutiqueId || !currentLine || inventoryStatus === "termine" || !userProfile) {
        if (!userProfile && user) {
            setDataError("Profil utilisateur non chargé. Veuillez patienter et réessayer.");
            console.warn("InventoryEditor: Attempted to save line without userProfile loaded.");
        } else if (inventoryStatus === "termine") {
            setDataError("Impossible de modifier un inventaire terminé.");
        }
        setModalOpen(false); // Close modal even if save fails due to preconditions
        return;
    }

    const { productId, stockTheorique, name, fournisseurId, categorieId } = currentLine;
    const newEcart = inputPhysique - stockTheorique;
    const currentBoutiqueId = boutiqueId; // Stable reference
    const ts = serverTimestamp();

    const ligneInventaireData: Omit<InventoryLineFirestoreData, 'controlledAt'> & { controlledAt: ReturnType<typeof serverTimestamp> } = {
      productId,
      productName: name,
      fournisseurId: fournisseurId || null,
      categorieId: categorieId || null,
      stockTheorique,
      stockPhysique: inputPhysique,
      ecart: newEcart,
      motif: inputMotif,
      controlledAt: ts,
      controlledBy: user.uid,
      controllerName: userProfile.fullName,
    };

    try {
      const lineDocRefQuery = query(
        collection(db, "boutiques", currentBoutiqueId, "inventaires", inventoryId, "lignesInventaires"),
        where("productId", "==", productId)
      );
      const existingLineSnap = await getDocs(lineDocRefQuery);

      if (!existingLineSnap.empty) {
        const lineDocRef = existingLineSnap.docs[0].ref;
        await updateDoc(lineDocRef, ligneInventaireData);
        console.log(`InventoryEditor: Ligne d'inventaire mise à jour pour ${productId}`);
      } else {
        await addDoc(collection(db, "boutiques", currentBoutiqueId, "inventaires", inventoryId, "lignesInventaires"), ligneInventaireData);
        console.log(`InventoryEditor: Nouvelle ligne d'inventaire ajoutée pour ${productId}`);
      }

      await updateDoc(doc(db, "boutiques", currentBoutiqueId, "products", productId), { stock: inputPhysique });

      await addDoc(collection(db, "boutiques", currentBoutiqueId, "productStockHistory"), {
        productId,
        inventoryId,
        type: "inventory_adjustment",
        note: `Correction d'inventaire: ${name}`,
        quantityChange: newEcart,
        newStock: inputPhysique,
        oldStock: stockTheorique,
        userId: user.uid,
        userName: userProfile.fullName,
        timestamp: ts,
        context: { motif: inputMotif }
      });

      setLines(prevLines => prevLines.map(l =>
        l.productId === productId
          ? { ...l,
              stockPhysique: inputPhysique,
              ecart: newEcart,
              motif: inputMotif,
              controlled: true,
              controllerName: userProfile.fullName,
              controlledAt: new Date() // Optimistic update with local Date
            }
          : l
      ));
      setModalOpen(false);
      setDataError(null);

    } catch (error: unknown) {
        let errorMessage = "Erreur lors de la sauvegarde de la ligne.";
        if (error instanceof Error) errorMessage = error.message;
        console.error("InventoryEditor: Erreur lors de la sauvegarde de la ligne d'inventaire:", error);
        setDataError(errorMessage);
        // Ne pas fermer le modal ici pour que l'utilisateur puisse réessayer ou voir les valeurs
    }
  };

  const handleFinishInventory = async () => {
    if (!boutiqueId || inventoryStatus === "termine" || !user || !userProfile) {
        if (!userProfile && user) {
            setDataError("Profil utilisateur non chargé. Veuillez patienter et réessayer de terminer.");
        }
        setConfirmOpen(false);
        return;
    }
    try {
        await updateDoc(doc(db, "boutiques", boutiqueId, "inventaires", inventoryId), {
            status: "termine",
            finishedAt: serverTimestamp(),
            finishedBy: user.uid,
            finishedByName: userProfile.fullName
        });
        // Le statut sera mis à jour par l'écouteur onSnapshot
        setConfirmOpen(false);
        setDataError(null); // Clear previous errors
    } catch (error: unknown) {
        let errorMessage = "Erreur lors de la finalisation de l'inventaire.";
        if (error instanceof Error) errorMessage = error.message;
        console.error("InventoryEditor: Erreur lors de la finalisation de l'inventaire:", error);
        setDataError(errorMessage);
        // Garder confirmOpen à true pourrait être une option, ou le fermer.
        // Ici on le ferme car l'action a été tentée.
        setConfirmOpen(false);
    }
  };

  if (isLoadingBoutique) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  }

  if (!boutiqueId && !isLoadingBoutique && dataError) { // Afficher l'erreur si la boutique n'a pas pu être chargée
    return <Alert severity="error" sx={{m:2}}>{dataError}</Alert>;
  }
  
  if (!boutiqueId && !isLoadingBoutique && !dataError) { // Cas où l'utilisateur n'a pas de boutique mais pas d'erreur explicite
    return <Alert severity="warning" sx={{m:2}}>Aucune boutique n'est associée à votre compte ou les données ne sont pas accessibles.</Alert>;
  }


  const tableColumnCount = inventoryStatus === "encours" ? 9 : 8;


  return (
    <Box sx={{ p: isSm ? 1 : 2, opacity: isLoadingData ? 0.7 : 1, pointerEvents: isLoadingData ? 'none' : 'auto' }}>
      <Grid container justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Grid item><Typography variant={isSm ? "h6" : "h5"}>Inventaire <Chip label={`#${inventoryId.substring(0,6)}...`} size="small"/></Typography></Grid>
        <Grid item>
          {inventoryStatus === "encours" && (
            <Button
                color="secondary"
                variant="contained"
                size={isSm ? "small" : "medium"}
                onClick={() => setConfirmOpen(true)}
                disabled={isLoadingData || !userProfile || lines.length === 0}
            >
              Terminer l'inventaire
            </Button>
          )}
           {inventoryStatus === "termine" && (
            <Chip label="Inventaire Terminé" color="success" />
          )}
        </Grid>
      </Grid>

      {isLoadingData && boutiqueId && (
         <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}><CircularProgress /><Typography sx={{ml:2}}>Chargement des données de l'inventaire...</Typography></Box>
      )}

      {dataError && !isLoadingData && <Alert severity="error" onClose={() => setDataError(null)} sx={{mb: 2}}>{dataError}</Alert>}


      {!isLoadingData && boutiqueId && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction={isSm ? "column" : "row"} spacing={isSm ? 1 : 2} alignItems="center" flexWrap="wrap" justifyContent="center">
              <Chip label={`Contrôlés : ${controlledCount}`} color="primary" variant="outlined" />
              <Chip label={`À contrôler : ${toControlCount}`} color={toControlCount > 0 && inventoryStatus === "encours" ? "warning" : "default"} variant="outlined"/>
              <Chip label={`Total produits : ${lines.length}`} variant="outlined"/>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={isSm ? 1 : 2} alignItems="flex-end"> {/* alignItems to flex-end for better layout with Checkboxes */}
              <Grid item xs={12} md={3}><TextField label="Recherche (Produit/Fourn./Cat./Empl.)" value={searchText} onChange={e => setSearchText(e.target.value)} size="small" fullWidth/></Grid>
              <Grid item xs={12} sm={6} md={2}>
                <Autocomplete
                  options={suppliers} getOptionLabel={o => o.nom}
                  value={suppliers.find(s => s.id === supplierFilter) ?? null}
                  onChange={(_, v) => setSupplierFilter(v?.id ?? null)}
                  renderInput={params => <TextField {...params} label="Fournisseur" size="small" />}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <Autocomplete
                  options={categories} getOptionLabel={o => o.nom}
                  value={categories.find(c => c.id === categoryFilter) ?? null}
                  onChange={(_, v) => setCategoryFilter(v?.id ?? null)}
                  renderInput={params => <TextField {...params} label="Catégorie" size="small"/>}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                 <Autocomplete
                  options={locations} getOptionLabel={o => o}
                  value={locationFilter} onChange={(_, v: string | null) => setLocationFilter(v)}
                  renderInput={params => <TextField {...params} label="Emplacement" size="small"/>}
                  fullWidth
                />
              </Grid>
              <Grid item xs={6} sm={3} md="auto">
                <FormControlLabel control={<Checkbox size="small" checked={showControlledOnly} onChange={e => { setShowControlledOnly(e.target.checked); if (e.target.checked) setShowNonControlledOnly(false); }}/>} label="Contrôlés" />
              </Grid>
               <Grid item xs={6} sm={3} md="auto">
                <FormControlLabel control={<Checkbox size="small" checked={showNonControlledOnly} onChange={e => { setShowNonControlledOnly(e.target.checked); if (e.target.checked) setShowControlledOnly(false); }}/>} label="Non Contrôlés" />
              </Grid>
            </Grid>
          </Paper>

          <TableContainer component={Paper} sx={{ maxHeight: 600, mb:2 }}>
            <Table stickyHeader size={isSm ? "small":"medium"}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{minWidth: 150, width: '25%'}}>Produit</TableCell>
                  <TableCell sx={{minWidth: 120, width: '15%'}}>Catégorie</TableCell>
                  <TableCell align="right" sx={{width: '10%'}}>Théorique</TableCell>
                  <TableCell align="right" sx={{width: '10%'}}>Physique</TableCell>
                  <TableCell align="right" sx={{color: theme.palette.error.main, width: '10%'}}>Écart</TableCell>
                  <TableCell sx={{minWidth: 120, width: '15%'}}>Contrôlé par</TableCell>
                  <TableCell sx={{width: '10%'}}>État</TableCell>
                  {inventoryStatus==="encours" && <TableCell sx={{width: '10%'}}>Action</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredLines.length === 0 && (
                  <TableRow><TableCell colSpan={tableColumnCount} align="center">
                    {lines.length === 0 ? "Aucun produit à afficher pour cet inventaire." : "Aucun produit ne correspond à vos filtres."}
                  </TableCell></TableRow>
                )}
                {filteredLines.map(line=>(
                  <TableRow key={line.productId} hover sx={{ '&:last-child td, &:last-child th': { border: 0 }, opacity: inventoryStatus === "termine" && !line.controlled ? 0.6 : 1 }}>
                    <TableCell component="th" scope="row">
                        {line.name}
                        {line.fournisseurNom && <Typography variant="caption" display="block" color="text.secondary">F: {line.fournisseurNom}</Typography>}
                        {line.emplacement && <Typography variant="caption" display="block" color="text.secondary">E: {line.emplacement}</Typography>}
                    </TableCell>
                    <TableCell>{line.categorieNom || categoriesMap[line.categorieId||""]||"—"}</TableCell>
                    <TableCell align="right">{line.stockTheorique}</TableCell>
                    <TableCell align="right" sx={{fontWeight: line.controlled ? 'bold': 'normal'}}>{line.stockPhysique}</TableCell>
                    <TableCell align="right" sx={{color: line.ecart !== 0 ? theme.palette.error.main : 'inherit', fontWeight: line.ecart !==0 ? 'bold': 'normal'}}>{line.ecart}</TableCell>
                    <TableCell>{line.controlled ? (line.controllerName || 'Inconnu') : '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={line.controlled?"Contrôlé":"À contrôler"}
                        color={line.controlled?"success": (inventoryStatus === "termine" ? "default" : "warning")}
                        size="small"
                        variant={line.controlled || inventoryStatus === "termine" ? "filled" : "outlined"}
                      />
                    </TableCell>
                    {inventoryStatus==="encours" && (
                      <TableCell>
                        <Button
                          variant="outlined" size="small"
                          onClick={()=>handleOpenModal(line)}
                          disabled={!userProfile} // userProfile is needed to fill controllerName
                        >
                          {line.controlled?"Modifier":"Contrôler"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <Dialog open={modalOpen} onClose={()=>setModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {currentLine?.controlled?"Modifier":"Contrôler"} — {currentLine?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{mt:1}}>
             <Typography variant="body2">Stock théorique: <strong>{currentLine?.stockTheorique}</strong></Typography>
            <TextField
              label="Stock physique réel"
              type="number"
              value={inputPhysique}
              onChange={e=>setInputPhysique(Number(e.target.value))} // Consider inputProps={{ min: 0 }} if stock cannot be negative
              fullWidth
              autoFocus
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Motif de l'écart (optionnel)"
              value={inputMotif}
              onChange={e=>setInputMotif(e.target.value)}
              multiline rows={2}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setModalOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleModalSave}
            disabled={!userProfile || currentLine?.stockPhysique === inputPhysique && currentLine?.motif === inputMotif && currentLine?.controlled } // Disable if no change
          >
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={()=>setConfirmOpen(false)}>
        <DialogTitle>Terminer l'inventaire ?</DialogTitle>
        <DialogContent>
          {toControlCount > 0 && (
            <Alert severity="warning" sx={{mb:1}}>
                Il reste {toControlCount} produit(s) non contrôlé(s).
            </Alert>
          )}
          <Typography sx={{mt:1}}>
            Êtes-vous sûr de vouloir terminer cet inventaire ? Les lignes non contrôlées seront considérées comme ayant un stock physique égal au stock théorique (écart de 0). Vous ne pourrez plus modifier les lignes après avoir terminé.
          </Typography>
           {!userProfile && user && ( // Check if user exists but profile not yet loaded
            <Alert severity="info" sx={{mt:1}}>
                Le profil utilisateur est en cours de chargement. Veuillez patienter quelques instants pour que votre nom soit correctement enregistré lors de la finalisation.
            </Alert>
           )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setConfirmOpen(false)}>Non, continuer</Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleFinishInventory}
            disabled={!userProfile} // Disable if profile not loaded
          >
            Oui, Terminer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}