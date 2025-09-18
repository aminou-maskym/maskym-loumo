"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import * as XLSX from "xlsx";
import {
  Box,
  Button,
  Typography,
  Paper,
  Alert,
  LinearProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Stack,
  Chip,
  IconButton,
} from "@mui/material";
import UploadIcon from "@mui/icons-material/Upload";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
  Timestamp,
  getDoc,
} from "firebase/firestore";

/**
 * BulkProductImporter
 *
 * - Lit un fichier Excel / CSV
 * - Normalise les en-têtes (accepte variantes)
 * - Parse les champs numériques avec tolérance (espaces, virgules, symboles)
 * - Crée les fournisseurs manquants dans boutiques/{id}/suppliers (si nom fourni)
 * - Enregistre products avec supplierId et supplierName, numeroSerie (référence), stockMin, ptv/pta, etc.
 * - NOUVEAU: Enregistre également les données de chaque produit dans boutiques/{id}/entreeproduits/{productId}
 */

// Helper pour parse les nombres tolérants
function parseNumberValue(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  let s = String(value).trim();

  // Retirer symboles monétaires et lettres (garde chiffres, signes, virgule et point)
  s = s.replace(/[^\d\-,.\s]/g, "");

  // Retirer espaces
  s = s.replace(/\s+/g, "");

  // Si contient both '.' and ',' decide
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // "1.234,56"
      s = s.replace(/\./g, "");
      s = s.replace(",", ".");
    } else {
      // "1,234.56"
      s = s.replace(/,/g, "");
    }
  } else {
    s = s.replace(/,/g, ".");
  }

  // parse
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Helper pour parse date (gère numéro excel)
function parseDateValue(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    try {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const ms = (value - 0) * 24 * 60 * 60 * 1000;
      const d = new Date(epoch.getTime() + ms);
      if (!isNaN(d.getTime())) return d;
    } catch {}
    const maybe = new Date(value);
    return isNaN(maybe.getTime()) ? null : maybe;
  }
  const s = String(value).trim();
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;
  const re = s.replace(/\s/g, "");
  const parts = re.split(/[-\/\.]/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    const d = new Date(`${year}-${month}-${day}`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Normalize header to a key
function normalizeHeader(h: string): string {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire accents
    .replace(/[^a-z0-9]/g, "");
}

const EXPECTED_KEYS_MAP: { [k: string]: string[] } = {
  fournisseur: ["fournisseur", "supplier", "provider", "fournisseurnom"],
  date: ["date"],
  reference: ["reference", "referance", "refference", "sku", "numero", "numeroarticle", "numero_de_serie", "num", "ref"],
  designation: ["designation", "description", "nom", "product", "designationproduit"],
  unite: ["unite", "unit", "u"],
  mg: ["mg", "emplacement", "location"],
  stock: ["stock", "quantite", "qty", "quantity"],
  puv: ["puv", "pu_v", "prixu", "prixdevente", "prixvente", "prixuvente", "p.u.v", "puvstock"],
  pua: ["pua", "pu_a", "cout", "coutdachat", "p.u.a", "pu_achat"],
  ptv_stock: ["ptvstock", "ptv", "valeurventeinitiale", "ptv_stock", "valeurvente"],
  pta_stock: ["ptastock", "pta", "valeurachatinitiale", "pta_stock", "valeurachat"],
  stockmin: ["stockmin", "alerte", "stock_min", "stockmin_alert", "seuil", "seuilalerte"],
};

function mapHeaderToKey(normalized: string): string | null {
  for (const key of Object.keys(EXPECTED_KEYS_MAP)) {
    const aliases = EXPECTED_KEYS_MAP[key];
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

export default function BulkProductImporter() {
  const [user, loadingAuth] = useAuthState(auth);
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);

  // Find boutique id for current user (single read)
  const fetchBoutique = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setBoutiqueId(snap.docs[0].id);
      } else {
        setBoutiqueId(null);
      }
    } catch (err) {
      console.error("Erreur récupération boutique:", err);
      setBoutiqueId(null);
    }
  }, [user]);

  useEffect(() => {
    if (user && !loadingAuth) fetchBoutique();
  }, [user, loadingAuth, fetchBoutique]);

  // handle file selection
  const onFileChange = (f: File | null) => {
    setFile(f);
    setPreviewRows([]);
    setErrors([]);
    setSuccessCount(null);
  };

  // Parse excel and build preview
  const handleParse = async () => {
    if (!file) {
      setErrors(["Aucun fichier sélectionné."]);
      return;
    }
    setParsing(true);
    setErrors([]);
    setPreviewRows([]);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      if (!rows || rows.length < 2) {
        setErrors(["Feuille vide ou pas assez de lignes (au moins 2)"]);
        setParsing(false);
        return;
      }
      const headersRow: any[] = rows[0].map((h: any) => normalizeHeader(String(h || "")));
      const headerKeyMap: (string | null)[] = headersRow.map((nh) => mapHeaderToKey(nh));
      const parsedRows: any[] = [];
      const validationErrors: string[] = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0 || row.every((c: any) => c === null || c === undefined || String(c).trim() === "")) {
          continue;
        }
        const rec: any = { _rowNum: r + 1 };
        for (let c = 0; c < headersRow.length; c++) {
          const key = headerKeyMap[c];
          const raw = row[c];
          if (!key) continue;
          rec[key] = raw;
        }

        const designation = rec.designation ?? rec.reference ?? rec.fournisseur ?? null;
        const stockVal = parseNumberValue(rec.stock);
        const puaVal = parseNumberValue(rec.pua);
        const puvVal = parseNumberValue(rec.puv);
        const ptvStockVal = parseNumberValue(rec.ptv_stock);
        const ptaStockVal = parseNumberValue(rec.pta_stock);
        const stockMinVal = parseNumberValue(rec.stockmin);
        const dateVal = parseDateValue(rec.date);

        if (puaVal === null || Number.isNaN(puaVal)) {
          validationErrors.push(
            `Ligne ${rec._rowNum}: P.U.A invalide ou manquant ("${String(rec.pua ?? "")}")`
          );
        }
        if (stockVal === null || Number.isNaN(stockVal)) {
          validationErrors.push(
            `Ligne ${rec._rowNum}: STOCK invalide ou manquant ("${String(rec.stock ?? "")}")`
          );
        }

        const normalized = {
          _rowNum: rec._rowNum,
          fournisseur: rec.fournisseur ?? null,
          date: dateVal ? dateVal.toISOString() : null,
          numeroSerie: rec.reference ?? rec.ref ?? null,
          designation: designation,
          unite: rec.unite ?? null,
          emplacement: rec.mg ?? null,
          stock: stockVal !== null ? Math.round(stockVal) : null,
          puv: puvVal !== null ? puvVal : 0,
          pua: puaVal !== null ? puaVal : 0,
          ptv_stock: ptvStockVal !== null ? ptvStockVal : null,
          pta_stock: ptaStockVal !== null ? ptaStockVal : null,
          stockMin: stockMinVal !== null ? Math.round(stockMinVal) : null,
          raw: rec,
        };

        parsedRows.push(normalized);
      }

      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        setParsing(false);
        setPreviewRows(parsedRows.slice(0, 50));
        return;
      }

      setPreviewRows(parsedRows);
      setParsing(false);
    } catch (err) {
      console.error("Erreur parsing Excel:", err);
      setErrors([`Erreur lecture du fichier: ${(err as Error).message || String(err)}`]);
      setParsing(false);
    }
  };

  // Perform batch import with supplier creation and create entreeproduits docs per product
  const handleImport = async () => {
    setErrors([]);
    setSuccessCount(null);

    if (!file) {
      setErrors(["Aucun fichier sélectionné."]);
      return;
    }
    if (!previewRows || previewRows.length === 0) {
      setErrors(["Aucun enregistrement à importer. Veuillez parser le fichier d'abord et corriger les erreurs éventuelles."]);
      return;
    }
    if (!boutiqueId) {
      setErrors(["Impossible de trouver la boutique associée à votre compte. Vérifiez la configuration."]);
      return;
    }

    setImporting(true);
    try {
      // read user's fullName once (single read)
      let addedByName: string | null = null;
      if (user && user.uid) {
        try {
          const udoc = await getDoc(doc(db, "users", user.uid));
          if (udoc.exists()) {
            const ud = udoc.data() as any;
            addedByName = ud?.fullName ?? null;
          }
        } catch (e) {
          console.warn("Impossible de lire le profile utilisateur pour addedByName:", e);
        }
      }

      // 1) récupérer fournisseurs existants pour éviter doublons
      const suppliersSnap = await getDocs(collection(db, "boutiques", boutiqueId, "suppliers"));
      const suppliersMap = new Map<string, { id: string; nom: string }>();
      suppliersSnap.docs.forEach((d) => {
        const data = d.data() as any;
        const name = (data.nom ?? "").toString().trim();
        if (name) suppliersMap.set(name.toLowerCase(), { id: d.id, nom: name });
      });

      // 2) trouver fournisseurs manquants dans previewRows
      const missingSupplierNames = new Map<string, string>(); // lower -> original
      for (const r of previewRows) {
        const fn = (r.fournisseur ?? "")?.toString().trim();
        if (fn) {
          const low = fn.toLowerCase();
          if (!suppliersMap.has(low) && !missingSupplierNames.has(low)) {
            missingSupplierNames.set(low, fn);
          }
        }
      }

      // 3) créer fournisseurs manquants (si besoin) en un batch
      if (missingSupplierNames.size > 0) {
        const supBatch = writeBatch(db);
        const createdMap: { [k: string]: { id: string; nom: string } } = {};
        for (const [low, orig] of missingSupplierNames.entries()) {
          const newSupRef = doc(collection(db, "boutiques", boutiqueId, "suppliers"));
          const supData = { nom: orig, telephone: "", adresse: "", createdAt: Timestamp.now() };
          supBatch.set(newSupRef, supData);
          createdMap[low] = { id: newSupRef.id, nom: orig };
        }
        await supBatch.commit();
        for (const low of Object.keys(createdMap)) {
          suppliersMap.set(low, createdMap[low]);
        }
      }

      // 4) Import produits en batch (en respectant limite)
      let batch = writeBatch(db);
      let opsCounter = 0; // compte le nombre d'opérations dans le batch (chaque set compte comme 1)
      let totalImported = 0;

      for (const row of previewRows) {
        const productRef = doc(collection(db, "boutiques", boutiqueId, "products"));

        const supplierNameRaw = (row.fournisseur ?? "")?.toString().trim();
        const supplierLower = supplierNameRaw ? supplierNameRaw.toLowerCase() : null;
        const supplierEntry = supplierLower ? suppliersMap.get(supplierLower) : null;

        const productData: any = {
          nom: (row.designation ?? "Sans désignation")?.toString(),
          numeroSerie: row.numeroSerie ?? null,
          supplierId: supplierEntry ? supplierEntry.id : null,
          supplierName: supplierEntry ? supplierEntry.nom : (supplierNameRaw || null),
          emplacement: row.emplacement ?? null,
          unite: row.unite ?? null,
          stock: Number(row.stock ?? 0),
          prix: Number(row.puv ?? 0),
          cout: Number(row.pua ?? 0),
          ptv_stock: row.ptv_stock ?? null,
          pta_stock: row.pta_stock ?? null,
          stockMin: row.stockMin ?? null,
          createdAt: row.date ? Timestamp.fromDate(new Date(row.date)) : Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        // set product
        batch.set(productRef, productData);
        opsCounter += 1;

        // --- NOUVEAU: enregistrer également la donnée dans entreeproduits
        const entryRef = doc(db, "boutiques", boutiqueId, "entreeproduits", productRef.id);
        const entryData = {
          productId: productRef.id,
          productName: productData.nom,
          numeroSerie: productData.numeroSerie,
          quantity: Number(row.stock ?? 0),
          prix: productData.prix,
          cout: productData.cout,
          stockMin: productData.stockMin,
          supplierId: productData.supplierId ?? null,
          supplierName: productData.supplierName ?? null,
          unite: productData.unite ?? null,
          emplacement: productData.emplacement ?? null,
          addedByUid: user?.uid ?? null,
          addedByName: addedByName ?? null,
          createdAt: Timestamp.now(),
        };
        batch.set(entryRef, entryData);
        opsCounter += 1;

        totalImported++;

        // commit every ~400 ops and create a fresh batch (safe below 500 limit)
        if (opsCounter >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          opsCounter = 0;
        }
      }

      // final commit if any pending
      if (opsCounter > 0) await batch.commit();

      setSuccessCount(totalImported);
      setPreviewRows([]);
      setFile(null);
    } catch (err) {
      console.error("Erreur import batch:", err);
      setErrors([`Erreur d'import: ${(err as Error).message || String(err)}`]);
    } finally {
      setImporting(false);
    }
  };

  // Generate and download an Excel template
  const downloadTemplate = () => {
    const headers = [
      "FOURNISSEUR",
      "DATE",
      "REFFERENCE",
      "DESIGNATION",
      "UNITE",
      "MG",
      "STOCK",
      "P.U.V",
      "P.U.A",
      "P.T.V STOCK",
      "P.T.A STOCK",
      "STOCKMIN",
    ];
    const sampleRow = [
      "Fournisseur Exemple",
      new Date().toLocaleDateString("fr-FR"),
      "SKU-001",
      "Produit Exemple",
      "pièce",
      "A1",
      10,
      2500.5,
      1500.25,
      25005,
      15002.5,
      5,
    ];
    const wsData = [headers, sampleRow];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "modele");
    XLSX.writeFile(wb, "import_produits_modele.xlsx");
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: 2 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Importation en masse de produits</Typography>
        </Stack>

        <Box sx={{ mt: 2, display: "flex", gap: 2, alignItems: "center" }}>
          <Button variant="contained" component="label" startIcon={<UploadIcon />}>
            Choisir fichier Excel (.xlsx/.csv)
            <input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
          </Button>

          <Button variant="outlined" onClick={handleParse} disabled={!file || parsing}>
            {parsing ? "Analyse en cours..." : "Analyser le fichier"}
          </Button>

          <Button color="success" variant="contained" onClick={handleImport} disabled={importing || previewRows.length === 0}>
            {importing ? "Import en cours..." : "Importer vers Firestore"}
          </Button>

          <Button variant="text" startIcon={<DownloadIcon />} onClick={downloadTemplate}>
            Modèle
          </Button>

          {file && (
            <Box sx={{ ml: 2 }}>
              <Typography variant="body2">Fichier: {file.name} ({Math.round(file.size / 1024)} KB)</Typography>
            </Box>
          )}
        </Box>

        {parsing && <Box sx={{ mt: 2 }}><LinearProgress /></Box>}
        {importing && <Box sx={{ mt: 2 }}><LinearProgress color="secondary" /></Box>}

        {errors.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="error" onClose={() => setErrors([])}>
              <strong>Erreurs détectées :</strong>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}><Typography variant="body2">{e}</Typography></li>
                ))}
              </ul>
              <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                Corrigez le fichier ou les formats (par exemple, utilisez <code>1 234,56</code> ou <code>1234.56</code> pour les nombres), puis relancez l'analyse.
              </Typography>
            </Alert>
          </Box>
        )}

        {successCount !== null && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success">Import terminé : {successCount} produits ajoutés.</Alert>
          </Box>
        )}
      </Paper>

      {previewRows.length > 0 && (
        <Paper sx={{ p: 2, mb: 4 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle1">Aperçu (max {previewRows.length} lignes)</Typography>
            <IconButton color="error" onClick={() => { setPreviewRows([]); setErrors([]); }}>
              <DeleteIcon />
            </IconButton>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ligne</TableCell>
                <TableCell>Désignation</TableCell>
                <TableCell>Réf (numeroSerie)</TableCell>
                <TableCell>Fournisseur</TableCell>
                <TableCell>Stock</TableCell>
                <TableCell>P.U.V</TableCell>
                <TableCell>P.U.A</TableCell>
                <TableCell>PTV stock</TableCell>
                <TableCell>PTA stock</TableCell>
                <TableCell>StockMin</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {previewRows.map((r: any, idx: number) => (
                <TableRow key={idx}>
                  <TableCell>{r._rowNum}</TableCell>
                  <TableCell>{r.designation}</TableCell>
                  <TableCell>{r.numeroSerie}</TableCell>
                  <TableCell>{r.fournisseur}</TableCell>
                  <TableCell>{r.stock}</TableCell>
                  <TableCell>{r.puv}</TableCell>
                  <TableCell>{r.pua}</TableCell>
                  <TableCell>{r.ptv_stock ?? "-"}</TableCell>
                  <TableCell>{r.pta_stock ?? "-"}</TableCell>
                  <TableCell>{r.stockMin ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

    </Box>
  );
}
