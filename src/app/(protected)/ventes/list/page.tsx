// src/app/(protected)/page.tsx
"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Collapse,
  Paper
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  TrendingUp as TrendingUpIcon
} from "@mui/icons-material";
import SaleForm from "@/components/SaleForm";
import SaleList from "@/components/SaleList";
import CashClosedAlert from "@/components/CashClosedAlert";

export default function DashboardPage() {
  const [showForm, setShowForm] = useState(false);

  // Ferme le formulaire après une vente ajoutée
  const handleSuccess = () => {
    setShowForm(false);
  };

  return (
    <Box
      component="main"
      sx={{
        px: { xs: 2, sm: 4 },
        py: { xs: 2, sm: 4 },
        pr: { xs: 2, sm: "10px" },
        mr: { xs: 0, sm: "10px" },
        mb: "10px",
        bgcolor: "grey.50",
        minHeight: "100vh",
        transition: "background-color 0.3s ease"
      }}
    >
      {/* Alerte caisse fermée (affichée seulement si status = "fermé") */}
      <CashClosedAlert />

      {/* En-tête moderne responsive */}
      <Box
        sx={{
          mb: 4,
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          gap: { xs: 2, sm: 0 }
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            gap: 1
          }}
        >
          <TrendingUpIcon fontSize="large" /> Ventes
        </Typography>

        <Button
          variant="contained"
          color="primary"
          startIcon={showForm ? <CloseIcon /> : <AddIcon />}
          onClick={() => setShowForm(prev => !prev)}
          sx={{
            textTransform: "none",
            borderRadius: "50px",
            boxShadow: 3,
            py: { xs: 1, sm: 1.5 },
            px: { xs: 2, sm: 3 },
            transition: "transform 0.2s ease",
            "&:hover": {
              transform: "scale(1.05)"
            }
          }}
        >
          {showForm ? "Annuler" : "Ajouter une vente"}
        </Button>
      </Box>

      {/* Formulaire animé avec effet glassmorphism responsive */}
      <Collapse in={showForm} timeout="auto" unmountOnExit>
        <Paper
          elevation={6}
          sx={{
            mb: 5,
            p: { xs: 2, sm: 4 },
            width: { xs: "100%", md: "80%" },
            mx: "auto",
            borderRadius: 3,
            backdropFilter: "blur(12px)",
            bgcolor: "rgba(255,255,255,0.85)",
            transition: "all 0.4s ease"
          }}
        >
          <SaleForm onSuccess={handleSuccess} />
        </Paper>
      </Collapse>

      {/* Liste des ventes responsive */}
      <Box
        sx={{
          ".sale-item": {
            mb: 2,
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
            "&:hover": {
              transform: "translateY(-2px)",
              boxShadow: 4
            }
          },
          width: "100%",
          maxWidth: { xs: "100%", md: "90%" },
          mx: "auto"
        }}
      >
        <SaleList />
      </Box>
    </Box>
  );
}
