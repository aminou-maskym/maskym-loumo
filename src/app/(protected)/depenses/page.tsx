// src/app/depenses/page.tsx
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
import ExpenseDashboard from "@/components/ExpenseDashboard";
import ExpenseForm from "@/components/ExpenseForm";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function DepensesPage() {
  const [openForm, setOpenForm] = useState(false);

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 4 },
        bgcolor: "#f0f2f5",
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
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Gestion des dépenses
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenForm(true)}
          sx={{
            bgcolor: "secondary.main",
            color: "#fff",
            boxShadow: 3,
            "&:hover": { bgcolor: "secondary.dark" },
            textTransform: "none",
          }}
        >
          Ajouter une dépense
        </Button>
      </Stack>

      {/* Dashboard intégral avec listes et graphiques */}
      <ExpenseDashboard />

      {/* Dialog du formulaire */}
      <Dialog
        fullWidth
        maxWidth="sm"
        open={openForm}
        onClose={() => setOpenForm(false)}
        TransitionComponent={Transition}
        keepMounted
      >
        <DialogTitle sx={{ m: 0, p: 2 }}>
          Nouvelle dépense
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
          <ExpenseForm />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
