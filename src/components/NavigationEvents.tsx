// src/components/NavigationEvents.tsx
"use client";

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

// Configuration initiale de NProgress une seule fois
// Cela peut être fait en dehors du composant si la configuration est globale
// ou dans un useEffect avec un tableau de dépendances vide si spécifique au montage.
// Pour cet exemple, le placer dans un useEffect dédié au montage est propre.

export function NavigationEvents() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Configurer NProgress une seule fois lors du montage du composant
    NProgress.configure({ showSpinner: false, trickleSpeed: 200 });
  }, []); // Tableau de dépendances vide pour exécuter une seule fois au montage

  useEffect(() => {
    // Au début de chaque navigation (changement de pathname ou searchParams)
    NProgress.start();

    // La fonction de nettoyage sera appelée avant la prochaine exécution de l'effet
    // ou lors du démontage du composant.
    return () => {
      NProgress.done();
    };
  }, [pathname, searchParams]);

  return null;
}