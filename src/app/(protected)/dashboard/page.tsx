// src/app/.../page.tsx or src/components/DashboardPage.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Grid,
  Card,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Stack,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
  useTheme,
  ListItemIcon,
} from "@mui/material";
import {
  Inventory2 as Inventory2Icon,
  WarningAmber as WarningIcon,
  PointOfSale as SaleIcon,
  MonetizationOn as ExpenseIcon,
  Add as AddIcon,
  Assessment as ReportIcon,
  TrendingUp as TrendingUpIcon,
  CreditScore as CreditScoreIcon,
  ReceiptLong as ReceiptLongIcon,
  Payments as PaymentsIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  ShoppingCart as ShoppingCartIcon,
} from "@mui/icons-material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { fr } from "date-fns/locale";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  orderBy,
  startAt,
  endAt,
  doc,
  getDoc,
  documentId,
} from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, isValid, startOfDay, endOfDay } from "date-fns";

// Helper pour normaliser les dates
const getDate = (val: unknown): Date | null => {
  if (!val) return null;
  let dateToTest: Date | undefined;

  if (val instanceof Timestamp) dateToTest = val.toDate();
  else if (val instanceof Date) dateToTest = val;
  else if (typeof val === "string") dateToTest = new Date(val);
  else if (typeof val === "number") {
    dateToTest = val < 100000000000 ? new Date(val * 1000) : new Date(val);
  } else if (typeof val === "object" && "seconds" in val && typeof (val as { seconds: number }).seconds === "number") {
    const ts = val as { seconds: number; nanoseconds?: number };
    dateToTest = new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000);
  }

  if (dateToTest && isValid(dateToTest)) return dateToTest;
  return null;
};

const formatDateToYYYYMMDD = (date: Date | null): string => {
  if (!date || !isValid(date)) return "";
  return format(date, "yyyy-MM-dd");
};

const PRODUCT_STAT_CARD_COLORS = [
  "#1976d2", "#e57373", "#4caf50", "#ffb74d", "#ba68c8", "#4dd0e1",
];

interface Product {
  id: string;
  nom: string;
  stock?: number;
  dateExpiration?: Timestamp | string | number | { seconds: number; nanoseconds?: number };
  seuilStockBas?: number;
  stockMin?: number;
}

interface StatsVente {
  id: string; 
  date?: Timestamp | string | number | { seconds: number; nanoseconds?: number };
  montantVenteTotalDuJour: number;
  montantPercuTotalDuJour: number;
  nombreVentesDuJour: number;
  margeBeneficeTotalDuJour?: number; // <-- nouveau champ optionnel (somme des marges du jour)
}

interface Expense {
  id: string;
  date?: Timestamp | string | number | { seconds: number; nanoseconds?: number };
  createdAt?: Timestamp | string | number | { seconds: number; nanoseconds?: number };
  montant: number;
}

interface SalesChartData {
  date: string;
  sales: number;
  fill: string;
}

const QUICK_ACTIONS_PANEL_WIDTH = 180; // px
const QUICK_ACTIONS_PANEL_MARGIN = 2; // theme.spacing units

