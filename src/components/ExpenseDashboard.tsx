// src/components/ExpenseDashboard.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  doc,
  Timestamp,
  getDocs,
  orderBy,
  limit as queryLimit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Stack,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import LabelIcon from "@mui/icons-material/Label";
import PersonIcon from "@mui/icons-material/Person";
import StorefrontIcon from "@mui/icons-material/Storefront";
import PaymentIcon from "@mui/icons-material/Payment";
import DescriptionIcon from "@mui/icons-material/Description";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Depense {
  id: string;
  montant: number;
  categorie: string; // category id
  modePaiement: string;
  beneficiaire: string;
  description?: string | null;
  createdBy: string;
  createdAt: Timestamp;
  date?: Timestamp; // parfois un champ 'date' distinct
}

interface User { fullName: string; }
interface Cat  { nom: string; }

const CHART_COLORS = ['#4A90E2', '#50E3C2', '#9013FE', '#F5A623', '#F8E71C'];

const PAGE_SIZE = 10;

export default function ExpenseDashboard() {
  const theme = useTheme();

  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId,   setBoutiqueId]   = useState<string | null>(null);
  const [boutiqueName, setBoutiqueName] = useState<string>("");
  const [logoUrl,      setLogoUrl]      = useState<string>("");

  // paginated expenses
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // maps
  const [usersMap, setUsersMap] = useState<Record<string,User>>({});
  const [catsMap,  setCatsMap]  = useState<Record<string,Cat>>({});

  // UI states
  const [period,  setPeriod]  = useState<"week"|"month"|"year"|"all">("month");
  const [current, setCurrent] = useState<Depense|null>(null);

  // sorting
  type SortField = "createdAt" | "montant" | "categorie";
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc"); // default recent first

  // helper to convert logo to data URL for PDF
  const getImageDataUrl = async (url: string): Promise<string> => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject("Erreur lecture logo");
      reader.readAsDataURL(blob);
    });
  };

  // --- Helpers période pour requête Firestore ---
  const getRangeForPeriod = useCallback((period: typeof period) => {
    const now = new Date();
    if (period === "week") {
      const start = new Date(now.getTime() - 7 * 24 * 3600_000);
      return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(now) };
    }
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
    }
    if (period === "year") {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
    }
    return null; // all
  }, []);

  // Formatters
  const formatAmount = (amount: number) => {
    try {
      return new Intl.NumberFormat("fr-FR", {
        style: "decimal",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return amount.toFixed(2);
    }
  };
  const formatAmountPDF = (amount: number) => {
    const fixed = amount.toFixed(2);
    const parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(",");
  };

  // --- Fetch boutique id + metadata once user available (unchanged logic) ---
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const qB = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );
    const unsubB = onSnapshot(qB, async snap => {
      if (!snap.empty) {
        const bId = snap.docs[0].id;
        setBoutiqueId(bId);
        const bDoc = await getDoc(doc(db, "boutiques", bId));
        const data = bDoc.data() || {};
        if (data.nom)      setBoutiqueName(data.nom);
        if (data.logoUrl)  setLogoUrl(data.logoUrl);

        // fetch users map (snapshot to keep up-to-date)
        const unsubUsers = onSnapshot(collection(db, "users"), snapU => {
          const m: Record<string,User> = {};
          snapU.docs.forEach(dUser => {
            m[dUser.id] = { fullName: (dUser.data().fullName as string) || "Utilisateur inconnu" };
          });
          setUsersMap(m);
        }, (e) => console.error("Erreur users:", e));

        // categories snapshot
        const unsubCategories = onSnapshot(collection(db, "boutiques", bId, "expenseCategories"), snapC => {
          const m: Record<string,Cat> = {};
          snapC.docs.forEach(dCat => {
            m[dCat.id] = { nom: (dCat.data().nom as string) || "Catégorie inconnue" };
          });
          setCatsMap(m);
        }, (e) => console.error("Erreur categories:", e));

        // Kick off initial paginated fetch
        // we don't return here because we need to keep unsub functions
        setDepenses([]);
        setLastVisible(null);
        setHasMore(true);
        setLoading(false);

        // cleanup: when boutique changes, unsubscribe users/categories
        return () => {
          unsubUsers(); unsubCategories();
        };
      } else {
        setLoading(false);
        console.log("Aucune boutique trouvée pour cet utilisateur.");
      }
    }, (error) => {
      console.error("Erreur lecture boutique:", error);
      setLoading(false);
    });
    return () => unsubB();
  }, [user]);

  // --- Fetch expenses paginated ---
  const fetchExpenses = useCallback(async (reset = false) => {
    if (!boutiqueId || !user) return;
    try {
      if (reset) {
        setLoading(true);
        setDepenses([]);
        setLastVisible(null);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      // base ref
      const collRef = collection(db, "boutiques", boutiqueId, "expenses");

      // apply period range if any
      const range = getRangeForPeriod(period);

      // build query ordering and where clauses
      const clauses: any[] = [];
      if (range) {
        clauses.push(where("createdAt", ">=", range.start));
        clauses.push(where("createdAt", "<=", range.end));
      }

      // determine orderBy field(s)
      if (sortField === "createdAt") {
        clauses.push(orderBy("createdAt", sortDir));
      } else if (sortField === "montant") {
        clauses.push(orderBy("montant", sortDir));
        // secondary ordering for determinism
        clauses.push(orderBy("createdAt", "desc"));
      } else if (sortField === "categorie") {
        clauses.push(orderBy("categorie", sortDir));
        clauses.push(orderBy("createdAt", "desc"));
      }

      // pagination limit
      clauses.push(queryLimit(PAGE_SIZE));

      // startAfter if not reset
      if (!reset && lastVisible) {
        // the startAfter clause must be added after orderBy in query composition,
        // so we'll create query with startAfter when needed
      }

      // create query
      let q;
      if (!reset && lastVisible) {
        q = query(collRef, ...clauses.slice(0, -1), startAfter(lastVisible), clauses[clauses.length - 1]);
        // Note: simpler approach below is robust:
        // q = query(collRef, ...clauses, startAfter(lastVisible));
      } else {
        q = query(collRef, ...clauses);
      }

      // Firestore limitation: building dynamic query with startAfter at arbitrary position is brittle.
      // To be safe, rebuild a clean clauses array and append startAfter as last arg when needed:
      const baseClauses: any[] = [];
      if (range) {
        baseClauses.push(where("createdAt", ">=", range.start));
        baseClauses.push(where("createdAt", "<=", range.end));
      }
      if (sortField === "createdAt") {
        baseClauses.push(orderBy("createdAt", sortDir));
      } else if (sortField === "montant") {
        baseClauses.push(orderBy("montant", sortDir));
        baseClauses.push(orderBy("createdAt", "desc"));
      } else {
        baseClauses.push(orderBy("categorie", sortDir));
        baseClauses.push(orderBy("createdAt", "desc"));
      }
      // append limit
      if (!reset && lastVisible) {
        // include startAfter
        q = query(collRef, ...baseClauses, startAfter(lastVisible), queryLimit(PAGE_SIZE));
      } else {
        q = query(collRef, ...baseClauses, queryLimit(PAGE_SIZE));
      }

      const snap = await getDocs(q);
      const docs = snap.docs;
      const items: Depense[] = docs.map(dDoc => {
        const raw = dDoc.data();
        // prefer 'createdAt' field, fallback to 'date'
        const createdAt: Timestamp = raw.createdAt instanceof Timestamp ? raw.createdAt : (raw.date instanceof Timestamp ? raw.date : Timestamp.fromDate(new Date(raw.createdAt || raw.date || Date.now())));
        return {
          id: dDoc.id,
          montant: Number(raw.montant || 0),
          categorie: raw.categorie || raw.categorieId || "",
          modePaiement: raw.modePaiement || raw.mode || "",
          beneficiaire: raw.beneficiaire || raw.beneficiaireName || raw.beneficiar || "",
          description: raw.description ?? null,
          createdBy: raw.createdBy || raw.createdById || "",
          createdAt,
          date: raw.date instanceof Timestamp ? raw.date : undefined,
        } as Depense;
      });

      // update lastVisible
      const last = docs[docs.length - 1] || null;
      setLastVisible(last);
      setHasMore(docs.length === PAGE_SIZE);

      if (reset) {
        setDepenses(items);
      } else {
        setDepenses(prev => [...prev, ...items]);
      }
    } catch (err) {
      console.error("Erreur fetchExpenses:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [boutiqueId, user, period, sortField, sortDir, lastVisible, getRangeForPeriod]);

  // fetch initial (when boutiqueId, period, sort change) -> reset
  useEffect(() => {
    if (!boutiqueId || !user) return;
    // reset pagination
    setDepenses([]);
    setLastVisible(null);
    setHasMore(true);
    void fetchExpenses(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boutiqueId, user, period, sortField, sortDir]);

  // load more handler
  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    await fetchExpenses(false);
  };

  // Derived filtered for UI charts: here we use the paginated items loaded
  const filtered = useMemo(() => {
    // Because we apply period server-side, the current 'depenses' should already match the period.
    // Still keep a safety filter to ensure timestamp validity.
    return depenses.filter(d => d && d.createdAt && typeof d.createdAt.toDate === "function");
  }, [depenses]);

  const total = useMemo(() => filtered.reduce((s, d) => s + d.montant, 0), [filtered]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(d => {
      const catName = catsMap[d.categorie]?.nom || "Non catégorisé";
      map[catName] = (map[catName] || 0) + d.montant;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filtered, catsMap]);

  const byMonth = useMemo(() => {
    const map: Record<string, { montant: number; count: number }> = {};
    const currentYear = new Date().getFullYear();
    filtered.forEach(d => {
      const dt = d.createdAt.toDate();
      const key = dt.toLocaleString("fr-FR", { month: "short", year: undefined });
      if (!map[key]) map[key] = { montant: 0, count: 0 };
      map[key].montant += d.montant;
      map[key].count += 1;
    });
    return Object.entries(map).map(([month, data]) => ({ month, montant: data.montant }));
  }, [filtered]);

  // export PDF uses currently loaded filtered items
  const exportPDF = async () => {
    const docPdf = new jsPDF({ unit: "pt" });
    if (logoUrl) {
      try {
        const img = await getImageDataUrl(logoUrl);
        docPdf.addImage(img, "PNG", 40, 30, 40, 40);
      } catch (e) {
        console.error("Erreur chargement logo pour PDF:", e);
      }
    }
    docPdf.setFontSize(18);
    docPdf.text(boutiqueName || "Ma Boutique", logoUrl ? 100 : 40, 50);
    docPdf.setFontSize(12);
    docPdf.text(
      `Liste des dépenses (${period === "week" ? "Cette semaine"
        : period === "month" ? "Ce mois"
        : period === "year" ? "Cette année"
        : "Toutes les périodes"})`,
      40, 80
    );
    autoTable(docPdf, {
      startY: 100,
      head: [["Date","Montant","Catégorie","Bénéficiaire","Créé par", "Description"]],
      body: filtered.map(d => [
        d.createdAt.toDate().toLocaleDateString("fr-FR"),
        formatAmountPDF(d.montant),
        catsMap[d.categorie]?.nom || "—",
        d.beneficiaire || "—",
        (usersMap[d.createdBy]?.fullName) || "—",
        d.description || "—",
      ]),
      headStyles: { fillColor: [74,144,226] },
      styles: { fontSize: 9 },
      theme: 'grid',
    });
    const finalY = (docPdf as any).lastAutoTable?.finalY || 0;
    docPdf.setFontSize(12);
    docPdf.text(`Total des dépenses (page chargée) : ${formatAmountPDF(total)}`, 40, finalY + 30);
    docPdf.save(`depenses_${boutiqueName.replace(/\s+/g, '_') || 'rapport'}_${period}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Sorting header click
  const onHeaderClick = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      // sensible default: date desc, montant desc, categorie asc
      setSortDir(field === "categorie" ? "asc" : "desc");
    }
  };

  // UI early returns
  if (loadingAuth || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
        <Typography ml={2}>Chargement des données...</Typography>
      </Box>
    );
  }
  if (!user) {
    return (
      <Box textAlign="center" py={6}>
        <Typography variant="h6">Veuillez vous connecter pour voir le tableau de bord.</Typography>
      </Box>
    );
  }
  if (!boutiqueId && !loading) {
     return (
      <Box textAlign="center" py={6}>
        <Typography variant="h6">Aucune boutique n&apos;est associée à votre compte.</Typography>
        <Typography>Veuillez contacter l&apos;administrateur.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      p: { xs: 1, sm: 2, md: 3 },
      bgcolor: theme.palette.background.default,
      minHeight: "100vh"
    }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
            <AccountBalanceWalletIcon sx={{
            fontSize: { xs: 30, sm: 36 },
            color: theme.palette.primary.main,
            p: 1,
            bgcolor: theme.palette.action.hover,
            borderRadius: 2,
            }}/>
            <Typography variant="h5" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              Gestion des Dépenses
            </Typography>
        </Stack>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          startIcon={<PictureAsPdfIcon />}
          sx={{
            bgcolor: theme.palette.secondary.main,
            '&:hover': { bgcolor: theme.palette.secondary.dark },
            borderRadius: 2,
            px: { xs: 2, sm: 3 },
            py: { xs: 0.8, sm: 1 },
            textTransform: 'none',
            fontSize: { xs: '0.8rem', sm: '0.9rem' }
          }}
          onClick={exportPDF}
          disabled={filtered.length === 0}
        >
          Exporter PDF
        </Button>
      </Stack>

      <Paper sx={{ p: 2, mb: 3, bgcolor: theme.palette.background.paper, borderRadius: 3, boxShadow: 1 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" spacing={{xs: 2, md: 3}}>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(_, v) => v && setPeriod(v as "week"|"month"|"year"|"all")}
            aria-label="Période des dépenses"
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                px: { xs: 1.5, sm: 2 },
                py: 0.8,
                textTransform: 'none',
                '&.Mui-selected': {
                  bgcolor: theme.palette.primary.main,
                  color: 'white',
                  '&:hover': { bgcolor: theme.palette.primary.dark },
                },
                '&:not(.Mui-selected)': { color: theme.palette.text.secondary },
              }
            }}
          >
            <ToggleButton value="week">Semaine</ToggleButton>
            <ToggleButton value="month">Mois</ToggleButton>
            <ToggleButton value="year">Année</ToggleButton>
            <ToggleButton value="all">Tout</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ ml: { md: 'auto' }, mt: { xs: 2, md: 0 }, p: 1.5, bgcolor: theme.palette.action.selected, borderRadius: 2, textAlign: 'center', minWidth: {xs: '100%', sm: 200} }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Total {period === 'week' ? 'de la semaine' : period === 'month' ? 'du mois' : period === 'year' ? "de l'année" : 'global'}
            </Typography>
            <Typography variant="h5" color="primary.main" sx={{fontWeight: 600}}>
              {formatAmount(total)}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {filtered.length > 0 ? (
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} lg={6}>
            <Paper sx={{ p: {xs: 1.5, sm: 2}, height: { xs: 280, sm: 350 }, borderRadius: 3, bgcolor: theme.palette.background.paper, boxShadow: 1 }}>
              <Typography variant="h6" mb={1} color="text.primary">Par Catégories</Typography>
              {byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="85%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="50%" outerRadius="75%" paddingAngle={2} labelLine={false}>
                      {byCategory.map((_, i) => <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <ReTooltip formatter={(value: number) => formatAmount(value)} contentStyle={{ borderRadius: 8, boxShadow: `0 2px 10px ${theme.palette.action.disabled}`, border: 'none', background: theme.palette.background.paper }} />
                    <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '0.8rem'}} formatter={value => (<span style={{ color: theme.palette.text.secondary, display: 'inline-block', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box display="flex" justifyContent="center" alignItems="center" height="100%"><Typography color="text.secondary">Aucune dépense pour cette période.</Typography></Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} lg={6}>
            <Paper sx={{ p: {xs: 1.5, sm: 2}, height: { xs: 280, sm: 350 }, borderRadius: 3, bgcolor: theme.palette.background.paper, boxShadow: 1 }}>
              <Typography variant="h6" mb={1} color="text.primary">Évolution (Dépenses)</Typography>
              {byMonth.filter(m => m.montant > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={byMonth} margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorGradientArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider}/>
                    <XAxis dataKey="month" tick={{ fill: theme.palette.text.secondary, fontSize: '0.75rem' }} tickLine={{ stroke: theme.palette.divider }} axisLine={{ stroke: theme.palette.divider }}/>
                    <YAxis tickFormatter={(value) => {
                      if (value === 0) return "0";
                      if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                      if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`;
                      return `${value}`;
                    }} tick={{ fill: theme.palette.text.secondary, fontSize: '0.75rem' }} width={80}/>
                    <ReTooltip formatter={(value: number) => formatAmount(value)} labelFormatter={(label: string) => `Mois: ${label}`} contentStyle={{ borderRadius: 8, boxShadow: `0 2px 10px ${theme.palette.action.disabled}`, border: 'none', background: theme.palette.background.paper }} />
                    <Line type="monotone" dataKey="montant" stroke={theme.palette.primary.main} strokeWidth={2} dot={{ fill: theme.palette.primary.main, r: 3 }} activeDot={{ r: 5, strokeWidth: 2 }}/>
                    <Area type="monotone" dataKey="montant" fill="url(#colorGradientArea)" stroke="none"/>
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Box display="flex" justifyContent="center" alignItems="center" height="100%"><Typography color="text.secondary">Pas de données pour le graphique d'évolution.</Typography></Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      ) : (
        <Paper sx={{ p:3, mb:3, textAlign:'center', boxShadow:1, borderRadius: 3}}>
          <Typography variant="h6" color="text.secondary">Aucune dépense à afficher pour la période sélectionnée.</Typography>
          <Typography color="text.disabled">Essayez de sélectionner une autre période ou d'ajouter des dépenses.</Typography>
        </Paper>
      )}

      {/* Table triable + pagination */}
      <Paper sx={{ borderRadius: 3, boxShadow: 1, overflowX: 'auto', bgcolor: theme.palette.background.paper }}>
        <Table sx={{
          minWidth: 700,
          '& .MuiTableCell-root': { py: 1.5, borderColor: theme.palette.divider },
          '& .MuiTableHead-root .MuiTableCell-root': { backgroundColor: theme.palette.action.hover, fontWeight: 'bold', color: theme.palette.text.secondary }
        }}>
          <TableHead>
            <TableRow>
              <TableCell onClick={() => onHeaderClick("createdAt")} sx={{ cursor: 'pointer' }}>
                Date {sortField === "createdAt" ? (sortDir === "desc" ? "▾" : "▴") : ""}
              </TableCell>
              <TableCell onClick={() => onHeaderClick("montant")} sx={{ cursor: 'pointer' }}>
                Montant {sortField === "montant" ? (sortDir === "desc" ? "▾" : "▴") : ""}
              </TableCell>
              <TableCell onClick={() => onHeaderClick("categorie")} sx={{ cursor: 'pointer' }}>
                Catégorie {sortField === "categorie" ? (sortDir === "desc" ? "▾" : "▴") : ""}
              </TableCell>
              <TableCell>Payé à</TableCell>
              <TableCell>Créé par</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {filtered.length > 0 ? filtered.map(d => (
              <TableRow key={d.id} hover sx={{ '&:last-child td, &:last-child th': { borderBottom: 0 } }}>
                <TableCell>
                  <Typography variant="body2">{d.createdAt.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric'})}</Typography>
                  <Typography variant="caption" color="text.secondary">{d.createdAt.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Typography>
                </TableCell>

                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.error.dark }}>{formatAmount(d.montant)}</Typography>
                </TableCell>

                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="body2">{catsMap[d.categorie]?.nom || "N/A"}</Typography>
                  </Stack>
                </TableCell>

                <TableCell><Typography variant="body2">{d.beneficiaire || "N/A"}</Typography></TableCell>

                <TableCell><Typography variant="body2">{usersMap[d.createdBy]?.fullName || "N/A"}</Typography></TableCell>

                <TableCell>
                  <IconButton size="small" onClick={() => setCurrent(d)} title="Voir détails" sx={{ '&:hover': { bgcolor: theme.palette.action.hover } }}>
                    <InfoOutlinedIcon fontSize="small" color="primary"/>
                  </IconButton>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py:5 }}>
                  <Typography color="text.secondary">Aucune dépense trouvée pour cette période.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {`Affichage ${depenses.length} élément(s) chargé(s) — page: ${lastVisible ? "suivante possible" : "première"}`}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ pr: 1 }}>
            {loadingMore && <CircularProgress size={20} />}
            <Button onClick={loadMore} variant="contained" size="small" disabled={!hasMore || loadingMore}>
              Charger plus
            </Button>
          </Stack>
        </Box>
      </Paper>

      {/* Détails dialog */}
      <Dialog open={!!current} onClose={() => setCurrent(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 3, boxShadow: 5 } }}>
        <DialogTitle sx={{ bgcolor: theme.palette.primary.main, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, px: 2 }}>
          <Typography variant="h6">Détails de la Dépense</Typography>
          <IconButton onClick={() => setCurrent(null)} sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': {bgcolor: 'rgba(255,255,255,0.1)'} }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ py: 2, px: {xs:2, sm:3} }}>
          {current && (
            <Stack spacing={1.5}>
              <DetailItem icon={<CalendarTodayIcon />} label="Date & Heure" value={current.createdAt.toDate().toLocaleString('fr-FR', {dateStyle: 'medium', timeStyle: 'short'})} />
              <DetailItem icon={<AttachMoneyIcon />} label="Montant" value={formatAmount(current.montant)} sxValue={{fontWeight: 'bold', color: theme.palette.primary.dark}}/>
              <DetailItem icon={<LabelIcon />} label="Catégorie" value={catsMap[current.categorie]?.nom || "Non spécifiée"} />
              <DetailItem icon={<PersonIcon />} label="Créé par" value={usersMap[current.createdBy]?.fullName || "Inconnu"} />
              <DetailItem icon={<StorefrontIcon />} label="Bénéficiaire" value={current.beneficiaire || "Non spécifié"} />
              <DetailItem icon={<PaymentIcon />} label="Mode paiement" value={current.modePaiement || "Non spécifié"} />
              {current.description && <DetailItem icon={<DescriptionIcon />} label="Description" value={current.description || ""} isBlock />}
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{px:2, py:1.5}}>
          <Button onClick={() => setCurrent(null)} variant="outlined" color="primary">Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const DetailItem = ({ icon, label, value, sxValue, isBlock }: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    sxValue?: object;
    isBlock?: boolean;
}) => {
  const theme = useTheme();
  return (
    <Paper variant="outlined" sx={{p:1.5, borderRadius: 2, display: isBlock ? 'block' : 'flex', alignItems: 'center', gap:1.5, borderColor: theme.palette.divider}}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{minWidth: 150, mb: isBlock ? 0.5 : 0}}>
            <Box sx={{ color: theme.palette.primary.main, display: 'inline-flex' }}>{icon}</Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.text.secondary }}>{label} :</Typography>
        </Stack>
      <Typography variant="body1" sx={{ color: theme.palette.text.primary, flexGrow:1, ...sxValue }}>{value || "—"}</Typography>
    </Paper>
  );
};
