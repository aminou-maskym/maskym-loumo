// src/app/retours/page.tsx
"use client";

import * as React from "react";
import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Slide,
  Typography,
  Stack,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ReturnForm from "@/components/ReturnForm";
import ReturnDetails from "@/components/ReturnDetails"; // votre composant de liste des retours

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function ReturnsPage() {
  const [openForm, setOpenForm] = useState(false);

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 4 },
        bgcolor: "#f8f9fa",
        minHeight: "100vh",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems="center"
        mb={3}
        spacing={2}
      >
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Gestion des retours
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenForm(true)}
          sx={{
            bgcolor: "success.main",
            color: "#fff",
            boxShadow: 3,
            "&:hover": { bgcolor: "success.dark" },
            textTransform: "none",
          }}
        >
          Nouveau retour
        </Button>
      </Stack>

      {/* Liste des retours */}
      <ReturnDetails />

      {/* Dialog du formulaire de retour */}
      <Dialog
        fullWidth
        maxWidth="sm"
        open={openForm}
        onClose={() => setOpenForm(false)}
        TransitionComponent={Transition}
        keepMounted
      >
        <DialogTitle sx={{ m: 0, p: 2 }}>
          Nouveau retour produit
          <IconButton
            aria-label="close"
            onClick={() => setOpenForm(false)}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: theme => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <ReturnForm />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
