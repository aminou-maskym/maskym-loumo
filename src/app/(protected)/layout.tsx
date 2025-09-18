// src/app/(protected)/layout.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface ProtectedLayoutProps {
  children: React.ReactNode;
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user) {
        router.replace("/login");
      }
    });
    return unsubscribe;
  }, [router]);

  // Tant que l’effet n’a pas redirigé, on peut afficher le contenu.
  return <>{children}</>;
}
