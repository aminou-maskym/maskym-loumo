"use client";

import * as React from "react";
import { useState } from "react";
import { Box, Grid, Divider, Stack, Button } from "@mui/material";
import CustomersManagement from "@/components/CustomersManagement";
import CreancesManagement from "@/components/CreancesManagement";

export default function ClientsFournisseursPage() {
  // Par défaut : affichage de la gestion des clients
  const [active, setActive] = useState<"clients" | "creances">("clients");

  return (
    <Box sx={{ p: { xs: 2, md: 5 }, bgcolor: "#f4f6f8", minHeight: "100vh" }}>
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 4 }}>
        <Button
          variant={active === "clients" ? "contained" : "outlined"}
          onClick={() => setActive("clients")}
          sx={{ minWidth: 180 }}
        >
          Gestion des Clients
        </Button>
        <Button
          variant={active === "creances" ? "contained" : "outlined"}
          onClick={() => setActive("creances")}
          sx={{ minWidth: 180 }}
        >
          Gestion des Créances
        </Button>
      </Stack>

      <Grid container spacing={4}>
        {active === "clients" && (
          <Grid item xs={12}>
            <CustomersManagement />
          </Grid>
        )}

        {active === "creances" && (
          <Grid item xs={12}>
            <CreancesManagement />
          </Grid>
        )}
      </Grid>

      <Divider sx={{ my: 4 }} />
    </Box>
  );
}
