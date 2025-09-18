// src/components/SalesOverview.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  useTheme, // Gardé si vous l'utilisez pour des couleurs spécifiques ailleurs
  CircularProgress,
  Grid,
} from "@mui/material";
// DatePicker n'est plus utilisé si le filtre personnalisé est enlevé
// import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
// import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore"; // Ajout de Timestamp
import { auth, db } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  ResponsiveContainer,
  BarChart, // Changé de ComposedChart à BarChart pour le graphique des ventes journalières
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface SaleItem {
  total: number;
  productId: string;
  // Ajoutez d'autres champs si nécessaire, par exemple quantity, price
}

interface Sale {
  id: string;
  timestamp: Timestamp; // Utiliser directement Timestamp de Firebase
  items: Array<SaleItem>;
  grandTotal?: number; // Ajouter si vous avez un champ grandTotal pour la vente
  // Ajoutez d'autres champs de vente si nécessaire
}

// Couleurs prédéfinies pour une meilleure cohérence visuelle
const PREDEFINED_COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
  '#FF5733', '#C70039', '#900C3F', '#581845', '#2E86C1',
  '#1ABC9C', '#F1C40F', '#E67E22', '#9B59B6', '#34495E',
];

// Fonction pour obtenir la date de manière robuste
const getDate = (val: unknown): Date => {
    if (val instanceof Timestamp) return val.toDate();
    if (typeof val === 'string') {
      const parsedDate = new Date(val);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    if (typeof val === 'object' && val !== null && typeof val.seconds === 'number') {
      return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
    }
    // console.warn("getDate received an unrecognized date format:", val);
    return new Date(0); // Retourner une date invalide ou gérer l'erreur
};


export default function SalesOverview() {
  const theme = useTheme(); // Peut être utilisé pour des couleurs spécifiques si besoin
  const [user] = useAuthState(auth);
  // boutiqueId n'est pas utilisé après sa définition, peut être enlevé si non nécessaire
  // const [boutiqueId, setBoutiqueId] = useState<string | null>(null); 
  const [devise, setDevise] = useState<string>("FCFA"); // Ajout de la devise

  const [sales, setSales] = useState<Sale[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, { categoryId: string, name: string }>>({}); // Stocker plus d'infos produit
  const [categoriesMap, setCategoriesMap] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<"3days" | "week" | "month">("3days");
  // customDate n'est plus utilisé car le filtre personnalisé a été retiré
  // const [customDate, setCustomDate] = useState<Date | null>(new Date());

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const qb = query(
      collection(db, "boutiques"),
      where("utilisateursIds", "array-contains", user.uid)
    );

    const unsubscribes: (() => void)[] = [];
    let dataSourcesCount = 4; // boutiques, sales, products, categories
    
    const checkAllDataLoaded = () => {
        dataSourcesCount--;
        if (dataSourcesCount === 0) {
            setLoading(false);
        }
    };

    const unb = onSnapshot(qb, snap => {
      if (!snap.empty) {
        const boutiqueDoc = snap.docs[0];
        const bId = boutiqueDoc.id;
        const boutiqueData = boutiqueDoc.data();
        // setBoutiqueId(bId); // Décommenter si boutiqueId est nécessaire
        if (boutiqueData.devise) {
            setDevise(boutiqueData.devise as string);
        }
        checkAllDataLoaded(); // Compter la boutique comme source chargée

        unsubscribes.push(onSnapshot(
          collection(db, "boutiques", bId, "sales"),
          ss => {
            setSales(ss.docs.map(d => ({ id: d.id, ...(d.data() as Sale) })));
            checkAllDataLoaded();
          }, err => { console.error("Error fetching sales: ", err); checkAllDataLoaded();}
        ));
        
        unsubscribes.push(onSnapshot(
          collection(db, "boutiques", bId, "products"),
          pp => {
            const m: Record<string, { categoryId: string, name: string }> = {};
            pp.docs.forEach(d => {
              const data = d.data() as unknown;
              m[d.id] = { categoryId: data.categoryId, name: data.nom || data.name || "Produit inconnu" };
            });
            setProductsMap(m);
            checkAllDataLoaded();
          }, err => { console.error("Error fetching products: ", err); checkAllDataLoaded();}
        ));
        
        unsubscribes.push(onSnapshot(
          // Assurez-vous que le nom de la collection est correct, ex: "categories"
          collection(db, "boutiques", bId, "categories"), 
          cc => {
            const m: Record<string, string> = {};
            cc.docs.forEach(d => {
              const data = d.data() as unknown;
              m[d.id] = data.nom || data.name || "Catégorie inconnue"; // 'nom' ou 'name'
            });
            setCategoriesMap(m);
            checkAllDataLoaded();
          }, err => { console.error("Error fetching categories: ", err); checkAllDataLoaded();}
        ));
      } else {
        setLoading(false); // Pas de boutique trouvée
      }
    }, err => { console.error("Error fetching boutique: ", err); setLoading(false);});
    unsubscribes.push(unb);

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user]);

  const filteredSales = useMemo(() => {
    const nowTime = new Date().getTime();
    let cutoffTime;
    const today = new Date();
    today.setHours(0,0,0,0);

    switch (period) {
        case "3days":
            cutoffTime = new Date(today).setDate(today.getDate() - 2); // Aujourd'hui + 2 jours précédents
            break;
        case "week":
            const firstDayOfWeek = new Date(today);
            firstDayOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // Lundi
            cutoffTime = firstDayOfWeek.getTime();
            break;
        case "month":
            cutoffTime = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
            break;
        default:
            cutoffTime = nowTime - 3 * 24 * 3600 * 1000; // Fallback
    }
    
    return sales.filter(s => {
      const saleTime = getDate(s.timestamp).getTime();
      return saleTime >= cutoffTime;
    });
  }, [sales, period]);

  // MODIFIÉ: Total des ventes par jour (pour graphique en bandes)
  const salesByDay = useMemo(() => {
    const dailyData: Record<string, number> = {};
    filteredSales.forEach(sale => {
      const date = getDate(sale.timestamp);
      const dayKey = date.toLocaleDateString("fr-FR", {
        // weekday: 'short', // Optionnel: 'lun.', 'mar.', etc.
        day: "2-digit",
        month: "2-digit",
      });
      const saleTotal = sale.grandTotal ?? sale.items.reduce((sum, item) => sum + item.total, 0);
      dailyData[dayKey] = (dailyData[dayKey] || 0) + saleTotal;
    });

    return Object.entries(dailyData)
      .map(([day, total]) => ({
        name: day, // 'name' est souvent utilisé par Recharts pour l'axe X
        ventes: total,
      }))
      .sort((a, b) => { // Tri chronologique
        const [dayA, monthA] = a.name.split('/');
        const [dayB, monthB] = b.name.split('/');
        return new Date(2000, parseInt(monthA) - 1, parseInt(dayA)).getTime() - 
               new Date(2000, parseInt(monthB) - 1, parseInt(dayB)).getTime();
      });
  }, [filteredSales]);

  const salesByCat = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const productInfo = productsMap[item.productId];
        if (productInfo && productInfo.categoryId) {
          const categoryName = categoriesMap[productInfo.categoryId] || "Catégorie Inconnue";
          categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + item.total;
        } else {
            // Optionnel: grouper les produits sans catégorie ou sans info produit
            const unknownCat = "Produits non catégorisés";
            categoryTotals[unknownCat] = (categoryTotals[unknownCat] || 0) + item.total;
        }
      });
    });

    return Object.entries(categoryTotals)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .filter(cat => cat.value > 0) // Ne pas afficher les catégories avec 0 ventes
      .sort((a,b) => b.value - a.value); // Trier pour que le Pie Chart soit ordonné
  }, [filteredSales, productsMap, categoriesMap]);

  
  // Les couleurs sont maintenant tirées de PREDEFINED_COLORS pour le PieChart
  // const colorsForPie = useMemo(
  //   () => salesByCat.map((_, index) => PREDEFINED_COLORS[index % PREDEFINED_COLORS.length]),
  //   [salesByCat]
  // );

  if (loading) { // Simplifié: afficher le loader tant que loading est true
    return (
      <Box display="flex" justifyContent="center" alignItems="center" sx={{ p: 4, height: 300 }}>
        <CircularProgress />
        <Typography sx={{ml: 2}}>Chargement des données...</Typography>
      </Box>
    );
  }
  
  if (!user) {
    return (
      <Box textAlign="center" py={4}>
        <Typography>Veuillez vous connecter pour voir les aperçus des ventes.</Typography>
      </Box>
    );
  }

  if (sales.length === 0 && !loading) {
     return (
      <Box textAlign="center" py={4}>
        <Typography>Aucune donnée de vente à afficher pour le moment.</Typography>
      </Box>
    );   
  }

  return (
    <Box sx={{p: {xs: 1, sm: 2}}}>
      <Paper
        sx={{
          p: 2,
          mb: 3,
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Aperçu des Ventes
        </Typography>
        <ToggleButtonGroup
          value={period}
          exclusive
          size="small"
          onChange={(_, v) => {
            if (v !== null) setPeriod(v);
          }}
        >
          <ToggleButton value="3days">3 Jours</ToggleButton>
          <ToggleButton value="week">Semaine</ToggleButton>
          <ToggleButton value="month">Mois</ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      <Grid container spacing={3}>
        {/* GRAPHIQUE VENTES PAR JOUR (en bandes) */}
        <Grid item xs={12}> {/* Occupe toute la largeur, sera au-dessus */}
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: theme.shadows[1], height: '100%' }}>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Total des Ventes par Jour
            </Typography>
            {salesByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart 
                data={salesByDay}
                margin={{
                    top: 5,
                    right: 0, // Pas besoin de marge à droite si pas de YAxis à droite
                    left: -25, // Ajuster si les labels de YAxis sont coupés
                    bottom: 20, // Espace pour les labels de XAxis
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11 }}
                    angle={salesByDay.length > 7 ? -30 : 0} // Incliner si beaucoup de jours
                    textAnchor={salesByDay.length > 7 ? "end" : "middle"}
                    interval={0} // Afficher tous les jours
                />
                <YAxis 
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => value >= 1000 ? `${value/1000}k` : value.toLocaleString()}
                />
                <ReTooltip 
                    formatter={(value: number) => [`${value.toLocaleString("fr-FR")} ${devise}`, "Ventes"]}
                    labelStyle={{ fontWeight: 'bold' }}
                    contentStyle={{ borderRadius: '8px', boxShadow: theme.shadows[3] }}
                />
                <Bar dataKey="ventes" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} barSize={salesByDay.length < 10 ? 40 : undefined} />
              </BarChart>
            </ResponsiveContainer>
            ) : (
                <Box display="flex" justifyContent="center" alignItems="center" height={300}>
                    <Typography color="text.secondary">Aucune vente pour cette période.</Typography>
                </Box>
            )}
          </Paper>
        </Grid>

        {/* GRAPHIQUE VENTES PAR CATEGORIES (Pie Chart) */}
        <Grid item xs={12}> {/* Occupe toute la largeur, sera en-dessous */}
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: theme.shadows[1], height: '100%' }}>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Répartition des Ventes par Catégorie
            </Typography>
            {salesByCat.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}> {/* Augmenté un peu la hauteur pour la légende */}
              <PieChart margin={{ top: 0, right: 0, bottom: 30, left: 0 }}> {/* Marge en bas pour la légende */}
                <Pie
                  data={salesByCat}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent, value }) => 
                    `${name}: ${(percent * 100).toFixed(0)}% (${value.toLocaleString('fr-FR')} ${devise})`
                  }
                  outerRadius="75%" // Ajuster pour la lisibilité des labels
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  // minAngle={1} // Pour éviter les tranches trop fines
                >
                  {salesByCat.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PREDEFINED_COLORS[index % PREDEFINED_COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip 
                    formatter={(value: number, name: string) => [`${value.toLocaleString("fr-FR")} ${devise}`, name]}
                    labelStyle={{ fontWeight: 'bold' }}
                    contentStyle={{ borderRadius: '8px', boxShadow: theme.shadows[3] }}
                />
                <Legend 
                    verticalAlign="bottom" 
                    wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                    // iconSize={10}
                    // layout="vertical" align="right" // Alternative de légende
                />
              </PieChart>
            </ResponsiveContainer>
            ) : (
                <Box display="flex" justifyContent="center" alignItems="center" height={350}>
                    <Typography color="text.secondary">Aucune vente par catégorie pour cette période.</Typography>
                </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}