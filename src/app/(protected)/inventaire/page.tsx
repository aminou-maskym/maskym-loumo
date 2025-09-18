"use client";

import React, { useState, useCallback } from "react";
// Pas besoin de useSearchParams ici si on n'utilise plus les query params pour ça
// import { useSearchParams } from "next/navigation";
import InventoryLauncher from "@/components/InventoryLauncher";
import InventoryEditor from "@/components/InventoryEditor";
import InventoryReport from "@/components/InventoryReport";
import { Box, Typography, Button } from "@mui/material"; // Ajout de Button pour un éventuel "fermer"

export default function ProductPage() {
  // État pour stocker l'ID de l'inventaire actuellement sélectionné pour édition
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);

  // Fonction à passer à InventoryLauncher pour qu'il puisse indiquer quel inventaire ouvrir
  const handleOpenInventory = useCallback((inventoryId: string) => {
    setSelectedInventoryId(inventoryId);
  }, []);

  // Optionnel: Fonction pour fermer l'éditeur et revenir à la vue initiale
  const handleCloseEditor = useCallback(() => {
    setSelectedInventoryId(null);
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      {/* 
        InventoryLauncher a maintenant besoin d'une prop pour communiquer 
        l'ID de l'inventaire à ouvrir.
        Supposons qu'il prend une prop `onOpenInventory` qui est une fonction
        appelée avec l'ID de l'inventaire.
      */}
      <InventoryLauncher onOpenInventory={handleOpenInventory} />
      
      {selectedInventoryId ? (
        <>
          <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
            Édition de l&apos;inventaire : {selectedInventoryId}
          </Typography>
          {/* 
            Optionnel: Un bouton pour fermer l'éditeur et revenir à la liste.
            Ce bouton pourrait aussi être DANS InventoryEditor, qui appellerait
            une fonction `onClose` passée en prop.
          */}
          <Button onClick={handleCloseEditor} variant="outlined" sx={{ mb: 2 }}>
            Retour au lanceur / Fermer l&apos;éditeur
          </Button>

          <Box sx={{ mt: 2 }}>
            <InventoryEditor 
              inventoryId={selectedInventoryId} 
              // Optionnel: Si InventoryEditor doit pouvoir se fermer lui-même
              // onClose={handleCloseEditor} 
            />
          </Box>
          <Box sx={{ mt: 6 }}>
            <InventoryReport inventoryId={selectedInventoryId} />
          </Box>
        </>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 4 }}>
          Sélectionnez ou créez un inventaire via le lanceur ci-dessus pour voir les détails et l&apos;éditeur ici.
        </Typography>
      )}
    </Box>
  );
}