// src/components/InventoryLauncher.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  DocumentData, // Import pour typer data() de Firestore
} from "firebase/firestore";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  TextField,
  MenuItem,
  Stack,
  Paper,
} from "@mui/material";
import { DataGrid, GridColDef, GridRowParams } from "@mui/x-data-grid";
import { useRouter } from "next/navigation"; // Gardé pour "Voir rapport" pour l'instant

interface Inventory {
  id: string;
  type: "complet" | "partiel" | "audit" | "ouverture";
  createdAt?: Date; // createdAt est un Timestamp de Firebase, converti en Date
  status: "encours" | "termine";
}

// Définition des props pour InventoryLauncher
interface InventoryLauncherProps {
  onOpenInventory: (inventoryId: string) => void;
}

export default function InventoryLauncher({ onOpenInventory }: InventoryLauncherProps) {
  const [user] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [type, setType] = useState<Inventory["type"]>("complet");
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [launching, setLaunching] = useState(false);
  const router = useRouter(); // On le garde si "Voir rapport" navigue encore

  // Récupérer boutiqueId
  useEffect(() => {
    if (!user) return;
    const qBout = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );
    const unsub = onSnapshot(qBout, snap => {
      if (!snap.empty) {
        setBoutiqueId(snap.docs[0].id);
      } else {
        setBoutiqueId(null); // S'assurer que boutiqueId est réinitialisé si aucune boutique n'est trouvée
        console.warn("Aucune boutique trouvée pour l'utilisateur:", user.uid);
      }
    });
    return () => unsub();
  }, [user]);

  // Écouter la sous-collection inventaires
  useEffect(() => {
    if (!boutiqueId) {
      setInventories([]); // Réinitialiser les inventaires si boutiqueId n'est pas défini
      return;
    }

    const invCol = collection(db, "boutiques", boutiqueId, "inventaires");
    
    const qInv = query(invCol); // Pas de filtre "where" ici, on les veut tous pour cette boutique
    const unsub = onSnapshot(qInv, snap => { // Changé `invCol` en `qInv` pour la clarté, mais fonctionne pareil
      const arr = snap.docs.map(doc => {
        const data = doc.data() as DocumentData; // Utiliser DocumentData pour un typage plus souple
        return {
          id: doc.id,
          type: data.type as Inventory["type"], // Assurez-vous que le type est correct
          createdAt: data.createdAt?.toDate(), // Convertir Timestamp en Date
          status: data.status as Inventory["status"], // Assurez-vous que le statut est correct
        } as Inventory;
      });
      
      setInventories(
        arr.sort((a, b) => {
          const ta = a.createdAt?.getTime() ?? 0;
          const tb = b.createdAt?.getTime() ?? 0;
          return tb - ta; // Trier par date de création, du plus récent au plus ancien
        })
      );
    });

    return () => unsub();
  }, [boutiqueId]);


  // Lancer un nouvel inventaire
  const handleLaunch = async () => {
    if (!user || !boutiqueId) {
      console.error("Utilisateur ou boutiqueId manquant pour lancer l'inventaire.");
      return;
    }
    setLaunching(true);
    try {
      const invRef = await addDoc(
        collection(db, "boutiques", boutiqueId, "inventaires"),
        {
          type,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          status: "encours",
          // Ajoutez d'autres champs initiaux si nécessaire
        }
      );
      // Au lieu de router.push, on appelle la fonction passée en props
      // pour que ProductPage mette à jour son état et affiche InventoryEditor
      onOpenInventory(invRef.id);
    } catch (error) {
      console.error("Erreur lors du lancement de l'inventaire:", error);
      // Gérer l'erreur, par exemple afficher un message à l'utilisateur
    } finally {
      setLaunching(false);
    }
  };

  const cols: GridColDef<Inventory>[] = [ // Spécifier le type de row pour GridColDef
    {
      field: "createdAt",
      headerName: "Date de début",
      flex: 1,
      renderCell: (params: GridRowParams<Inventory>) => // Typer params
        params.row.createdAt
          ? params.row.createdAt.toLocaleString() // createdAt est déjà une Date ici
          : "—",
    },
    { field: "type", headerName: "Type", flex: 1 },
    { field: "status", headerName: "Statut", flex: 1 },
    {
      field: "actions",
      headerName: "Actions",
      flex: 2,
      renderCell: (params: GridRowParams<Inventory>) => ( // Typer params
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            // Appel de la fonction onOpenInventory passée en prop
            onClick={() => onOpenInventory(params.row.id)}
          >
            Ouvrir
          </Button>
          <Button
            variant="outlined"
            size="small"
            // Ce bouton peut toujours naviguer si le rapport est sur une page dédiée
            // ou si vous préférez une navigation pour les rapports.
            // Si le rapport doit aussi s'afficher sur la même page sans navigation,
            // il faudrait une autre fonction (ex: onShowReport) passée en prop.
            onClick={() => router.push(`/inventaire/${params.row.id}?report=true`)} // Exemple de navigation vers un rapport
          >
            Voir rapport
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6">Créer un inventaire</Typography>
          <Stack direction="row" spacing={2} mt={2}>
            <TextField
              select
              label="Type"
              value={type}
              onChange={e => setType(e.target.value as Inventory["type"])}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="complet">Complet</MenuItem>
              <MenuItem value="partiel">Partiel</MenuItem>
              <MenuItem value="audit">Audit/Contrôle</MenuItem>
              <MenuItem value="ouverture">Ouverture</MenuItem>
            </TextField>
            <Button
              variant="contained"
              onClick={handleLaunch}
              disabled={launching || !boutiqueId}
            >
              {launching ? "Lancement..." : "Lancer"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h6" gutterBottom>
        Inventaires lancés
      </Typography>
      <Paper sx={{ height: "auto", minHeight: 300, width: '100%' }}> {/* Ajustement hauteur pour mieux s'adapter */}
        {boutiqueId ? (
          inventories.length > 0 ? (
            <DataGrid
              rows={inventories}
              columns={cols}
              getRowId={(row: Inventory) => row.id} // Typer row
              // hideFooter // Décommenter si vous ne voulez pas la pagination/footer
              autoHeight // Permet au DataGrid de prendre la hauteur de son contenu
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 5 },
                },
              }}
              pageSizeOptions={[5, 10, 20]}
            />
          ) : (
            <Typography sx={{ p: 2, textAlign: 'center' }}>Aucun inventaire trouvé pour cette boutique.</Typography>
          )
        ) : (
          <Typography sx={{ p: 2, textAlign: 'center' }}>Chargement des données de la boutique ou aucune boutique associée...</Typography>
        )}
      </Paper>
    </Box>
  );
}