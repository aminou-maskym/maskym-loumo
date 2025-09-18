// src/components/CategoryList.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  FirestoreError,
} from "firebase/firestore";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  CircularProgress,
  Tooltip,
  Stack,
  Alert,
  IconButton,
} from "@mui/material";
import { DataGrid, GridColDef, GridToolbar } from "@mui/x-data-grid";
import { frFR } from "@mui/x-data-grid/locales";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

interface Categorie {
  id: string;
  nom: string;
}

interface Produit {
  id: string;
  categoryId?: string;
}

interface SaleItem {
  productId: string;
  quantite: number;
}

interface Vente {
  id: string;
  items: SaleItem[];
}

export default function CategoryList() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [currentCat, setCurrentCat] = useState<Categorie | null>(null);
  const [newName, setNewName] = useState("");

  // Fetch data once user is ready
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const q = query(
          collection(db, "boutiques"),
          where("utilisateursIds", "array-contains", user.uid)
        );
        const bSnap = await getDocs(q);
        if (bSnap.empty) throw new Error("Aucune boutique trouvée");
        const bId = bSnap.docs[0].id;
        setBoutiqueId(bId);

        onSnapshot(collection(db, "boutiques", bId, "categories"), snap =>
          setCategories(snap.docs.map(d => ({ id: d.id, nom: d.data().nom })))
        );
        onSnapshot(collection(db, "boutiques", bId, "products"), snap =>
          setProduits(snap.docs.map(d => ({ id: d.id, ...(d.data() as unknown) })))
        );
        onSnapshot(collection(db, "boutiques", bId, "sales"), snap =>
          setVentes(snap.docs.map(d => ({ id: d.id, ...(d.data() as unknown) })))
        );
      } catch (e: unknown) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Compute rows for DataGrid
  const rows = useMemo(() => {
    const prodCount: Record<string, number> = {};
    const soldCount: Record<string, number> = {};
    categories.forEach(c => {
      prodCount[c.id] = 0;
      soldCount[c.id] = 0;
    });
    produits.forEach(p => {
      if (p.categoryId && prodCount[p.categoryId] !== undefined) {
        prodCount[p.categoryId]++;
      }
    });
    ventes.forEach(v =>
      (v.items || []).forEach(it => {
        const prod = produits.find(p => p.id === it.productId);
        if (prod?.categoryId && soldCount[prod.categoryId] !== undefined) {
          soldCount[prod.categoryId] += it.quantite;
        }
      })
    );
    return categories.map(c => ({
      id: c.id,
      nom: c.nom,
      products: prodCount[c.id] || 0,
      sold: soldCount[c.id] || 0,
    }));
  }, [categories, produits, ventes]);

  // Define DataGrid columns
  const columns: GridColDef[] = [
    { field: "nom", headerName: "Catégorie", flex: 1 },
    { field: "products", headerName: "Produits", type: "number", width: 130 },
    { field: "sold", headerName: "Vendus", type: "number", width: 130 },
    {
      field: "actions",
      headerName: "Actions",
      width: 150,
      sortable: false,
      renderCell: params => (
        <>
          <Tooltip title="Modifier">
            <IconButton
              onClick={() => {
                const cat = categories.find(c => c.id === params.id);
                setCurrentCat(cat || null);
                setNewName(cat?.nom || "");
                setEditOpen(true);
              }}
            >
              <EditIcon color="primary" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Supprimer">
            <IconButton
              onClick={async () => {
                const cat = categories.find(c => c.id === params.id);
                if (!cat || !boutiqueId) return;
                await deleteDoc(doc(db, "boutiques", boutiqueId, "categories", cat.id));
              }}
            >
              <DeleteIcon color="error" />
            </IconButton>
          </Tooltip>
        </>
      ),
    },
  ];

  // Handlers for add / edit
  const handleAdd = async () => {
    if (!boutiqueId) return;
    try {
      await addDoc(collection(db, "boutiques", boutiqueId, "categories"), { nom: newName });
      setAddOpen(false);
      setNewName("");
    } catch (e: unknown) {
      setError((e as FirestoreError).message);
    }
  };
  const handleEdit = async () => {
    if (!boutiqueId || !currentCat) return;
    try {
      await updateDoc(
        doc(db, "boutiques", boutiqueId, "categories", currentCat.id),
        { nom: newName }
      );
      setEditOpen(false);
      setCurrentCat(null);
      setNewName("");
    } catch (e: unknown) {
      setError((e as FirestoreError).message);
    }
  };

  if (loadingAuth || loading) {
    return (
      <Box textAlign="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Catégories</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
        >
          Ajouter
        </Button>
      </Stack>

      <Box sx={{ height: 500, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          pageSizeOptions={[5, 10, 20]}
          initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
          localeText={frFR.components.MuiDataGrid.defaultProps.localeText}
          slots={{ toolbar: GridToolbar }}
          slotProps={{ toolbar: { showQuickFilter: true } }}
          sx={{
            borderRadius: 2,
            boxShadow: 3,
            "& .MuiDataGrid-row:hover": { backgroundColor: "rgba(0,0,0,0.04)" },
          }}
        />
      </Box>

      {/* Dialog: Ajouter */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)}>
        <DialogTitle>Ajouter une catégorie</DialogTitle>
        <DialogContent>
          <TextField
            label="Nom de la catégorie"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleAdd}>
            Ajouter
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Modifier */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <DialogTitle>Modifier la catégorie</DialogTitle>
        <DialogContent>
          <TextField
            label="Nom de la catégorie"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleEdit}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
