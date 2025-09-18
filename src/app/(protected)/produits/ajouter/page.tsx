"use client";

import React from "react";
import AddProductForm from "@/components/AddProductForm";
import BulkProductImporter from "@/components/BulkProductImporter";

export default function AddProductPage() {
  return (
    <main style={{ padding: "2rem" }}>
      <AddProductForm />
      <BulkProductImporter />
    </main>
  );
}
