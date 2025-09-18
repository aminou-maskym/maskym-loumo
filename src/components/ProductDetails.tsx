"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Divider,
  CircularProgress,
  useTheme,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
} from "@mui/material";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  doc,
} from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import ProductDetails from "@/components/ProductDetails";

interface StockLog {
  id: string;
  date: Date;
  qty: number;
  note: string;
  productId: string;
  userId: string;
}

interface User {
  id: string;
  nom: string;
}

export default function StockHistory() {
  const theme = useTheme();
  const [user] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);

  // Modal détails produit
  const [openDetail, setOpenDetail] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string>("");
  const [detailBoutiqueId, setDetailBoutiqueId] = useState<string>("");

  // 1) Récupération de l’ID boutique
  useEffect(() => {
    if (!user) return;
    const bq = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );
    const unsub = onSnapshot(bq, (snap) => {
      if (!snap.empty) {
        const id = snap.docs[0].id;
        setBoutiqueId(id);
        setDetailBoutiqueId(id);
      }
    });
    return () => unsub();
  }, [user]);

  // 2) Chargement des logs et des utilisateurs
  const loadLogsAndUsers = useCallback(async () => {
    if (!boutiqueId) return;
    const coll = collection(db, "boutiques", boutiqueId, "updateStock");
    const unsub = onSnapshot(coll, async (snap) => {
      const tmp: StockLog[] = [];
      const uids = new Set<string>();

      snap.docs.forEach((ds) => {
        const d = ds.data() as unknown;
        tmp.push({
          id: ds.id,
          date: d.date?.toDate() ?? new Date(),
          qty: d.qty,
          note: d.note ?? "",
          productId: d.productId,
          userId: d.userId,
        });
        uids.add(d.userId);
      });

      // Charger tous les utilisateurs en une passe
      const map: Record<string, User> = {};
      await Promise.all(
        Array.from(uids).map(async (uid) => {
          const uDoc = await getDoc(doc(db, "users", uid));
          if (uDoc.exists()) {
            map[uid] = { id: uid, nom: (uDoc.data() as unknown).nom };
          }
        })
      );

      setUsersMap(map);
      setLogs(tmp);
      setLoading(false);
    });
    return () => unsub();
  }, [boutiqueId]);

  useEffect(() => {
    loadLogsAndUsers();
  }, [loadLogsAndUsers]);

  if (loading || boutiqueId === null) {
    return (
      <Box textAlign="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Stack spacing={2}>
        {logs.map((log) => (
          <Card
            key={log.id}
            variant="outlined"
            sx={{ boxShadow: theme.shadows[2] }}
          >
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  {log.date.toLocaleString("fr-FR")}
                </Typography>

                <Typography variant="h6">
                  {log.productId} : +{log.qty}
                </Typography>

                {log.note && (
                  <Typography variant="body2">
                    <strong>Note :</strong> {log.note}
                  </Typography>
                )}

                <Divider />

                <Typography variant="body2">
                  Ajouté par :{" "}
                  {usersMap[log.userId]?.nom ?? "Utilisateur inconnu"}
                </Typography>

                <Box textAlign="right">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setDetailProductId(log.productId);
                      setOpenDetail(true);
                    }}
                  >
                    Détails produit
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Modal ProductDetails */}
      <Dialog
        open={openDetail}
        onClose={() => setOpenDetail(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Détails du produit</DialogTitle>
        <DialogContent dividers>
          {detailProductId && detailBoutiqueId && (
            <ProductDetails
              productId={detailProductId}
              boutiqueId={detailBoutiqueId}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
