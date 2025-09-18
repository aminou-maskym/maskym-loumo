//. "use client";  // Vous pouvez supprimer cette ligne, elle n'est pas nécessaire ici.

import * as React from "react";
import { Box, Grid, Divider } from "@mui/material";
import SuppliersManagement from "@/components/SuppliersManagement"; // Sera un Client Component

export default function ClientsFournisseursPage() {
  return (
    <Box sx={{ p: { xs: 2, md: 5 }, bgcolor: "#f4f6f8", minHeight: "100vh" }}>
      
      <Divider sx={{ my: 4 }} />
      <Grid container spacing={4}>
        
        <Grid item xs={12} lg={6}>
          <SuppliersManagement />
        </Grid>
      </Grid>
    </Box>
  );
}