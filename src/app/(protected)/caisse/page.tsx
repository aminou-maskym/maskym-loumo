// src/app/(protected)/page.tsx
"use client";

import * as React from "react";
import { useState, useEffect } from "react";

import CashRegister from "@/components/CashRegister";
import CashClosedAlert from "@/components/CashClosedAlert";

export default function DashboardPage() {
  // État pour contrôler l'affichage de l'alerte
  const [alertOpen, setAlertOpen] = useState(true);

  // Exemple : si tu as un flag 'isCashOpen' dans CashRegister ou depuis le backend,
  // tu peux automatiquement fermer l'alerte quand la caisse est ouverte.
  // Ici on simule avec useEffect (remplace par ta logique réelle).
  useEffect(() => {
    // suppose window.cashIsOpen = true/false
    const isCashOpen = (window as unknown).cashIsOpen ?? false;
    if (isCashOpen) {
      setAlertOpen(false);
    }
  }, []);

  return (
    <main>
      {/* Alerte en haut de page */}
      <CashClosedAlert
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
      />

      {/* Composant principal */}
      <CashRegister />
    </main>
  );
}
