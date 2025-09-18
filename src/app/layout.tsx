"use client";

import React, { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { createTheme, ThemeProvider, CssBaseline, Box, Skeleton, Drawer } from "@mui/material";
import { Roboto } from 'next/font/google';
import { useAuth } from "@/hooks/useAuth";
import { NavigationEvents } from '@/components/NavigationEvents';
import { usePathname } from "next/navigation"; // <-- utilisé pour détecter la route POS

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const SIDEBAR_WIDTH = 260;

// Skeletons optimisés
const SidebarSkeleton = () => <Skeleton variant="rectangular" width={SIDEBAR_WIDTH} height="100vh" />;
const NavbarSkeleton = () => <Skeleton variant="rectangular" height={64} />;

// Components dynamiques
const Sidebar = dynamic(() => import("@/components/Sidebar"), {
  ssr: false,
  loading: () => <SidebarSkeleton />,
});
const Navbar = dynamic(() => import("@/components/Navbar"), {
  ssr: false,
  loading: () => <NavbarSkeleton />,
});

const theme = createTheme({
  palette: {
    primary: { main: "#1976d2" },
    secondary: { main: "#9c27b0" },
    background: { default: "#f4f6f8", paper: "#ffffff" },
  },
  typography: {
    fontFamily: roboto.style.fontFamily,
    h6: { fontWeight: 500 },
    body1: { lineHeight: 1.6 },
  },
  components: {
    MuiSkeleton: { defaultProps: { animation: 'wave' } },
  },
});

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const { user, loading: authLoading } = useAuth();

  // Détection de la route courante
  const pathname = usePathname() || "/";
  const isPosRoute = pathname === "/pos" || pathname.startsWith("/pos/");

  // Sidebar mobile
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const showUserNavigation = !authLoading && Boolean(user);

  const handleSidebarToggle = () => setMobileSidebarOpen(!isMobileSidebarOpen);
  const handleSidebarClose = () => setMobileSidebarOpen(false);

  const sidebarContent = (
    <Suspense fallback={<SidebarSkeleton />}>
      <Sidebar onClose={handleSidebarClose} />
    </Suspense>
  );

  return (
    <html lang="fr">
      <head />
      <body>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Suspense fallback={null}>
            <NavigationEvents />
          </Suspense>

          <Box sx={{ display: "flex", height: "100vh", width: "100vw", overflow: 'hidden' }}>
            {/* Si on est sur POS, on n'affiche PAS le sidebar. */}
            {!isPosRoute && showUserNavigation ? (
              <Box
                component="nav"
                sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}
                aria-label="navigation"
              >
                {/* Drawer temporaire pour mobile */}
                <Drawer
                  variant="temporary"
                  open={isMobileSidebarOpen}
                  onClose={handleSidebarToggle}
                  ModalProps={{ keepMounted: true }}
                  sx={{
                    display: { xs: 'block', md: 'none' },
                    '& .MuiDrawer-paper': { boxSizing: 'border-box', width: SIDEBAR_WIDTH },
                  }}
                >
                  {sidebarContent}
                </Drawer>

                {/* Drawer permanent pour desktop */}
                <Drawer
                  variant="permanent"
                  sx={{
                    display: { xs: 'none', md: 'block' },
                    '& .MuiDrawer-paper': { boxSizing: 'border-box', width: SIDEBAR_WIDTH },
                  }}
                  open
                >
                  {sidebarContent}
                </Drawer>
              </Box>
            ) : null}

            <Box
              component="main"
              sx={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                // Si POS -> occupe toute la largeur (ignore la présence du sidebar)
                width: isPosRoute ? "100vw" : { xs: '100%', md: `calc(100% - ${showUserNavigation ? SIDEBAR_WIDTH : 0}px)` },
                overflow: 'hidden',
              }}
            >
              {authLoading ? (
                <NavbarSkeleton />
              ) : (
                <Suspense fallback={<NavbarSkeleton />}>
                  {/* Passe le handler burger. Le Navbar peut choisir de le cacher si isPosRoute */}
                  <Navbar user={user} onMenuClick={handleSidebarToggle} />
                </Suspense>
              )}

              <Box
                sx={{
                  flexGrow: 1,
                  overflowY: "auto",
                  overflowX: "hidden",
                  p: isPosRoute ? 0 : { xs: 2, sm: 3 }, // POS souvent veut plus d'espace; tu peux ajuster
                  // Si tu veux que POS "colle" au bord de l'écran, p:0 est plus adapté
                }}
              >
                {authLoading ? (
                  <Box sx={{ p: 3 }}>
                    <Skeleton variant="text" sx={{ fontSize: '2.5rem', mb: 2 }} />
                    <Skeleton variant="rectangular" height={150} sx={{ mb: 1.5 }} />
                    <Skeleton variant="rectangular" height={150} />
                  </Box>
                ) : (
                  <Suspense fallback={<Skeleton variant="rectangular" width="100%" height="calc(100vh - 64px - 48px)" />}>
                    {children}
                  </Suspense>
                )}
              </Box>
            </Box>
          </Box>
        </ThemeProvider>
      </body>
    </html>
  );
}