export default function DashboardPage() {
  const router = useRouter();
  const theme = useTheme();
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("FCFA");
  
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("today");
  const [customStart, setCustomStart] = useState<Date | null>(new Date());
  const [customEnd, setCustomEnd] = useState<Date | null>(new Date());
  
  const [products, setProducts] = useState<Product[]>([]);
  const [statsVentesPeriod, setStatsVentesPeriod] = useState<StatsVente[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  
  const [loadingBoutique, setLoadingBoutique] = useState<boolean>(true);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  const [selectedDateForStats, setSelectedDateForStats] = useState<Date | null>(new Date());
  const [specificDayStats, setSpecificDayStats] = useState<StatsVente | null>(null);
  const [loadingSpecificDayStats, setLoadingSpecificDayStats] = useState<boolean>(false);

  // --- NOUVEAU: role de l'utilisateur pour conditionner les raccourcis
  const [role, setRole] = useState<string | null | undefined>(undefined); // undefined = loading

  // Calcule la marge nécessaire à droite pour les écrans sm et plus
  const marginRightForPanel = useMemo(() => {
    return `calc(${QUICK_ACTIONS_PANEL_WIDTH}px + ${theme.spacing(QUICK_ACTIONS_PANEL_MARGIN * 2)})`; // panel width + son propre margin + un gap
  }, [theme]);
  

  useEffect(() => {
    if (!loadingAuth && !user) {
      router.replace("/login");
    }
  }, [user, loadingAuth, router]);

  // Charger role utilisateur (nouveau)
  useEffect(() => {
    let cancelled = false;
    const fetchRole = async () => {
      if (!user) {
        setRole(null);
        return;
      }
      try {
        // Optionnel: cache simple en localStorage
        const cacheKey = `role_${user.uid}`;
        const cached = typeof localStorage !== "undefined" ? localStorage.getItem(cacheKey) : null;
        if (cached) {
          setRole(cached === "null" ? null : cached);
          return;
        }
      } catch (e) {
        // ignore
      }

      try {
        const userDocRef = doc(db, "users", user.uid);
        const snap = await getDoc(userDocRef);
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          const r = (data.role && String(data.role).toLowerCase()) || null;
          setRole(r);
          try { if (typeof localStorage !== "undefined") localStorage.setItem(`role_${user.uid}`, r || "null"); } catch {}
        } else {
          setRole(null);
        }
      } catch (err) {
        console.error("Erreur lecture role utilisateur:", err);
        setRole(null);
      }
    };
    fetchRole();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) {
        setBoutiqueId(null);
        setDevise("FCFA");
        setLoadingBoutique(false);
        setLoadingData(false);
        return;
    }
    setLoadingBoutique(true);
    const qb = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid));
    const unsubBoutique = onSnapshot(qb, (snap) => {
        if (!snap.empty) {
            const boutiqueDoc = snap.docs[0];
            setBoutiqueId(boutiqueDoc.id);
            const boutiqueData = boutiqueDoc.data() as { devise?: string };
            setDevise(boutiqueData.devise || "FCFA");
        } else {
            setBoutiqueId(null);
            setDevise("FCFA");
            console.log("Aucune boutique trouvée pour l'utilisateur:", user.uid);
        }
        setLoadingBoutique(false);
    }, (error) => {
        console.error("Erreur chargement boutique:", error);
        setBoutiqueId(null);
        setDevise("FCFA");
        setLoadingBoutique(false);
    });
    return () => unsubBoutique();
  }, [user, loadingAuth]);

  const [startDate, endDate] = useMemo((): [Date, Date] => {
    const now = new Date();
    let sDate = startOfDay(now);
    let eDate = endOfDay(now);

    switch (period) {
      case "week": {
        const day = sDate.getDay();
        const diff = sDate.getDate() - day + (day === 0 ? -6 : 1);
        sDate = startOfDay(new Date(sDate.setDate(diff)));
        eDate = endOfDay(new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate() + 6));
        break;
      }
      case "month":
        sDate = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
        eDate = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        break;
      case "custom":
        sDate = customStart ? startOfDay(customStart) : startOfDay(new Date(0));
        eDate = customEnd ? endOfDay(customEnd) : endOfDay(new Date());
        break;
    }
    return [sDate, eDate];
  }, [period, customStart, customEnd]);

  const fetchSpecificDayStats = useCallback(async () => {
    if (!boutiqueId || !selectedDateForStats) {
      setSpecificDayStats(null);
      return;
    }
    setLoadingSpecificDayStats(true);
    const dateStr = formatDateToYYYYMMDD(selectedDateForStats);
    if (!dateStr) {
        setSpecificDayStats(null);
        setLoadingSpecificDayStats(false);
        return;
    }
    try {
      const docRef = doc(db, "boutiques", boutiqueId, "statsVentes", dateStr);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSpecificDayStats({ id: docSnap.id, ...docSnap.data() } as StatsVente);
      } else {
        setSpecificDayStats(null);
      }
    } catch (error) {
      console.error("Erreur stats jour:", error);
      setSpecificDayStats(null);
    } finally {
      setLoadingSpecificDayStats(false);
    }
  }, [boutiqueId, selectedDateForStats]);

  useEffect(() => {
    if (boutiqueId && selectedDateForStats) {
      fetchSpecificDayStats();
    }
  }, [fetchSpecificDayStats, boutiqueId, selectedDateForStats]);

  useEffect(() => {
    if (!boutiqueId || loadingBoutique) {
        if (!loadingBoutique) setLoadingData(false);
        return;
    }

    setLoadingData(true);
    const unsubscribers: (() => void)[] = [];
    let listenersToWaitFor = 3;

    const checkAllDataLoaded = () => {
      listenersToWaitFor--;
      if (listenersToWaitFor === 0) setLoadingData(false);
    };

    const startDateStr = formatDateToYYYYMMDD(startDate);
    const endDateStr = formatDateToYYYYMMDD(endDate);

    if (startDateStr && endDateStr) {
        const qStatsVentesPeriod = query(
          collection(db, "boutiques", boutiqueId, "statsVentes"),
          orderBy(documentId()),
          startAt(startDateStr),
          endAt(endDateStr)
        );
        unsubscribers.push(
          onSnapshot(qStatsVentesPeriod, (s) => {
            setStatsVentesPeriod(s.docs.map((d) => ({ id: d.id, ...d.data() } as StatsVente)));
            checkAllDataLoaded();
          }, (error) => { console.error("Error statsVentesPeriod:", error); checkAllDataLoaded(); })
        );
    } else {
        setStatsVentesPeriod([]);
        checkAllDataLoaded();
    }

    const qProducts = query(collection(db, "boutiques", boutiqueId, "products"));
    unsubscribers.push(
      onSnapshot(qProducts, (s) => {
        setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
        checkAllDataLoaded();
      }, (error) => { console.error("Error products:", error); checkAllDataLoaded(); })
    );
    
    const qExpenses = query(collection(db, "boutiques", boutiqueId, "expenses"));
    unsubscribers.push(
      onSnapshot(qExpenses, (s) => {
        setExpenses(s.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)));
        checkAllDataLoaded();
      }, (error) => { console.error("Error expenses:", error); checkAllDataLoaded(); })
    );

    return () => unsubscribers.forEach((u) => u());
  }, [boutiqueId, startDate, endDate, loadingBoutique]);

  const totalSalesAmountForPeriod = useMemo(() => statsVentesPeriod.reduce((sum, stat) => sum + (stat.montantVenteTotalDuJour || 0), 0), [statsVentesPeriod]);
  const totalPercuForPeriod = useMemo(() => statsVentesPeriod.reduce((sum, stat) => sum + (stat.montantPercuTotalDuJour || 0), 0), [statsVentesPeriod]);
  const totalNombreVentesForPeriod = useMemo(() => statsVentesPeriod.reduce((sum, stat) => sum + (stat.nombreVentesDuJour || 0), 0), [statsVentesPeriod]);
  const totalCreditsForPeriod = totalSalesAmountForPeriod - totalPercuForPeriod;

  // --- NOUVEAU : somme des marges sur la période ---
  const totalMargeForPeriod = useMemo(() => {
    return statsVentesPeriod.reduce((sum, stat) => sum + (stat.margeBeneficeTotalDuJour || 0), 0);
  }, [statsVentesPeriod]);

  const filteredExpenses = useMemo(() => {
    if (!startDate || !endDate) return [];
    return expenses.filter((e) => {
      const expenseDate = getDate(e.date || e.createdAt);
      return expenseDate && expenseDate >= startDate && expenseDate <= endDate;
    });
  }, [expenses, startDate, endDate]);
  const totalExpensesAmountForPeriod = useMemo(() => filteredExpenses.reduce((sum, e) => sum + (e.montant || 0), 0), [filteredExpenses]);

  // Bénéfices estimés = marge brute totale - dépenses
  const estimatedProfit = useMemo(() => {
    return totalMargeForPeriod - totalExpensesAmountForPeriod;
  }, [totalMargeForPeriod, totalExpensesAmountForPeriod]);

  // pour compatibilité descendante, on garde previous naming if needed
  const totalBenefitsForPeriod = estimatedProfit; // remplace l'ancienne définition

  const inStockCount = useMemo(() => products.filter((p) => (p.stock || 0) > 0).length, [products]);
  const outStockCount = useMemo(() => products.filter((p) => (p.stock || 0) <= 0).length, [products]);
  const expiringSoonCount = useMemo(() => {
    const now = new Date();
    const oneMonthFromNow = new Date(new Date().setDate(now.getDate() + 30));
    return products.filter((p) => {
      if (!p.dateExpiration) return false;
      const expirationDate = getDate(p.dateExpiration);
      return expirationDate && expirationDate > new Date() && expirationDate <= oneMonthFromNow;
    }).length;
  }, [products]);
  const lowStockCount = useMemo(() => products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.seuilStockBas || p.stockMin || 5)).length, [products]);

  const salesChartData = useMemo((): SalesChartData[] => {
    return statsVentesPeriod
      .map((stat, index) => {
          const statDate = getDate(stat.id);
          return {
            date: statDate ? format(statDate, "dd/MM") : 'Inconnue',
            sales: stat.montantVenteTotalDuJour || 0,
            fill: PRODUCT_STAT_CARD_COLORS[index % PRODUCT_STAT_CARD_COLORS.length],
          };
      })
      .sort((a, b) => {
          const dateAFromStats = statsVentesPeriod.find(s => format(getDate(s.id) || new Date(0), "dd/MM") === a.date);
          const dateBFromStats = statsVentesPeriod.find(s => format(getDate(s.id) || new Date(0), "dd/MM") === b.date);
          const timeA = dateAFromStats ? (getDate(dateAFromStats.id) || new Date(0)).getTime() : 0;
          const timeB = dateBFromStats ? (getDate(dateBFromStats.id) || new Date(0)).getTime() : 0;
          return timeA - timeB;
      });
  }, [statsVentesPeriod]);

  const financeCardStyles = {
    revenues: {
      bgColor: theme.palette.mode === 'light' ? 'rgba(25, 118, 210, 0.08)' : 'rgba(144, 202, 249, 0.12)',
      iconColor: theme.palette.primary.main,
      textColor: theme.palette.mode === 'light' ? theme.palette.primary.dark : theme.palette.primary.light,
      mainIcon: <PaymentsIcon sx={{ fontSize: 30 }} />,
    },
    credits: {
      bgColor: theme.palette.mode === 'light' ? 'rgba(211, 47, 47, 0.08)' : 'rgba(239, 83, 80, 0.12)',
      iconColor: theme.palette.error.main,
      textColor: theme.palette.mode === 'light' ? theme.palette.error.dark : theme.palette.error.light,
      mainIcon: <CreditScoreIcon sx={{ fontSize: 30 }} />,
    },
    expenses: {
      bgColor: theme.palette.mode === 'light' ? 'rgba(237, 108, 2, 0.08)' : 'rgba(255, 167, 38, 0.12)',
      iconColor: theme.palette.warning.dark,
      textColor: theme.palette.mode === 'light' ? (theme.palette.warning as any).darker || theme.palette.warning.dark : theme.palette.warning.light,
      mainIcon: <ExpenseIcon sx={{ fontSize: 30 }} />,
    },
    profits: {
      getColors: (value: number) => ({
        bgColor: value >= 0 
          ? (theme.palette.mode === 'light' ? 'rgba(46, 125, 50, 0.08)' : 'rgba(102, 187, 106, 0.12)')
          : (theme.palette.mode === 'light' ? 'rgba(198, 40, 40, 0.08)' : 'rgba(229, 57, 53, 0.12)'),
        iconColor: value >= 0 ? theme.palette.success.main : theme.palette.error.main,
        textColor: value >= 0 
          ? (theme.palette.mode === 'light' ? theme.palette.success.dark : theme.palette.success.light) 
          : (theme.palette.mode === 'light' ? theme.palette.error.dark : theme.palette.error.light),
        mainIcon: <TrendingUpIcon sx={{ fontSize: 30 }} />,
      }),
    },
  };
  
  const QUICK_ACTION_ICON_COLORS = [
    theme.palette.info.main,
    theme.palette.secondary.main,
    '#FF8F00',
    '#00ACC1',
    '#5E35B1',
    '#F06292',
  ];

  if (loadingAuth || loadingBoutique) {
    return <Box textAlign="center" py={6}><CircularProgress /></Box>;
  }
  if (!user) {
    return <Box textAlign="center" py={6}><Typography>Veuillez vous connecter pour accéder au tableau de bord.</Typography></Box>;
  }
  if (!boutiqueId) {
    return <Box textAlign="center" py={6}><Typography>Aucune boutique n&apos;est associée à votre compte.</Typography></Box>;
  }

  // ---- Permissions mapping identique à la sidebar ----
  const isAdmin = role === 'admin';
  const isGerant = role === 'gerant';
  const isStock = role === 'stock';
  const isCaisse = role === 'caisse';

  const canDashboard = isAdmin || isGerant;
  const canStock = isAdmin || isGerant || isStock;
  const canVentes = isAdmin || isGerant;
  const canCaisse = isAdmin || isGerant || isCaisse;
  const canClients = isAdmin || isGerant || isCaisse;
  const canInventaire = isAdmin || isGerant || isStock;
  const canDepenses = isAdmin || isGerant || isCaisse;
  const canAchats = isAdmin || isStock;
  const canFournisseurs = isAdmin;
  const canStats = isAdmin || isGerant || isStock;
  const canPOS = isAdmin || isGerant;
  // ----------------------------------------------------

  // Quick actions de base (Aide retirée)
  const baseQuickActions = [
      { label: "Vente POS", icon: <SaleIcon />, href: "/pos", permission: () => canPOS },
      { label: "Gestion de Caisse", icon: <ExpenseIcon />, href: "/caisse", permission: () => canCaisse },
      { label: "Nouveau Produit", icon: <AddIcon />, href: "/produits/ajouter", permission: () => canStock },
      { label: "Gérer Produits", icon: <Inventory2Icon />, href: "/produits/list", permission: () => canStock },
      { label: "Ventes", icon: <ReportIcon />, href: "/ventes/list", permission: () => canVentes },
  ];

  const quickActionsList = baseQuickActions.filter(a => {
    try { return a.permission(); } catch { return false; }
  });

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
      <Box sx={{ 
        p: { xs: 1.5, md: 2.5 }, 
        bgcolor: "grey.50", 
        minHeight: "100vh",
      }}>
        <Stack 
          direction={{ xs: "column", sm: "row" }} 
          spacing={1} 
          alignItems="center" 
          mb={2.5} 
          justifyContent="space-between"
          sx={{ mr: { sm: marginRightForPanel } }} // Marge pour le sélecteur de période
        >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Tableau de Bord
          </Typography>
          <ToggleButtonGroup value={period} exclusive onChange={(_, v) => v !== null && setPeriod(v)} size="small">
            <ToggleButton value="today">Aujourd’hui</ToggleButton>
            <ToggleButton value="week">Semaine</ToggleButton>
            <ToggleButton value="month">Mois</ToggleButton>
            <ToggleButton value="custom">Personnalisé</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        {period === "custom" && (
            <Stack 
              direction={{xs: 'column', sm: 'row'}} 
              spacing={1.5} 
              mb={2.5} 
              alignItems="center"
              sx={{ mr: { sm: marginRightForPanel } }} // Marge pour les date pickers
            >
              <DatePicker label="Date de Début" value={customStart} onChange={setCustomStart} slotProps={{ textField: { size: "small", fullWidth: true } }} maxDate={customEnd || undefined}/>
              <DatePicker label="Date de Fin" value={customEnd} onChange={setCustomEnd} slotProps={{ textField: { size: "small", fullWidth: true } }} minDate={customStart || undefined} maxDate={new Date()}/>
            </Stack>
        )}

        {loadingData && (
          <Box textAlign="center" py={4}><CircularProgress /></Box>
        )}

        {!loadingData && (
          <>
            <Typography variant="h6" fontWeight={600} mb={1.5} sx={{ mr: { sm: marginRightForPanel } }}>
                Statistiques des Produits
            </Typography>
            <Grid container spacing={2} mb={3} sx={{ mr: { sm: marginRightForPanel } }}>
              {[ 
                { label: "En stock", value: inStockCount, icon: <Inventory2Icon />, color: PRODUCT_STAT_CARD_COLORS[0] },
                { label: "En rupture", value: outStockCount, icon: <WarningIcon />, color: PRODUCT_STAT_CARD_COLORS[1], iconColor: outStockCount > 0 ? "error.main" : "rgba(255,255,255,0.7)" },
                { label: "Expirant < 30j", value: expiringSoonCount, icon: <WarningIcon />, color: PRODUCT_STAT_CARD_COLORS[2], iconColor: expiringSoonCount > 0 ? "warning.main" : "rgba(255,255,255,0.7)" },
                { label: "Stock faible", value: lowStockCount, icon: <WarningIcon />, color: PRODUCT_STAT_CARD_COLORS[3], iconColor: lowStockCount > 0 ? "warning.main" : "rgba(255,255,255,0.7)" },
              ].map((item) => (
                <Grid key={item.label} item xs={6} sm={6} md={3}>
                  <Card sx={{ display: "flex", alignItems: "center", p: 1.5, bgcolor: item.color, color: "white", borderRadius: 2, height: "100%", transition: "transform .2s", "&:hover": { transform: "scale(1.03)" } }}>
                    <Box sx={{ mr: 1.5, color: item.iconColor || "rgba(255,255,255,0.7)" }}>{React.cloneElement(item.icon, { sx: {fontSize: "1.8rem"} })}</Box>
                    <Box>
                      <Typography variant="caption" sx={{ display: "block", lineHeight: 1.1, opacity: 0.9 }}>{item.label}</Typography>
                      <Typography variant="h6" fontWeight={600}>{item.value}</Typography>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Typography variant="h6" fontWeight={600} mb={1.5} sx={{ mr: { sm: marginRightForPanel } }}>
                Finances (Période : {period === "today" ? "Aujourd'hui" : period === "week" ? "Cette Semaine" : period === "month" ? "Ce Mois" : "Personnalisée"})
            </Typography>
            <Grid container spacing={2} mb={3} sx={{ mr: { sm: marginRightForPanel } }}>
              {/* Carte 1: Revenus & Activité */}
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ p: 2, borderRadius: 2, boxShadow: 1, height: '100%', bgcolor: financeCardStyles.revenues.bgColor }}>
                  <Stack direction="row" alignItems="center" spacing={1.5} mb={1.5}>
                    {React.cloneElement(financeCardStyles.revenues.mainIcon, { sx: { color: financeCardStyles.revenues.iconColor, fontSize: 30 }})}
                    <Typography variant="subtitle1" fontWeight={600} sx={{ color: financeCardStyles.revenues.textColor }}>
                      Revenus & Activité
                    </Typography>
                  </Stack>
                  <List dense disablePadding>
                    {[ 
                      { label: "Chiffre d'Affaires", value: totalSalesAmountForPeriod, icon: <PaymentsIcon fontSize="small" sx={{color: financeCardStyles.revenues.iconColor, opacity: 0.7}}/>, devise: true },
                      { label: "Net Perçu", value: totalPercuForPeriod, icon: <AccountBalanceWalletIcon fontSize="small" sx={{color: financeCardStyles.revenues.iconColor, opacity: 0.7}}/>, devise: true },
                      { label: "Nb. Ventes", value: totalNombreVentesForPeriod, icon: <ShoppingCartIcon fontSize="small" sx={{color: financeCardStyles.revenues.iconColor, opacity: 0.7}}/>, devise: false },
                    ].map(item => (
                      <ListItem key={item.label} disableGutters sx={{py: 0.25}}>
                        <ListItemIcon sx={{minWidth: 32, color: financeCardStyles.revenues.textColor}}>
                            {item.icon}
                        </ListItemIcon>
                        <ListItemText 
                            primary={item.label}
                            secondary={`${item.value.toLocaleString("fr-FR")} ${item.devise ? devise : ''}`}
                            primaryTypographyProps={{ variant: 'body2', color: financeCardStyles.revenues.textColor, opacity: 0.9 }}
                            secondaryTypographyProps={{ variant: 'subtitle2', fontWeight: 600, color: financeCardStyles.revenues.textColor }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Card>
              </Grid>

              {/* Carte 2: Crédits Clients */}
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ p: 2, borderRadius: 2, boxShadow: 1, height: '100%', bgcolor: financeCardStyles.credits.bgColor }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1.5} mb={0.5}>
                    {React.cloneElement(financeCardStyles.credits.mainIcon, { sx: { color: financeCardStyles.credits.iconColor, fontSize: 30, mt: 0.5 }})}
                    <Box>
                      <Typography variant="body2" sx={{color: financeCardStyles.credits.textColor, opacity: 0.8}}>Crédits Clients (Période)</Typography>
                      <Typography variant="h5" fontWeight={700} sx={{color: financeCardStyles.credits.textColor}}>{totalCreditsForPeriod.toLocaleString("fr-FR")} {devise}</Typography>
                    </Box>
                  </Stack>
                  <Typography variant="caption" display="block" sx={{color: financeCardStyles.credits.textColor, opacity: 0.7, mt:0.5}}>Montant total non perçu</Typography>
                </Card>
              </Grid>

              {/* NOUVELLE CARTE: Marge Brute (Période) */}
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ p: 2, borderRadius: 2, boxShadow: 1, height: '100%', bgcolor: theme.palette.mode === 'light' ? 'rgba(0, 137, 123, 0.06)' : 'rgba(0, 137, 123, 0.12)' }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1.5} mb={0.5}>
                    <TrendingUpIcon sx={{ fontSize: 30, color: theme.palette.success.main, mt: 0.5 }} />
                    <Box>
                      <Typography variant="body2" sx={{ color: theme.palette.success.dark, opacity: 0.85 }}>Marge Brute (Période)</Typography>
                      <Typography variant="h5" fontWeight={700} sx={{ color: theme.palette.success.dark }}>{totalMargeForPeriod.toLocaleString("fr-FR")} {devise}</Typography>
                    </Box>
                  </Stack>
                  <Typography variant="caption" display="block" sx={{ color: theme.palette.success.dark, opacity: 0.75, mt:0.5 }}>Somme des marges enregistrées dans les stats de vente</Typography>
                </Card>
              </Grid>

              {/* Carte 3: Dépenses */}
              <Grid item xs={12} sm={6} md={3}>
                 <Card sx={{ p: 2, borderRadius: 2, boxShadow: 1, height: '100%', bgcolor: financeCardStyles.expenses.bgColor }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1.5} mb={0.5}>
                    {React.cloneElement(financeCardStyles.expenses.mainIcon, { sx: { color: financeCardStyles.expenses.iconColor, fontSize: 30, mt: 0.5 }})}
                    <Box>
                      <Typography variant="body2" sx={{color: financeCardStyles.expenses.textColor, opacity: 0.8}}>Total Dépenses (Période)</Typography>
                      <Typography variant="h5" fontWeight={700} sx={{color: financeCardStyles.expenses.textColor}}>{totalExpensesAmountForPeriod.toLocaleString("fr-FR")} {devise}</Typography>
                    </Box>
                  </Stack>
                  <Typography variant="caption" display="block" sx={{color: financeCardStyles.expenses.textColor, opacity: 0.7, mt:0.5}}>Somme des dépenses enregistrées</Typography>
                </Card>
              </Grid>

              {/* Carte 4: Bénéfices Estimés = Marge Brute - Dépenses */}
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ 
                    p: 2, 
                    borderRadius: 2, 
                    boxShadow: 1, 
                    height: '100%', 
                    bgcolor: financeCardStyles.profits.getColors(totalBenefitsForPeriod).bgColor 
                }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1.5} mb={0.5}>
                     {React.cloneElement(financeCardStyles.profits.getColors(totalBenefitsForPeriod).mainIcon, { sx: { color: financeCardStyles.profits.getColors(totalBenefitsForPeriod).iconColor, fontSize: 30, mt: 0.5 }})}
                    <Box>
                      <Typography variant="body2" sx={{color: financeCardStyles.profits.getColors(totalBenefitsForPeriod).textColor, opacity: 0.8}}>Bénéfices Estimés (Période)</Typography>
                      <Typography variant="h5" fontWeight={700} sx={{color: financeCardStyles.profits.getColors(totalBenefitsForPeriod).textColor}}>{totalBenefitsForPeriod.toLocaleString("fr-FR")} {devise}</Typography>
                    </Box>
                  </Stack>
                  <Typography variant="caption" display="block" sx={{color: financeCardStyles.profits.getColors(totalBenefitsForPeriod).textColor, opacity: 0.7, mt:0.5}}>(Marge brute - Dépenses pour la période)</Typography>
                </Card>
              </Grid>
            </Grid>

            <Paper sx={{ p: 2, mb: 3, boxShadow: 1, borderRadius: 2, mr: { sm: marginRightForPanel } }}> {/* Marge pour "Consulter Ventes" */}
              <Typography variant="h6" fontWeight={600} mb={1.5}>Consulter Ventes d'un Jour</Typography>
              <Stack direction={{xs: 'column', sm: 'row'}} spacing={1.5} alignItems="flex-start" mb={2}>
                <DatePicker label="Choisir une date" value={selectedDateForStats} onChange={setSelectedDateForStats} slotProps={{ textField: { size: "small", fullWidth: true } }} maxDate={new Date()} />
              </Stack>
              {loadingSpecificDayStats && <CircularProgress size={24} sx={{ display: 'block', my: 2, mx: 'auto' }}/>}
              {!loadingSpecificDayStats && selectedDateForStats && specificDayStats && (
                <Box mt={1}>
                  <Typography variant="subtitle1" fontWeight={500} gutterBottom>
                    Rapport du {format(selectedDateForStats, "eeee dd MMMM yyyy", { locale: fr })}:
                  </Typography>
                  <List dense disablePadding sx={{ '& .MuiListItem-root': { py: 0.5 } }}>
                    <ListItem><ListItemText primary="Chiffre d'Affaires" secondary={`${(specificDayStats.montantVenteTotalDuJour || 0).toLocaleString("fr-FR")} ${devise}`} /></ListItem>
                    <ListItem><ListItemText primary="Net Perçu" secondary={`${(specificDayStats.montantPercuTotalDuJour || 0).toLocaleString("fr-FR")} ${devise}`} /></ListItem>
                    <ListItem><ListItemText primary="Crédits Clients" secondary={`${((specificDayStats.montantVenteTotalDuJour || 0) - (specificDayStats.montantPercuTotalDuJour || 0)).toLocaleString("fr-FR")} ${devise}`} /></ListItem>
                    <ListItem><ListItemText primary="Nombre de Ventes" secondary={`${specificDayStats.nombreVentesDuJour || 0}`} /></ListItem>
                    <ListItem><ListItemText primary="Marge jour" secondary={`${(specificDayStats.margeBeneficeTotalDuJour || 0).toLocaleString("fr-FR")} ${devise}`} /></ListItem>
                  </List>
                </Box>
              )}
              {!loadingSpecificDayStats && selectedDateForStats && !specificDayStats && (
                <Typography color="text.secondary" sx={{mt:1}}>Aucune donnée de vente pour le {format(selectedDateForStats, "dd/MM/yyyy")}.</Typography>
              )}
              {!loadingSpecificDayStats && !selectedDateForStats && (
                <Typography color="text.secondary" sx={{mt:1}}>Veuillez sélectionner une date.</Typography>
              )}
            </Paper>

            <Paper sx={{ p: 2, mb: 3, boxShadow: 1, borderRadius: 2, mr: { sm: marginRightForPanel } }}> {/* Marge pour le Graphique */}
              <Typography variant="h6" mb={1.5} fontWeight={600}>Évolution des ventes (Période)</Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesChartData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{fontSize: 12}} />
                    <YAxis tickFormatter={(value) => `${value.toLocaleString("fr-FR")}`} tick={{fontSize: 12}} />
                    <Tooltip formatter={(value: number) => [`${value.toLocaleString("fr-FR")} ${devise}`, "Ventes"]} />
                    <Legend wrapperStyle={{fontSize: "14px"}} />
                    <Bar dataKey="sales" name="Ventes" radius={[4, 4, 0, 0]} fill={theme.palette.primary.main}/>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>

            {lowStockCount > 0 && (
              <Paper sx={{ p: 2, mb: 3, boxShadow: 1, borderRadius: 2, mr: { sm: marginRightForPanel } }}>
                <Typography variant="h6" gutterBottom fontWeight={600}>Alertes stock faible ({lowStockCount})</Typography>
                <List dense>
                  {products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.seuilStockBas || p.stockMin || 5)).slice(0, 5).map((p) => (
                    <ListItem key={p.id} disablePadding sx={{"&:hover": {bgcolor: 'action.hover', borderRadius: 1}}}>
                      <Button component={Link} href={`/produits#${p.id}`} fullWidth sx={{justifyContent: 'flex-start', textTransform: 'none', py:0.5, px:1}}>
                        <ListItemText primary={p.nom || "Produit sans nom"} secondary={`Reste: ${p.stock || 0} (Seuil: ${p.seuilStockBas || p.stockMin || 5})`} primaryTypographyProps={{fontWeight:500}}/>
                      </Button>
                    </ListItem>
                  ))}
                  {products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.seuilStockBas || p.stockMin || 5)).length > 5 && (
                    <ListItem disablePadding sx={{mt:1}}>
                      <Button component={Link} href="/produits?filter=lowStock" variant="outlined" size="small" fullWidth>Voir toutes les alertes</Button>
                    </ListItem>
                  )}
                </List>
              </Paper>
            )}
          </>
        )}
      </Box>

      {/* Actions Rapides Flottantes */}
      {!loadingData && quickActionsList.length > 0 && (
        <Stack
          direction="column"
          spacing={1.25}
          sx={{
            position: 'fixed',
            top: { xs: 'auto', sm: theme.spacing(10) },
            bottom: { xs: theme.spacing(1.5), sm: 'auto' },
            right: theme.spacing(QUICK_ACTIONS_PANEL_MARGIN),
            width: QUICK_ACTIONS_PANEL_WIDTH,
            zIndex: theme.zIndex.drawer + 1,
            maxHeight: { xs: '35vh', sm: `calc(100vh - ${theme.spacing(12)})` },
            overflowY: 'auto',
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'action.selected', borderRadius: '3px' },
          }}
        >
          <Typography 
            variant="subtitle2"
            fontWeight={600}
            sx={{ 
              display: { xs: 'none', sm: 'block' }, 
              mb: 0.25, 
              textAlign: 'left',
              color: 'text.secondary',
              px: 0.5,
            }}
          >
            Actions Rapides
          </Typography>
          {quickActionsList.map((action, i) => (
            <Card 
              key={action.label} 
              component={Link} 
              href={action.href} 
              sx={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                justifyContent: "center", 
                p: 1.25,
                minHeight: {xs: 55, sm: 75},
                width: '100%',
                bgcolor: "background.paper", 
                boxShadow: theme.shadows[1], 
                borderRadius: 1.5,
                textDecoration: "none", 
                color: "text.primary", 
                transition: theme.transitions.create(['transform', 'box-shadow', 'color'], {
                    duration: theme.transitions.duration.shorter,
                }),
                "&:hover": { 
                  transform: "translateY(-1px)",
                  boxShadow: theme.shadows[3], 
                  color: "primary.main" 
                }, 
              }}
            >
              <Box sx={{ fontSize: {xs: 20, sm: 22}, mb: 0.25, color: QUICK_ACTION_ICON_COLORS[i % QUICK_ACTION_ICON_COLORS.length] }}>
                {React.cloneElement(action.icon, { fontSize: "inherit" })}
              </Box>
              <Typography variant="caption" textAlign="center" fontWeight={500} sx={{fontSize: '0.7rem'}}>
                {action.label}
              </Typography>
            </Card>
          ))}
        </Stack>
      )}
    </LocalizationProvider>
  );
}
