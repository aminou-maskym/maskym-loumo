// app/(protected)/inventaire/[inv]/page.tsx
import type { Metadata } from "next";
import InventoryEditor from "@/components/InventoryEditor";
import InventoryReport from "@/components/InventoryReport";
import { Box, Typography } from "@mui/material";

interface Params { inv: string }

// 1) Déclarez les routes à générer :
export async function generateStaticParams(): Promise<Params[]> {
  // Exemple : récupérer tous vos IDs d’inventaire depuis Firestore ou une API
  // const docs = await getDocs(collection(db, "inventaires"));
  // return docs.docs.map(doc => ({ inv: doc.id }));

  // Pour l’instant, si vous n’avez qu’un seul inventaire :
  return [{ inv: "default-inv-id" }];
}

// 2) Vous pouvez aussi définir des metadata dynamiques en SSR :
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `Inventaire – ${params.inv}` };
}

export default async function InventairePage({ params }: { params: Params }) {
  const inv = params.inv;
  return (
    <Box component="main" sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Inventaire : {inv}</Typography>
      <InventoryEditor inventoryId={inv} />
      <Box sx={{ mt: 6 }}>
        <InventoryReport inventoryId={inv} />
      </Box>
    </Box>
  );
}
