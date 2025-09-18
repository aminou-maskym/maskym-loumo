"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Stack,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  TableSortLabel,
  useTheme,
  Button,
  TablePagination,
  Tooltip as MuiTooltip,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { fr } from "date-fns/locale";
import { format, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";
import { ArrowUpward, ArrowDownward, PictureAsPdf as PdfIcon } from "@mui/icons-material";

// Importation pour jsPDF
import jsPDF from "jspdf";
import "jspdf-autotable";

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

interface ProductStatItem {
  productId: string;
  nomProduit: string;
  quantiteVendueTotalJour: number;
  montantTotalVenduJour: number;
  montantTotalPercuJour: number;
}

interface AggregatedProductStat {
  productId: string;
  nomProduit: string;
  totalQuantiteVendue: number;
  totalMontantVendu: number;
  totalMontantPercu: number;
}

type Order = "asc" | "desc";
type SortableKeys =
  | "nomProduit"
  | "totalQuantiteVendue"
  | "totalMontantVendu"
  | "totalMontantPercu";

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export default function ProductSalesStats() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [boutiqueName, setBoutiqueName] = useState<string>("");
  const [devise, setDevise] = useState<string>("€");
  const [loadingBoutique, setLoadingBoutique] = useState(true);

  // period includes 'day' now
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom" | "day">("today");
  const [customStart, setCustomStart] = useState<Date | null>(new Date());
  const [customEnd, setCustomEnd] = useState<Date | null>(new Date());
  const [customDay, setCustomDay] = useState<Date | null>(new Date()); // for 'day' selection

  const [allAggregatedStats, setAllAggregatedStats] = useState<AggregatedProductStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [order, setOrder] = useState<Order>("desc");
  const [orderByField, setOrderByField] = useState<SortableKeys>("totalMontantVendu");

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0]);

  const theme = useTheme();

  useEffect(() => {
    if (loadingAuth) return;

    if (!user) {
      setLoadingBoutique(false);
      setBoutiqueId(null);
      setError("Veuillez vous connecter.");
      return;
    }

    setLoadingBoutique(true);
    setError(null);
    const q = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const boutiqueDoc = snapshot.docs[0];
          setBoutiqueId(boutiqueDoc.id);
          const data = boutiqueDoc.data();
          setDevise((data as any).devise || "€");
          setBoutiqueName((data as any).nom || "Ma Boutique");
          setError(null);
        } else {
          setBoutiqueId(null);
          setBoutiqueName("");
          setError("Aucune boutique n'est associée à cet utilisateur.");
        }
        setLoadingBoutique(false);
      },
      (err) => {
        console.error("Erreur onSnapshot boutique:", err);
        setError("Erreur lors du chargement des informations de la boutique.");
        setBoutiqueId(null);
        setBoutiqueName("");
        setLoadingBoutique(false);
      }
    );
    return () => unsubscribe();
  }, [user, loadingAuth]);

  // compute startDate and endDate based on period, customStart/customEnd/customDay
  const { startDate, endDate } = useMemo(() => {
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
      case "month": {
        sDate = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
        eDate = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        break;
      }
      case "custom": {
        sDate = customStart ? startOfDay(customStart) : startOfDay(now);
        eDate = customEnd ? endOfDay(customEnd) : endOfDay(now);
        break;
      }
      case "day": {
        const chosen = customDay ?? now;
        sDate = startOfDay(chosen);
        eDate = endOfDay(chosen);
        break;
      }
      case "today":
      default: {
        sDate = startOfDay(now);
        eDate = endOfDay(now);
      }
    }

    return { startDate: sDate, endDate: eDate };
  }, [period, customStart, customEnd, customDay]);

  const fetchProductStats = useCallback(async () => {
    if (!boutiqueId || !startDate || !endDate) {
      setAllAggregatedStats([]);
      setPage(0);
      return;
    }

    setLoadingStats(true);
    setError(null);
    setPage(0);

    try {
      const allDailyProductStats: ProductStatItem[] = [];
      const dateStringsInRange = eachDayOfInterval({ start: startDate, end: endDate }).map(
        (date) => format(date, "yyyy-MM-dd")
      );

      if (dateStringsInRange.length === 0) {
        setAllAggregatedStats([]);
        setLoadingStats(false);
        return;
      }

      const dailyPromises = dateStringsInRange.map(async (dateStr) => {
        // path to subcollection produitsVendus under statsVentes/{dateStr}
        const productsSoldPath = `boutiques/${boutiqueId}/statsVentes/${dateStr}/produitsVendus`;
        const productsSoldQuery = query(collection(db, productsSoldPath));

        let querySnapshot;
        try {
          querySnapshot = await getDocs(productsSoldQuery, { source: "cache" });
        } catch (e) {
          console.warn(`Cache indisponible ou erreur pour ${dateStr}:`, e);
          querySnapshot = { docs: [], empty: true } as any;
        }

        if (querySnapshot.empty && typeof navigator !== "undefined" && navigator.onLine) {
          try {
            querySnapshot = await getDocs(productsSoldQuery, { source: "server" });
          } catch (serverError) {
            console.error(`Erreur serveur pour ${dateStr}:`, serverError);
          }
        }

        return querySnapshot.docs.map((docSnap: any) => ({
          productId: docSnap.id,
          ...docSnap.data(),
        } as ProductStatItem));
      });

      const results = await Promise.all(dailyPromises);
      results.forEach((dailyResult) => allDailyProductStats.push(...dailyResult));

      const aggregatedStatsMap: { [key: string]: AggregatedProductStat } = {};
      allDailyProductStats.forEach((stat) => {
        if (!stat.productId || !stat.nomProduit) return;
        if (!aggregatedStatsMap[stat.productId]) {
          aggregatedStatsMap[stat.productId] = {
            productId: stat.productId,
            nomProduit: stat.nomProduit,
            totalQuantiteVendue: 0,
            totalMontantVendu: 0,
            totalMontantPercu: 0,
          };
        }
        aggregatedStatsMap[stat.productId].totalQuantiteVendue += stat.quantiteVendueTotalJour || 0;
        aggregatedStatsMap[stat.productId].totalMontantVendu += stat.montantTotalVenduJour || 0;
        aggregatedStatsMap[stat.productId].totalMontantPercu += stat.montantTotalPercuJour || 0;
      });

      setAllAggregatedStats(Object.values(aggregatedStatsMap));
    } catch (err) {
      console.error("Erreur lors de la récupération des statistiques produits:", err);
      setError("Impossible de charger les statistiques des produits.");
      setAllAggregatedStats([]);
    } finally {
      setLoadingStats(false);
    }
  }, [boutiqueId, startDate, endDate]);

  useEffect(() => {
    if (boutiqueId) {
      fetchProductStats();
    } else {
      setAllAggregatedStats([]);
    }
  }, [boutiqueId, fetchProductStats]);

  const handleRequestSort = (property: SortableKeys) => {
    const isAsc = orderByField === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderByField(property);
    setPage(0);
  };

  const sortedAndPaginatedProductStats = useMemo(() => {
    if (allAggregatedStats.length === 0) return [];

    const sorted = [...allAggregatedStats].sort((a, b) => {
      let comparison = 0;
      const valA = (a as any)[orderByField];
      const valB = (b as any)[orderByField];

      if (typeof valA === "string" && typeof valB === "string") {
        comparison = valA.localeCompare(valB);
      } else if (typeof valA === "number" && typeof valB === "number") {
        comparison = valA - valB;
      }
      return order === "asc" ? comparison : -comparison;
    });

    return sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [allAggregatedStats, order, orderByField, page, rowsPerPage]);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const generatePdf = useCallback(() => {
    if (allAggregatedStats.length === 0) {
      alert("Aucune donnée à exporter.");
      return;
    }

    const doc = new jsPDF() as jsPDFWithAutoTable;
    const tableColumn = ["Produit", "Qté Vendue", `CA (${devise})`, `Perçu (${devise})`];
    const tableRows: (string | number)[][] = [];

    const dataToExport = [...allAggregatedStats].sort((a, b) => {
      let comparison = 0;
      const valA = (a as any)[orderByField];
      const valB = (b as any)[orderByField];
      if (typeof valA === "string" && typeof valB === "string") comparison = valA.localeCompare(valB);
      else if (typeof valA === "number" && typeof valB === "number") comparison = valA - valB;
      return order === "asc" ? comparison : -comparison;
    });

    dataToExport.forEach((stat) => {
      const statData = [
        stat.nomProduit,
        stat.totalQuantiteVendue.toLocaleString(),
        stat.totalMontantVendu.toLocaleString(undefined, {
          minimumFractionDigits: devise === "XOF" || devise === "FCFA" ? 0 : 2,
          maximumFractionDigits: 2,
        }),
        stat.totalMontantPercu.toLocaleString(undefined, {
          minimumFractionDigits: devise === "XOF" || devise === "FCFA" ? 0 : 2,
          maximumFractionDigits: 2,
        }),
      ];
      tableRows.push(statData);
    });

    const dateRangeStr = `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
    const title = `Statistiques des Produits Vendus - ${boutiqueName}`;
    const periodeText =
      period === "today"
        ? "Aujourd'hui"
        : period === "week"
        ? "Cette Semaine"
        : period === "month"
        ? "Ce Mois"
        : period === "day"
        ? `Journée : ${format(startDate, "dd/MM/yyyy")}`
        : `Période : ${dateRangeStr}`;

    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(periodeText, 14, 30);
    doc.setFontSize(8);
    doc.text(`Généré le: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 36);

    doc.autoTable({
      startY: 40,
      head: [tableColumn],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [22, 160, 133] },
      footStyles: { fillColor: [22, 160, 133] },
    });

    doc.save(
      `stats_produits_${boutiqueName.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`
    );
  }, [allAggregatedStats, devise, startDate, endDate, period, boutiqueName, order, orderByField]);

  if (loadingAuth) {
    return (
      <Box textAlign="center" py={5}>
        <CircularProgress />
        <Typography>Chargement initial...</Typography>
      </Box>
    );
  }

  if (!user) {
    return <Alert severity="warning" sx={{ m: 2 }}>Veuillez vous connecter pour voir les statistiques.</Alert>;
  }

  if (loadingBoutique) {
    return (
      <Box textAlign="center" py={5}>
        <CircularProgress />
        <Typography>Chargement de la boutique...</Typography>
      </Box>
    );
  }

  if (error && error.includes("boutique")) {
    return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  }

  if (!boutiqueId && !loadingBoutique) {
    return <Alert severity="error" sx={{ m: 2 }}>Aucune boutique sélectionnée ou disponible.</Alert>;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
      <Box sx={{ p: { xs: 1.5, md: 3 }, fontFamily: theme.typography.fontFamily }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={700} color="primary.main">
            Statistiques des Produits Vendus
          </Typography>
          <Button
            variant="outlined"
            startIcon={<PdfIcon />}
            onClick={generatePdf}
            disabled={allAggregatedStats.length === 0 || loadingStats}
            size="small"
          >
            Télécharger PDF
          </Button>
        </Stack>

        <Paper elevation={2} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 1, sm: 2 }}
            alignItems="center"
            mb={period === "custom" || period === "day" ? 2 : 0}
          >
            <Typography variant="subtitle1" fontWeight={500} mr={{ sm: 1 }} whiteSpace="nowrap">
              Période :
            </Typography>
            <ToggleButtonGroup
              value={period}
              exclusive
              onChange={(_, newPeriod) => {
                if (newPeriod) {
                  setPeriod(newPeriod);
                  // initialize date controls for new mode if not set
                  if (newPeriod === "custom") {
                    if (!customStart) setCustomStart(new Date());
                    if (!customEnd) setCustomEnd(new Date());
                  } else if (newPeriod === "day") {
                    if (!customDay) setCustomDay(new Date());
                  }
                }
              }}
              size="small"
              color="primary"
            >
              <ToggleButton value="today">Aujourd'hui</ToggleButton>
              <ToggleButton value="day">Journée</ToggleButton>
              <ToggleButton value="week">Semaine</ToggleButton>
              <ToggleButton value="month">Mois</ToggleButton>
              <ToggleButton value="custom">Personnalisé</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {period === "day" && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={2}>
              <DatePicker
                label="Choisir la journée"
                value={customDay}
                onChange={(newVal) => {
                  setCustomDay(newVal);
                }}
                maxDate={new Date()}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Stack>
          )}

          {period === "custom" && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={2}>
              <DatePicker
                label="Date de début"
                value={customStart}
                onChange={setCustomStart}
                maxDate={customEnd || undefined}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
              <DatePicker
                label="Date de fin"
                value={customEnd}
                onChange={setCustomEnd}
                minDate={customStart || undefined}
                maxDate={new Date()}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Stack>
          )}

          <Button
            onClick={fetchProductStats}
            variant="contained"
            size="small"
            sx={{ mt: 2, display: "block", ml: "auto" }}
            disabled={loadingStats || loadingBoutique || !boutiqueId}
          >
            {loadingStats ? <CircularProgress size={20} color="inherit" /> : "Rafraîchir les Stats"}
          </Button>
        </Paper>

        {error && !error.includes("boutique") && !loadingStats && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {loadingStats && (
          <Box textAlign="center" py={5}>
            <CircularProgress />
            <Typography>Chargement des statistiques...</Typography>
          </Box>
        )}

        {!loadingStats && allAggregatedStats.length === 0 && !error && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Aucune statistique de produit trouvée pour la période sélectionnée.
          </Alert>
        )}

        {!loadingStats && allAggregatedStats.length > 0 && (
          <Paper elevation={3} sx={{ borderRadius: 2, overflow: "hidden" }}>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader aria-label="tableau statistiques produits">
                <TableHead>
                  <TableRow>
                    {[
                      { id: "nomProduit", label: "Produit", align: "left" },
                      { id: "totalQuantiteVendue", label: "Qté Vendue", align: "right" },
                      { id: "totalMontantVendu", label: `CA (${devise})`, align: "right" },
                      { id: "totalMontantPercu", label: `Perçu (${devise})`, align: "right" },
                    ].map((headCell) => (
                      <TableCell
                        key={headCell.id}
                        align={headCell.align as "left" | "right"}
                        sortDirection={orderByField === headCell.id ? order : false}
                        sx={{ bgcolor: "primary.light", fontWeight: "bold", color: "primary.contrastText" }}
                      >
                        <MuiTooltip title={`Trier par ${headCell.label}`} placement="top">
                          <TableSortLabel
                            active={orderByField === headCell.id}
                            direction={orderByField === headCell.id ? order : "asc"}
                            onClick={() => handleRequestSort(headCell.id as SortableKeys)}
                            IconComponent={orderByField === headCell.id ? (order === "asc" ? ArrowUpward : ArrowDownward) : undefined}
                            sx={{ "& .MuiTableSortLabel-icon": { opacity: orderByField === headCell.id ? 1 : 0.4, color: "white !important" } }}
                          >
                            {headCell.label}
                          </TableSortLabel>
                        </MuiTooltip>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedAndPaginatedProductStats.map((stat) => (
                    <TableRow hover key={stat.productId} sx={{ "&:nth-of-type(odd)": { backgroundColor: theme.palette.action.hover } }}>
                      <TableCell component="th" scope="row">
                        <Typography variant="body2" fontWeight={500}>
                          {stat.nomProduit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{stat.totalQuantiteVendue.toLocaleString()}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="medium" color="secondary.dark">
                          {stat.totalMontantVendu.toLocaleString(undefined, {
                            minimumFractionDigits: devise === "XOF" || devise === "FCFA" ? 0 : 2,
                            maximumFractionDigits: 2,
                          })}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="success.dark">
                          {stat.totalMontantPercu.toLocaleString(undefined, {
                            minimumFractionDigits: devise === "XOF" || devise === "FCFA" ? 0 : 2,
                            maximumFractionDigits: 2,
                          })}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {sortedAndPaginatedProductStats.length > 0 &&
                    sortedAndPaginatedProductStats.length < rowsPerPage &&
                    Array.from({ length: rowsPerPage - sortedAndPaginatedProductStats.length }).map((_, index) => (
                      <TableRow key={`empty-${index}`} style={{ height: 53 }}>
                        <TableCell colSpan={4} />
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
              component="div"
              count={allAggregatedStats.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="Lignes/page:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
              getItemAriaLabel={(type) => {
                if (type === "first") return "Première page";
                if (type === "last") return "Dernière page";
                if (type === "next") return "Page suivante";
                return "Page précédente";
              }}
            />
          </Paper>
        )}
      </Box>
    </LocalizationProvider>
  );
}
