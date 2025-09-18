"use client";

import * as React from "react";
import { Box, Container, Typography } from "@mui/material";
import { CreateBoutique } from "@/components/BoutiqueManagerComponents";
import { CreateManager } from "@/components/BoutiqueManagerComponents";

export default function DashboardPage() {
  const [boutiqueId, setBoutiqueId] = React.useState<string | null>(null);

  return (
    <Container maxWidth="sm">
      <Box mt={4}>
        <Typography variant="h4" gutterBottom>
          Tableau de bord
        </Typography>

        {!boutiqueId ? (
          <CreateBoutique onCreated={(id: string) => setBoutiqueId(id)} />
        ) : (
          <CreateManager boutiqueId={boutiqueId} />
        )}
      </Box>
    </Container>
  );
}
