"use client";

import Link from "next/link";
import * as React from "react";
import { useState, useEffect } from "react";
import { usePathname } from 'next/navigation';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Collapse,
  useTheme,
  CircularProgress,
} from "@mui/material";

import { Poppins } from 'next/font/google';
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import VerifiedIcon from '@mui/icons-material/Verified';

// --- Icônes Outlined ---
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined'; // Tableau de bord
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined"; // Stocks (parent)
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'; // Ventes (parent)
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined'; // Ajouter produit, Ajouter vente
import FormatListBulletedOutlinedIcon from "@mui/icons-material/FormatListBulletedOutlined"; // Gestion des produits, Gestion des ventes
import AssignmentReturnOutlinedIcon from '@mui/icons-material/AssignmentReturnOutlined'; // Retours produits
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined"; // POS
import LocalAtmOutlinedIcon from '@mui/icons-material/LocalAtmOutlined'; // Gestion de caisse
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'; // Gestion des clients (Créances)
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'; // Inventaire
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined'; // Dépenses (remplace ReceiptLong)
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'; // Achats
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'; // Fournisseur
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined'; // Stats
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined'; // Aide & Support
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
});

// --- Palette de Couleurs "Professionnel" avec Bleu Moderne ---
const SIDEBAR_BG_COLOR = '#1A202C';
const TEXT_COLOR_INACTIVE = '#B0BEC5';
const TEXT_COLOR_HOVER = '#FFFFFF';
const ICON_COLOR_INACTIVE = '#78909C';
const ICON_COLOR_HOVER = '#FFFFFF';
const PRIMARY_ACCENT_COLOR = '#2563EB';
const HOVER_BG_COLOR = '#2D3748';
const SELECTED_BG_COLOR = '#252E3A';
const DIVIDER_COLOR = 'rgba(255, 255, 255, 0.07)';
// --- Fin Palette ---

const SIDEBAR_WIDTH = 260;

