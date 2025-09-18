"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  Timestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  IconButton,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Tooltip,
  Button,
  Divider,
  CircularProgress,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import SearchIcon from "@mui/icons-material/Search";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";

// Component: Affiche l'historique des entrées de produits (collection: boutiques/{id}/entreeproduits)
// Simplifié : n'affiche que Produit, Quantité, Ajouté par, Date

type EntryDoc = {
  id: string;
  productId: string;
  productName?: string;
  quantity?: number | null;
  addedByName?: string | null;
  addedByUid?: string | null;
  createdAt?: any;
  [k: string]: any;
};

export default function EntreeProduitsHistory() {
  const [user, loadingAuth] = useAuthState(auth);

  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [rows, setRows] = useState<EntryDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // pagination / cursors
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const [lastDocCursors, setLastDocCursors] = useState<any[]>([]); // for UI
  const lastDocRef = useRef<any[]>([]); // actual ref used inside callbacks to avoid dependency loops
  const [hasNext, setHasNext] = useState(false);

  // sorting
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // search (client-side on loaded page)
  const [searchText, setSearchText] = useState("");

  // find boutique id once (single read similar to previous components)
  const fetchBoutiqueId = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) setBoutiqueId(snap.docs[0].id);
      else setBoutiqueId(null);
    } catch (err) {
      console.error("Erreur récupération boutique:", err);
      setError("Impossible de récupérer la boutique.");
      setBoutiqueId(null);
    }
  }, [user]);

  useEffect(() => {
    if (user && !loadingAuth) fetchBoutiqueId();
  }, [user, loadingAuth, fetchBoutiqueId]);

  const formatDate = (value: any) => {
    if (!value) return "-";
    try {
      if (value instanceof Timestamp) return value.toDate().toLocaleString("fr-FR");
      if (value.toDate && typeof value.toDate === "function") return value.toDate().toLocaleString("fr-FR");
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleString("fr-FR");
    } catch {}
    return String(value);
  };

  // build query and fetch a page
  const fetchPage = useCallback(async (pageNumber: number, resetCursors = false) => {
    if (!boutiqueId) {
      // ensure loading is false when no boutique
      setRows([]);
      setHasNext(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const colRef = collection(db, "boutiques", boutiqueId, "entreeproduits");

      // build base query
      let baseQuery: any;
      try {
        baseQuery = query(colRef, orderBy(sortField, sortDir), firestoreLimit(pageSize));
      } catch (err) {
        console.warn("orderBy failed, fallback to createdAt:", err);
        baseQuery = query(colRef, orderBy("createdAt", "desc"), firestoreLimit(pageSize));
      }

      let q = baseQuery;

      // apply cursor if page > 1: use ref to avoid dependency loop
      if (pageNumber > 1 && lastDocRef.current[pageNumber - 2]) {
        q = query(colRef, orderBy(sortField, sortDir), startAfter(lastDocRef.current[pageNumber - 2]), firestoreLimit(pageSize));
      }

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as EntryDoc));

      setRows(docs);

      // update cursors both state and ref
      const newCursors = resetCursors ? [] : [...lastDocRef.current];
      if (snap.docs.length > 0) {
        const last = snap.docs[snap.docs.length - 1];
        newCursors[pageNumber - 1] = last;
      }
      lastDocRef.current = newCursors;
      setLastDocCursors(newCursors);

      // determine if there's a next page
      if (snap.docs.length < pageSize) {
        setHasNext(false);
      } else {
        const nextQuery = snap.docs.length
          ? query(colRef, orderBy(sortField, sortDir), startAfter(snap.docs[snap.docs.length - 1]), firestoreLimit(1))
          : query(colRef, orderBy(sortField, sortDir), firestoreLimit(1));
        const nextSnap = await getDocs(nextQuery);
        setHasNext(!nextSnap.empty);
      }

      setPage(pageNumber);
    } catch (err: any) {
      console.error("Erreur fetchPage:", err);
      setError((err && err.message) || "Erreur lors de la récupération des données.");
    } finally {
      setLoading(false);
    }
  }, [boutiqueId, sortField, sortDir]);

  // initial load or when boutiqueId/sort changes -> reset to page 1
  useEffect(() => {
    if (!boutiqueId) return;
    // reset cursors and fetch first page
    lastDocRef.current = [];
    setLastDocCursors([]);
    fetchPage(1, true);
  }, [boutiqueId, sortField, sortDir, fetchPage]);

  const handleNext = () => {
    if (!hasNext) return;
    fetchPage(page + 1);
  };
  const handlePrev = () => {
    if (page <= 1) return;
    fetchPage(page - 1);
  };
  const handleFirst = () => fetchPage(1, true);
  const handleLast = async () => {
    setLoading(true);
    try {
      let currentPage = 1;
      let cursors: any[] = [];
      while (true) {
        const colRef = collection(db, "boutiques", boutiqueId!, "entreeproduits");
        const q = cursors.length === 0
          ? query(colRef, orderBy(sortField, sortDir), firestoreLimit(pageSize))
          : query(colRef, orderBy(sortField, sortDir), startAfter(cursors[cursors.length - 1]), firestoreLimit(pageSize));
        const snap = await getDocs(q);
        if (snap.docs.length === 0) break;
        cursors.push(snap.docs[snap.docs.length - 1]);
        if (snap.docs.length < pageSize) {
          const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as EntryDoc));
          setRows(docs);
          setPage(currentPage);
          lastDocRef.current = cursors;
          setLastDocCursors(cursors);
          setHasNext(false);
          break;
        }
        currentPage++;
        if (cursors.length > 1000) break;
      }
    } catch (err) {
      console.error("Erreur handleLast:", err);
      setError("Impossible d'accéder à la dernière page (coûts potentiels). Utilisez navigation par pages.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // filtered rows based on search text (client-side)
  const filteredRows = useMemo(() => {
    if (!searchText) return rows;
    const s = searchText.toLowerCase();
    return rows.filter((r) => (r.productName || "").toLowerCase().includes(s) || (r.addedByName || "").toLowerCase().includes(s));
  }, [rows, searchText]);

  // export current page (filteredRows) to Excel - only essential columns
  const downloadExcel = (all = false) => {
    const toExport = all ? rows : filteredRows;
    if (!toExport || toExport.length === 0) return;
    const wsData = [
      ["Produit", "Quantité", "Ajouté par", "Date"],
      ...toExport.map((r) => [r.productName ?? "-", r.quantity ?? 0, r.addedByName ?? r.addedByUid ?? "-", formatDate(r.createdAt)])
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "entrees_produits");
    XLSX.writeFile(wb, `entreeproduits_page_${page}.xlsx`);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: 2 }}>
      <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 6, background: "linear-gradient(135deg,#f6f8ff 0%,#f0fff7 100%)" }}>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <HistoryEduIcon sx={{ fontSize: 36, color: "primary.main" }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>Historique des entrées</Typography>
              <Typography variant="body2" color="text.secondary">Affiche les entrées de produits </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField size="small" placeholder="Rechercher produit / ajouté par" value={searchText} onChange={(e) => setSearchText(e.target.value)} InputProps={{ startAdornment: <SearchIcon /> }} />
            <Tooltip title="Télécharger page affichée">
              <IconButton color="primary" onClick={() => downloadExcel(false)}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Télécharger toutes les entrées visibles ">
              <Button variant="contained" color="secondary" onClick={() => downloadExcel(true)}>Exporter</Button>
            </Tooltip>
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ minHeight: 200, position: "relative" }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 160 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ cursor: "pointer" }} onClick={() => toggleSort("productName")}>
                    Produit {sortField === "productName" ? (sortDir === "asc" ? <ArrowUpwardIcon fontSize="small"/> : <ArrowDownwardIcon fontSize="small"/>) : null}
                  </TableCell>
                  <TableCell onClick={() => toggleSort("quantity")} sx={{ cursor: "pointer" }}>Quantité {sortField === "quantity" ? (sortDir === "asc" ? <ArrowUpwardIcon fontSize="small"/> : <ArrowDownwardIcon fontSize="small"/>) : null}</TableCell>
                  <TableCell onClick={() => toggleSort("addedByName")} sx={{ cursor: "pointer" }}>Ajouté par</TableCell>
                  <TableCell onClick={() => toggleSort("createdAt")} sx={{ cursor: "pointer" }}>Date {sortField === "createdAt" ? (sortDir === "asc" ? <ArrowUpwardIcon fontSize="small"/> : <ArrowDownwardIcon fontSize="small"/>) : null}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow><TableCell colSpan={4}><Typography align="center" color="text.secondary">Aucune entrée trouvée</Typography></TableCell></TableRow>
                ) : (
                  filteredRows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip label={r.productName ?? "-"} color="primary" size="small" />
                        </Stack>
                      </TableCell>
                      <TableCell>{r.quantity ?? 0}</TableCell>
                      <TableCell>{r.addedByName ?? r.addedByUid ?? "-"}</TableCell>
                      <TableCell>{formatDate(r.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Box>

        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Première page">
              <span>
                <IconButton onClick={handleFirst} disabled={page === 1 || loading}>
                  <FirstPageIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Page précédente">
              <span>
                <IconButton onClick={handlePrev} disabled={page === 1 || loading}>
                  <NavigateBeforeIcon />
                </IconButton>
              </span>
            </Tooltip>

            <Typography variant="body2" sx={{ px: 1, lineHeight: '36px' }}>Page {page}</Typography>

            <Tooltip title="Page suivante">
              <span>
                <IconButton onClick={handleNext} disabled={!hasNext || loading}>
                  <NavigateNextIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Dernière page (peut générer plusieurs lectures)">
              <span>
                <IconButton onClick={handleLast} disabled={loading}>
                  <LastPageIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          <Typography variant="caption" color="text.secondary">Limite: {pageSize} / page .</Typography>
        </Stack>

        {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}
      </Paper>
    </Box>
  );
}
