// src/app/pos/page.tsx
"use client";

import React from "react";
import { Box, useTheme } from "@mui/material";
import PosVente from "@/components/PosVente";

export default function PosPage() {
  const theme = useTheme();

  return (
    // Conteneur qui force le composant POS sur toute la largeur et au-dessus du drawer/sidebar
    <Box
      component="main"
      sx={{
        position: "relative",                // relative permet au contenu d'être normal flow tout en gardant zIndex
        width: "100vw",                      // force la largeur de la fenêtre (ignore paddings parents)
        maxWidth: "100%",                    // garde la contrainte
        left: 0,
        marginLeft: 0,                       // annule margin-left éventuel du layout contenant
        padding: 0,
        px: 0,
        py: 4,
        boxSizing: "border-box",
        zIndex: theme.zIndex.drawer + 2,     // au-dessus du sidebar/drawer
        background: "transparent",           // si nécessaire, change la couleur de fond ici
        overflowX: "hidden",
      }}
    >
      {/* Si tu veux un padding intérieur, wrappe PosVente dans un Box interne */}
      <Box sx={{ width: "100%", maxWidth: "100%", px: { xs: 2, md: 4 } }}>
        <PosVente />
      </Box>
    </Box>
  );
}