export default function Sidebar() {
  const [openStock, setOpenStock] = useState(false);
  const [openSales, setOpenSales] = useState(false);
  const pathname = usePathname();
  const theme = useTheme();

  // Auth + role state
  const [user, loadingAuth] = useAuthState(auth);
  const [role, setRole] = useState<string | null | undefined>(undefined); // undefined = loading, null = no user or not found

  useEffect(() => {
    const currentPath = pathname || "/";
    if (currentPath.startsWith("/produits")) {
      setOpenStock(true);
    }
    if (currentPath.startsWith("/ventes") || currentPath === "/retours") {
      setOpenSales(true);
    }
  }, [pathname]);

  // Load role once per user and cache in localStorage
  useEffect(() => {
    let cancelled = false;
    const fetchRole = async () => {
      if (!user) {
        // no user -> clear role
        setRole(null);
        return;
      }

      const cacheKey = `role_${user.uid}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setRole(cached === "null" ? null : cached);
          return;
        }
      } catch (e) {
        console.warn("localStorage read failed for role cache:", e);
      }

      try {
        const userDocRef = doc(db, "users", user.uid);
        const snap = await getDoc(userDocRef);
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          const r = (data.role && String(data.role).toLowerCase()) || null;
          setRole(r);
          try {
            if (r) localStorage.setItem(cacheKey, r);
            else localStorage.setItem(cacheKey, "null");
          } catch (e) {
            // ignore localStorage set errors
          }
        } else {
          setRole(null);
        }
      } catch (error) {
        console.error("Erreur récupération role utilisateur:", error);
        setRole(null);
      }
    };

    fetchRole();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---- Permission mapping according to your spec ----
  const isAdmin = role === 'admin';
  const isGerant = role === 'gerant';
  const isStock = role === 'stock';
  const isCaisse = role === 'caisse';

  // Based on the rules you gave:
  const canDashboard = isAdmin || isGerant;
  const canStock = isAdmin || isGerant || isStock;
  const canVentes = isAdmin || isGerant;
  const canCaisse = isAdmin || isGerant || isCaisse;
  const canClients = isAdmin || isGerant || isCaisse; // Client = créance
  const canInventaire = isAdmin || isGerant || isStock;
  const canDepenses = isAdmin || isGerant || isCaisse;
  const canAchats = isAdmin || isStock; // Admin and STOCK role have achats per spec
  const canFournisseurs = isAdmin; // only ADMIN per spec
  const canStats = isAdmin || isGerant || isStock;
  const canPOS = isAdmin || isGerant;
  // ----------------------------------------------------

  const commonListItemStyles = {
    px: 3,
    py: 1.2,
    color: TEXT_COLOR_INACTIVE,
    borderRadius: '8px',
    margin: theme.spacing(0.6, 2),
    transition: 'background-color 0.2s ease-out, color 0.2s ease-out, border-left-color 0.2s ease-out',
    borderLeft: `3px solid transparent`,
    '& .MuiListItemIcon-root': {
      color: ICON_COLOR_INACTIVE,
      minWidth: '40px',
      transition: 'color 0.2s ease-out',
    },
    '& .MuiListItemText-primary': {
        fontSize: '0.9rem',
        fontWeight: 400,
    },
    '&:hover': {
      bgcolor: HOVER_BG_COLOR,
      color: TEXT_COLOR_HOVER,
      borderLeftColor: HOVER_BG_COLOR,
      '& .MuiListItemIcon-root': {
        color: ICON_COLOR_HOVER,
      },
      '& .MuiListItemText-primary': {
        fontWeight: 500,
      }
    },
    '&.Mui-selected': {
      bgcolor: SELECTED_BG_COLOR,
      color: PRIMARY_ACCENT_COLOR,
      borderLeftColor: PRIMARY_ACCENT_COLOR,
      '& .MuiListItemIcon-root': {
        color: PRIMARY_ACCENT_COLOR,
      },
      '& .MuiListItemText-primary': {
        fontWeight: 600,
      },
      '&:hover': {
        bgcolor: SELECTED_BG_COLOR,
        borderLeftColor: PRIMARY_ACCENT_COLOR,
      }
    },
  };

  const subListItemStyles = {
    ...commonListItemStyles,
    pl: `calc(${theme.spacing(3)} + 3px + ${theme.spacing(2)})`,
    py: 0.9,
    margin: theme.spacing(0.4, 2, 0.4, 2),
    borderLeft: `3px solid transparent`,
    '& .MuiListItemText-primary': {
        fontSize: '0.825rem',
        fontWeight: 400,
    },
    '&.Mui-selected': {
      bgcolor: 'transparent',
      color: PRIMARY_ACCENT_COLOR,
      borderLeftColor: PRIMARY_ACCENT_COLOR,
      '& .MuiListItemIcon-root': {
        color: PRIMARY_ACCENT_COLOR,
      },
      '& .MuiListItemText-primary': {
        fontWeight: 500,
      },
      '&:hover': {
        bgcolor: HOVER_BG_COLOR,
        color: TEXT_COLOR_HOVER,
        borderLeftColor: HOVER_BG_COLOR,
         '& .MuiListItemIcon-root': {
            color: ICON_COLOR_HOVER,
        },
      }
    },
  };

  const isParentActive = (basePath: string) => pathname?.startsWith(basePath);

  return (
    <Box
      className={poppins.className}
      sx={{
        width: SIDEBAR_WIDTH,
        bgcolor: SIDEBAR_BG_COLOR,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: theme.zIndex.drawer + 10,
        borderRight: `1px solid ${DIVIDER_COLOR}`,
      }}
    >
      <Box sx={{
          bgcolor: PRIMARY_ACCENT_COLOR,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '64px',
        }}>
        <Typography
          variant="h6"
          className={poppins.className}
          sx={{
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '1.3rem',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          Maskym Loumo
        </Typography>
      </Box>

      <Box sx={{
        flexGrow: 1,
        overflowY: 'auto',
        pt: theme.spacing(1),
        pb: theme.spacing(1),
        '&::-webkit-scrollbar': { width: '6px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { background: HOVER_BG_COLOR, borderRadius: '3px' },
        '&::-webkit-scrollbar-thumb:hover': { background: PRIMARY_ACCENT_COLOR }
      }}>
        <List component="nav" disablePadding>
          {/* If role is still undefined (loading), show a spinner while we fetch role */}
          {role === undefined && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} thickness={6} />
            </Box>
          )}

          {/* Tableau de bord */}
          {role !== undefined && canDashboard && (
            <ListItemButton component={Link} href="/dashboard" selected={pathname === "/dashboard"} sx={commonListItemStyles}>
              <ListItemIcon><SpaceDashboardOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Tableau de bord" />
            </ListItemButton>
          )}

          {/* Stocks */}
          {role !== undefined && canStock && (
            <>
              <ListItemButton
                onClick={() => setOpenStock(!openStock)}
                sx={commonListItemStyles}
                selected={isParentActive("/produits") && pathname !== "/produits"}
              >
                <ListItemIcon><Inventory2OutlinedIcon /></ListItemIcon>
                <ListItemText primary="Stocks" />
                {openStock || isParentActive("/produits") ? <ExpandLessIcon sx={{color: isParentActive("/produits") ? PRIMARY_ACCENT_COLOR : ICON_COLOR_INACTIVE }} /> : <ExpandMoreIcon />}
              </ListItemButton>
              <Collapse in={openStock || isParentActive("/produits")} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  <ListItemButton component={Link} href="/produits/ajouter" selected={pathname === "/produits/ajouter"} sx={subListItemStyles}>
                    <ListItemIcon><AddCircleOutlineOutlinedIcon sx={{ fontSize: '1.2rem' }} /></ListItemIcon>
                    <ListItemText primary="Ajouter produit" />
                  </ListItemButton>
                  <ListItemButton component={Link} href="/produits/list" selected={pathname === "/produits/list"} sx={subListItemStyles}>
                    <ListItemIcon><FormatListBulletedOutlinedIcon sx={{ fontSize: '1.2rem' }} /></ListItemIcon>
                    <ListItemText primary="Gestion des produits" />
                  </ListItemButton>
                </List>
              </Collapse>
            </>
          )}

          {/* Ventes */}
          {role !== undefined && canVentes && (
            <>
              <ListItemButton
                onClick={() => setOpenSales(!openSales)}
                sx={commonListItemStyles}
                selected={(isParentActive("/ventes") || isParentActive("/retours")) && pathname !== "/ventes" && pathname !== "/retours" }
              >
                <ListItemIcon><StorefrontOutlinedIcon /></ListItemIcon>
                <ListItemText primary="Ventes" />
                {openSales || isParentActive("/ventes") || isParentActive("/retours") ? <ExpandLessIcon sx={{color: (isParentActive("/ventes") || isParentActive("/retours")) ? PRIMARY_ACCENT_COLOR : ICON_COLOR_INACTIVE }} /> : <ExpandMoreIcon />}
              </ListItemButton>
              <Collapse in={openSales || isParentActive("/ventes") || isParentActive("/retours")} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  <ListItemButton component={Link} href="/ventes/ajouter" selected={pathname === "/ventes/ajouter"} sx={subListItemStyles}>
                    <ListItemIcon><AddCircleOutlineOutlinedIcon sx={{ fontSize: '1.2rem' }} /></ListItemIcon>
                    <ListItemText primary="Ajouter vente" />
                  </ListItemButton>
                  <ListItemButton component={Link} href="/ventes/list" selected={pathname === "/ventes/list"} sx={subListItemStyles}>
                    <ListItemIcon><FormatListBulletedOutlinedIcon sx={{ fontSize: '1.2rem' }} /></ListItemIcon>
                    <ListItemText primary="Gestion des ventes" />
                  </ListItemButton>
                  <ListItemButton component={Link} href="/retours" selected={pathname === "/retours"} sx={subListItemStyles}>
                    <ListItemIcon><AssignmentReturnOutlinedIcon sx={{ fontSize: '1.2rem' }} /></ListItemIcon>
                    <ListItemText primary="Retours produits" />
                  </ListItemButton>
                </List>
              </Collapse>
            </>
          )}

          <Divider sx={{ borderColor: DIVIDER_COLOR, marginY: 1.2, marginX: 2.5 }} />

          {/* POS */}
          {role !== undefined && canPOS && (
            <ListItemButton component={Link} href="/pos" selected={pathname === "/pos"} sx={commonListItemStyles}>
              <ListItemIcon><PointOfSaleOutlinedIcon /></ListItemIcon>
              <ListItemText primary="POS" />
            </ListItemButton>
          )}

          {/* Gestion de caisse */}
          {role !== undefined && canCaisse && (
            <ListItemButton component={Link} href="/caisse" selected={pathname === "/caisse"} sx={commonListItemStyles}>
              <ListItemIcon><LocalAtmOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Gestion de caisse" />
            </ListItemButton>
          )}

          {/* Gestion des clients (Créances) */}
          {role !== undefined && canClients && (
            <ListItemButton component={Link} href="/creances" selected={pathname === "/creances"} sx={commonListItemStyles}>
              <ListItemIcon><GroupOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Gestion des clients" />
            </ListItemButton>
          )}

          {/* Inventaire */}
          {role !== undefined && canInventaire && (
            <ListItemButton component={Link} href="/inventaire" selected={pathname === "/inventaire"} sx={commonListItemStyles}>
              <ListItemIcon><FactCheckOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Inventaire" />
            </ListItemButton>
          )}

          {/* Dépenses */}
          {role !== undefined && canDepenses && (
            <ListItemButton component={Link} href="/depenses" selected={pathname === "/depenses"} sx={commonListItemStyles}>
              <ListItemIcon><PaymentsOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Dépenses" />
            </ListItemButton>
          )}

          {/* Achats */}
          {role !== undefined && canAchats && (
            <ListItemButton component={Link} href="/achats" selected={pathname === "/achats"} sx={commonListItemStyles}>
              <ListItemIcon><ShoppingCartOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Achats" />
            </ListItemButton>
          )}

          {/* Fournisseurs */}
          {role !== undefined && canFournisseurs && (
            <ListItemButton component={Link} href="/fournisseur" selected={pathname === "/fournisseur"} sx={commonListItemStyles}>
              <ListItemIcon><LocalShippingOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Fournisseurs" />
            </ListItemButton>
          )}

          {/* Stats */}
          {role !== undefined && canStats && (
            <ListItemButton component={Link} href="/stats" selected={pathname === "/stats"} sx={commonListItemStyles}>
              <ListItemIcon><BarChartOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Statistiques" />
            </ListItemButton>
          )}
        </List>
      </Box>

      <Box sx={{ mt: 'auto' }}>
        <Divider sx={{ borderColor: DIVIDER_COLOR }} />
        <Box sx={{
            p: 1.5,
            textAlign: "center",
            minHeight: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1
          }}>
          <VerifiedIcon sx={{ color: PRIMARY_ACCENT_COLOR, fontSize: 16 }} />
          <Typography variant="caption" sx={{ color: ICON_COLOR_INACTIVE, fontSize: '0.75rem', fontWeight: 300 }}>
            @Loumo , v1.2.1
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
