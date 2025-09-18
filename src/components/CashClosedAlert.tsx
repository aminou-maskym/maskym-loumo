// src/components/CashClosedAlert.tsx
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { Alert, AlertTitle, IconButton, Collapse, keyframes } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";

const blink = keyframes`
  0% { opacity: 0.8; }
  50% { opacity: 0.3; }
  100% { opacity: 0.8; }
`;

/**
 * Affiche une alerte clignotante si la caisse est fermée.
 *  
 * Se base sur le champ `status` de la sous-collection `caisse`
 * de la boutique de l'utilisateur courant.
 */
export default function CashClosedAlert() {
  const [user] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [isClosed, setIsClosed]   = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Récupère l'ID de la boutique de l'utilisateur
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        setBoutiqueId(snap.docs[0].id);
      }
    });
    return () => unsub();
  }, [user]);

  // Écoute le statut de la caisse
  useEffect(() => {
    if (!boutiqueId) return;
    const coll = collection(db, "boutiques", boutiqueId, "caisse");
    const unsub = onSnapshot(coll, snap => {
      // on suppose qu'un document a un champ `status`
      const closed = snap.docs.some(d => (d.data() as unknown).status === "fermé");
      setIsClosed(closed);
      if (!closed) setDismissed(false); // réactive l'alerte si réouverture
    });
    return () => unsub();
  }, [boutiqueId]);

  const show = isClosed && !dismissed;

  return (
    <Collapse in={show}>
      <Alert
        severity="warning"
        icon={<WarningAmberIcon fontSize="large" sx={{ color: 'orange.dark' }} />}
        action={
          <IconButton
            aria-label="close"
            color="inherit"
            size="medium"
            onClick={() => setDismissed(true)}
            sx={{ '&:hover': { color: 'orange.main' } }}
          >
            <HighlightOffIcon fontSize="large" />
          </IconButton>
        }
        sx={{
          mb: 2,
          borderRadius: 3,
          animation: `${blink} 1.5s ease-in-out infinite`,
          background: 'linear-gradient(45deg, #fff3e0 30%, #ffecb3 90%)',
          border: '2px solid #ffb74d',
          boxShadow: '0 3px 5px 2px rgba(255, 183, 77, .15)',
          alignItems: 'center',
          '& .MuiAlert-message': { py: 1.5 }
        }}
      >
        <AlertTitle sx={{
          fontWeight: 'bold',
          fontSize: '1.2rem',
          color: 'orange.dark',
          m: 0
        }}>
          Caisse fermée
        </AlertTitle>
        <span style={{ fontSize: '0.95rem', color: '#bf360c' }}>
          La caisse est actuellement fermée. Veuillez l&apos;ouvrir pour reprendre les opérations.
        </span>
      </Alert>
    </Collapse>
  );
}
