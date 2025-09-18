"use client";

import React, { useState } from "react"; // Importez useState
import { Container, Typography, Divider, Box, Button } from "@mui/material"; // Importez Button
import CreateBonAchat from "@/components/BonAchatForm";
import PurchaseOrderList from "@/components/BonAchatList";
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart'; // Icône optionnelle pour le bouton

export default function BonAchatPage() {
  // État pour contrôler la visibilité du formulaire
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Fonction pour basculer l'affichage du formulaire
  const toggleCreateForm = () => {
    setShowCreateForm((prev) => !prev);
  };

  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" gutterBottom sx={{ mb: 0 }}>
          Gestion des Bons d’Achat
        </Typography>
        <Button
          variant="contained"
          onClick={toggleCreateForm}
          startIcon={<AddShoppingCartIcon />}
          size="medium"
        >
          {showCreateForm ? "Annuler" : "Créer un Bon d'Achat"}
        </Button>
      </Box>
      <Divider sx={{ mb: 3 }} />

      {/* Affichage conditionnel du formulaire */}
      {showCreateForm && (
        <Box sx={{ mb: 4, p:3, border: '1px dashed grey', borderRadius: 2, backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[50] }}>
          <Typography variant="h6" gutterBottom sx={{mb: 2}}>
            Nouveau Bon d&apos;Achat
          </Typography>
          <CreateBonAchat />
          <Button onClick={toggleCreateForm} sx={{mt:2}} color="error" size="small">
            Fermer le formulaire
          </Button>
        </Box>
      )}

      <Typography variant="h5" gutterBottom sx={{mt: showCreateForm ? 4 : 0}}>
        Liste des Bons de Commande
      </Typography>
      <PurchaseOrderList />
    </Container>
  );
}