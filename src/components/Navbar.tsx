"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Toolbar,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  CircularProgress,
  Tooltip,
  Typography,
  Box,
  useTheme,
  Stack,
  Skeleton,
  Chip,
  Divider,
} from "@mui/material";
// --- NOUVEAUX IMPORTS ---
import MenuIcon from "@mui/icons-material/Menu";
import { User } from "firebase/auth";
// --- FIN NOUVEAUX IMPORTS ---
import HomeIcon from "@mui/icons-material/Home";
import StorefrontIcon from "@mui/icons-material/Storefront";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import RefreshIcon from "@mui/icons-material/Refresh";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { auth } from "@/lib/firebase";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

const db = getFirestore();

interface ShopData {
  id?: string;
  nom?: string;
  logoUrl?: string;
  devise?: string;
}

interface UserProfileData {
  fullName?: string;
  proprietaireId?: string;
  // you may have email in profile too — not required if using user.email
}

interface NavbarProps {
  user: User | null;
  onMenuClick: () => void;
}

export default function Navbar({ user, onMenuClick }: NavbarProps) {
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [shopData, setShopData] = useState<ShopData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingShop, setLoadingShop] = useState(true);
  const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);
  const [hasOwner, setHasOwner] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    const updateStatus = () => setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    updateStatus();
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        setUserProfile(null);
        setHasOwner(false);
        setLoadingProfile(false);
        return;
      }
      setLoadingProfile(true);
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        let data: UserProfileData = {};
        if (userDocSnap.exists()) {
          data = userDocSnap.data() as UserProfileData;
        } else {
          data.fullName = user.displayName || user.email?.split("@")[0] || "Utilisateur";
        }
        setUserProfile(data);
        setHasOwner(Boolean(data.proprietaireId));
      } catch (error) {
        console.error("Erreur de récupération du profil utilisateur:", error);
        setUserProfile({ fullName: user.displayName || user.email?.split("@")[0] || "Utilisateur" });
        setHasOwner(false);
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchUserProfile();
  }, [user]);

  useEffect(() => {
    if (!user?.uid) {
      setShopData(null);
      setLoadingShop(false);
      return;
    }
    const fetchShopData = async () => {
      setLoadingShop(true);
      try {
        const q = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const shopDocument = querySnapshot.docs[0];
          setShopData({
            id: shopDocument.id,
            ...(shopDocument.data() as any),
          } as ShopData);
        } else {
          setShopData({ nom: "Espace Personnel" });
        }
      } catch (error) {
        console.error("Erreur de récupération des données de la boutique:", error);
        setShopData({ nom: "Erreur Boutique" });
      } finally {
        setLoadingShop(false);
      }
    };
    fetchShopData();
  }, [user?.uid]);

  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorElUser(event.currentTarget);
  const handleCloseUserMenu = () => setAnchorElUser(null);

  const handleLogout = async () => {
    handleCloseUserMenu();
    await auth.signOut();
    router.replace("/login");
  };

  const isLoading = loadingProfile || loadingShop;
  const userDisplayName = userProfile?.fullName || user?.displayName || "Mon Compte";
  const userEmail = user?.email || "";

  // Refresh handler: utilise router.refresh si possible, sinon full reload
  const handleRefresh = () => {
    try {
      router.refresh();
    } catch {
      window.location.reload();
    }
  };

  // Styles pour le chip Online/Offline (rempli)
  const onlineChipSx = {
    bgcolor: theme.palette.success.main,
    color: theme.palette.getContrastText(theme.palette.success.main),
    fontWeight: 600,
    mr: 2,
    display: { xs: "none", sm: "flex" },
    textTransform: "uppercase",
  } as const;

  const offlineChipSx = {
    bgcolor: theme.palette.warning.main,
    color: theme.palette.getContrastText(theme.palette.warning.main),
    fontWeight: 600,
    mr: 2,
    display: { xs: "none", sm: "flex" },
    textTransform: "uppercase",
  } as const;

  return (
    <AppBar
      position="sticky"
      sx={{
        bgcolor: "background.paper",
        color: "text.primary",
        borderBottom: `1px solid ${theme.palette.divider}`,
        boxShadow: "none",
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 1, sm: 2 } }}>
        {user && (
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={onMenuClick}
            sx={{ mr: 2, display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
        )}

        <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
          <Tooltip title={shopData?.nom || "Accueil Boutique"}>
            <IconButton component={Link} href="/dashboard" edge={false} color="inherit" disabled={isLoading} sx={{ p: 0.5, mr: 1 }}>
              {isLoading ? (
                <Skeleton variant="circular" width={32} height={32} />
              ) : (
                <Avatar src={shopData?.logoUrl} alt={shopData?.nom || "L"} sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: "1rem" }}>
                  {!shopData?.logoUrl && <StorefrontIcon fontSize="small" />}
                </Avatar>
              )}
            </IconButton>
          </Tooltip>

          {isLoading ? (
            <Skeleton variant="text" width={120} />
          ) : (
            <Typography variant="h6" noWrap component={Link} href="/dashboard" sx={{ color: "inherit", textDecoration: "none", fontWeight: 600, display: { xs: "none", sm: "block" } }}>
              {shopData?.nom || "Ma Boutique"}
            </Typography>
          )}
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Stack direction="row" spacing={1} sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", mr: 2 }}>
          <Tooltip title="Accueil">
            <IconButton component={Link} href="/" color="inherit" disabled={isLoading}>
              <HomeIcon />
            </IconButton>
          </Tooltip>

          {hasOwner && (
            <Tooltip title="Gestion de la boutique">
              <IconButton component={Link} href="/boutique" color="inherit" disabled={isLoading}>
                <StorefrontIcon color="success" />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="Actualiser la page">
            <IconButton onClick={handleRefresh} color="inherit" disabled={isLoading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          {hasOwner && (
            <Tooltip title="Aide">
              <IconButton component={Link} href="/aide" color="inherit" disabled={isLoading}>
                <HelpOutlineIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        {/* Statut Online/Offline (case remplie) */}
        {user && (isOnline ? (
          <Chip label="EN LIGNE" size="small" sx={onlineChipSx} />
        ) : (
          <Chip label="HORS LIGNE" size="small" sx={offlineChipSx} />
        ))}

        {/* Menu Utilisateur */}
        <Box>
          {isLoading ? (
            <Skeleton variant="circular" width={40} height={40} />
          ) : user ? (
            <>
              <Tooltip title="Mon compte">
                <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                  <Avatar alt={userDisplayName} src={user.photoURL || undefined} sx={{ width: 40, height: 40, bgcolor: "secondary.main" }}>
                    {!user.photoURL && (userDisplayName ? userDisplayName.charAt(0).toUpperCase() : <AccountCircleIcon />)}
                  </Avatar>
                </IconButton>
              </Tooltip>

              <Menu anchorEl={anchorElUser} open={Boolean(anchorElUser)} onClose={handleCloseUserMenu} PaperProps={{ sx: { minWidth: 220 } }}>
                {/* Header with avatar + name + email */}
                <Box sx={{ px: 2, py: 1.25, display: "flex", gap: 1.5, alignItems: "center" }}>
                  <Avatar src={user.photoURL || undefined} alt={userDisplayName} sx={{ width: 48, height: 48, bgcolor: "secondary.main" }}>
                    {!user.photoURL && (userDisplayName ? userDisplayName.charAt(0).toUpperCase() : <AccountCircleIcon />)}
                  </Avatar>
                  <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
                      {userDisplayName}
                    </Typography>
                    <Typography variant="caption" noWrap color="text.secondary">
                      {userEmail || "—"}
                    </Typography>
                  </Box>
                </Box>

                <Divider />

                {/* Only logout */}
                <MenuItem onClick={handleLogout} sx={{ mt: 0.5 }}>
                  <ExitToAppIcon sx={{ mr: 1 }} fontSize="small" /> Se déconnecter
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Tooltip title="Se connecter">
              <IconButton component={Link} href="/login" color="inherit">
                <AccountCircleIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
