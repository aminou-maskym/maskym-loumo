"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Avatar,
  Stack,
  useTheme,
  Paper,
  alpha,
  CircularProgress,
} from "@mui/material";
import { Poppins } from "next/font/google";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  PointOfSale,
  Wallet,
  Inventory2,
  People,
  ReceiptLong,
  ShoppingCart,
  QueryStats,
  Settings,
  ArrowForward,
  AutoAwesome,
} from "@mui/icons-material";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const poppins = Poppins({ subsets: ["latin"], weight: ["300", "400", "600", "700"] });

type Role = "admin" | "gerant" | "caisse" | "stock" | null;

function useCachedUserRole() {
  const [user, loadingAuth] = useAuthState(auth);
  const [role, setRole] = useState<Role | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    const fetchRole = async () => {
      if (!user) {
        if (mounted) setRole(null);
        return;
      }
      const cacheKey = `user_role_${user.uid}`;
      try {
        const cachedRole = localStorage.getItem(cacheKey);
        if (cachedRole) {
          if (mounted) setRole(cachedRole as Role);
          return;
        }
      } catch (e) {
        console.warn("Could not read role from localStorage", e);
      }

      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!mounted) return;
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const userRole = (userData?.role?.toLowerCase() as Role) || null;
          setRole(userRole);
          try {
            localStorage.setItem(cacheKey, userRole || "null");
          } catch (e) {
            console.warn("Could not write role to localStorage", e);
          }
        } else {
          setRole(null);
        }
      } catch (err) {
        console.error("Erreur récupération rôle:", err);
        setRole(null);
      }
    };

    fetchRole();
    return () => {
      mounted = false;
    };
  }, [user, loadingAuth]);

  return { role, loadingAuth, user };
}

const shortcutsDefinition = [
  { id: "settings", title: "Tableau de Bord", desc: "accedez au tableau de bord.", icon: <Settings sx={{ fontSize: 18 }} />, href: "/dashboard", roles: ["admin", "gerant"] as Role[], color: "success" },
  { id: "pos", title: "Point de Vente", desc: "Encaissez rapidement vos clients.", icon: <PointOfSale sx={{ fontSize: 18 }} />, href: "/pos", roles: ["admin", "gerant"] as Role[], color: "primary" },
  { id: "caisse", title: "Ma Caisse", desc: "Suivez les flux de votre caisse.", icon: <Wallet sx={{ fontSize: 18 }} />, href: "/caisse", roles: ["admin", "gerant", "caisse"] as Role[], color: "secondary" },
  { id: "stock", title: "Produits", desc: "Gérez votre catalogue et vos stocks.", icon: <Inventory2 sx={{ fontSize: 18 }} />, href: "/produits/list", roles: ["admin", "gerant", "stock"] as Role[], color: "success" },
  { id: "inventaire", title: "Inventaire", desc: "Ajustez et contrôlez vos stocks.", icon: <Inventory2 sx={{ fontSize: 18 }} />, href: "/inventaire", roles: ["admin", "gerant", "stock"] as Role[], color: "info" },
  { id: "clients", title: "Clients & Créances", desc: "Suivez les paiements et les crédits.", icon: <People sx={{ fontSize: 18 }} />, href: "/creances", roles: ["admin", "gerant", "caisse"] as Role[], color: "warning" },
  { id: "depenses", title: "Dépenses", desc: "Enregistrez toutes vos sorties.", icon: <ReceiptLong sx={{ fontSize: 18 }} />, href: "/depenses", roles: ["admin", "gerant", "caisse"] as Role[], color: "error" },
  { id: "achats", title: "Achats", desc: "Gérez fournisseurs et commandes.", icon: <ShoppingCart sx={{ fontSize: 18 }} />, href: "/achats", roles: ["admin", "gerant"] as Role[], color: "primary" },
  { id: "stats", title: "Statistiques", desc: "Analysez vos performances.", icon: <QueryStats sx={{ fontSize: 18 }} />, href: "/stats", roles: ["admin", "gerant", "stock"] as Role[], color: "secondary" },
];

// Motion-wrapped MUI primitives
const MotionBox = motion(Box);
const MotionCard = motion(Card);
const MotionTypography = motion(Typography);

// --- CONTINUOUS MARQUEE (REAL-TIME MOVING TEXT) ---
function MovingMarquee({ text = "Ventes • Stocks • Dépenses • Rapports • Clients • Achats", speed = 14 }: { text?: string; speed?: number }) {
  const shouldReduce = useReducedMotion();
  // Duplicate text so marquee is continuous
  const content = `${text} — ` + text;

  return (
    <Box sx={{ overflow: "hidden", width: "100%", mt: 1 }}>
      <MotionBox
        aria-hidden
        initial={shouldReduce ? {} : { x: 0 }}
        animate={shouldReduce ? {} : { x: [0, -100] }}
        transition={shouldReduce ? {} : { x: { repeat: Infinity, repeatType: "loop", duration: speed, ease: "linear" } }}
        sx={{ display: "inline-block", whiteSpace: "nowrap", fontWeight: 600 }}
      >
        <Box component="span" sx={{ mr: 6 }}>{content}</Box>
      </MotionBox>
    </Box>
  );
}

// --- FLOATING WORDS (small vertical motion for each word) ---
function FloatingWords({ words = ["simplement.", "en temps réel.", "avec élégance."], amplitude = 8, speed = 2 }: { words?: string[]; amplitude?: number; speed?: number }) {
  const shouldReduce = useReducedMotion();

  return (
    <Box component="span" sx={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {words.map((w, i) => (
        <motion.span
          key={w + i}
          initial={{ y: 0 }}
          animate={shouldReduce ? {} : { y: [0, -amplitude, 0] }}
          transition={shouldReduce ? {} : { duration: speed + i * 0.25, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
          style={{ display: "inline-block" }}
        >
          {w}
        </motion.span>
      ))}
    </Box>
  );
}

// --- LETTER WAVE (per-letter continuous wave) ---
function LetterWave({ text = "Pilotez votre commerce," }: { text?: string }) {
  const shouldReduce = useReducedMotion();
  const letters = Array.from(text);

  return (
    <Box component="span" sx={{ display: "inline-flex", gap: 1 }}>
      {letters.map((ch, idx) => (
        <motion.span
          key={ch + idx}
          initial={{ y: 0 }}
          animate={shouldReduce ? {} : { y: [0, -6, 0] }}
          transition={shouldReduce ? {} : { duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: (idx % 8) * 0.05 }}
          style={{ display: "inline-block" }}
        >
          {ch}
        </motion.span>
      ))}
    </Box>
  );
}

export default function HomePage() {
  const theme = useTheme();
  const router = useRouter();
  const { role, loadingAuth, user } = useCachedUserRole();
  const loading = loadingAuth || role === undefined;
  const shouldReduce = useReducedMotion();

  const allowedShortcuts = useMemo(() => {
    if (!role) return [];
    if (role === "admin") return shortcutsDefinition;
    return shortcutsDefinition.filter((s) => s.roles.includes(role));
  }, [role]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: shouldReduce ? 0 : 0.06, delayChildren: 0.08 } },
  };

  const itemVariants = {
    hidden: { y: 10, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: shouldReduce ? 0 : 0.45, ease: "easeOut" } },
  };

  return (
    <Box
      className={poppins.className}
      sx={{
        minHeight: "100vh",
        width: "100%",
        position: "relative",
        background: `radial-gradient(circle at 10% 20%, ${alpha(theme.palette.primary.light, 0.06)}, transparent 40%), radial-gradient(circle at 80% 90%, ${alpha(theme.palette.secondary.light, 0.06)}, transparent 40%), #FFF`,
        pb: { xs: 6, md: 10 },
        overflow: "hidden",
      }}
    >
      {/* floating soft shape */}
      <MotionBox initial={shouldReduce ? undefined : { y: 0 }} animate={shouldReduce ? undefined : { y: [0, -12, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} style={{ position: "absolute", left: "-6%", top: "8%", width: 220, height: 220, borderRadius: "50%", zIndex: 0 }}>
        <Box sx={{ width: "100%", height: "100%", background: `radial-gradient(circle at 30% 30%, ${alpha(theme.palette.primary.main, 0.08)}, transparent 40%)`, borderRadius: "50%" }} />
      </MotionBox>

      <Container maxWidth="lg" sx={{ pt: { xs: 4, md: 8 }, position: "relative", zIndex: 2 }}>
        <motion.div initial="hidden" animate="visible" variants={containerVariants}>
          <Grid container spacing={2} alignItems="center" justifyContent="center">
            <Grid item xs={12} md={8} sx={{ textAlign: "center" }}>
             

              <motion.div variants={itemVariants}>
                <Stack direction="row" spacing={1} sx={{ mt: 3, justifyContent: "center" }}>
                  <Button variant="contained" size="medium" endIcon={<ArrowForward sx={{ fontSize: 18 }} />} onClick={() => { if (!user) return router.push("/login"); if (allowedShortcuts.length > 0) router.push(allowedShortcuts[0].href); else router.push("/dashboard"); }} sx={{ borderRadius: "10px", px: 3, py: 0.8, textTransform: "none", fontSize: "0.9rem" }}>
                    Accéder à mon espace
                  </Button>
                </Stack>
              </motion.div>

              {/* continuous marquee under hero */}
              <Box sx={{ mt: 2 }}>
                <MovingMarquee text={"Ventes • Stocks • Dépenses • Rapports • Clients • Achats"} speed={14} />
              </Box>

            </Grid>
          </Grid>
        </motion.div>

        <Box sx={{ mt: { xs: 5, md: 8 } }}>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduce ? 0 : 0.45, delay: 0.25 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, textAlign: "center", fontSize: "1.05rem" }}>
              Vos outils du quotidien
            </Typography>
          </motion.div>

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <AnimatePresence>
              {!user ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Paper sx={{ p: 2, borderRadius: 3, textAlign: "center", maxWidth: "540px", mx: "auto" }}>
                    <Typography variant="subtitle1" sx={{ mb: 0.5, fontWeight: 600, fontSize: "0.95rem" }}>
                      Connectez-vous pour commencer
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
                      Accédez à vos raccourcis personnalisés et reprenez là où vous vous étiez arrêté.
                    </Typography>
                    <Button variant="contained" size="small" onClick={() => router.push("/login")}>Se connecter</Button>
                  </Paper>
                </motion.div>
              ) : (
                <motion.div initial="hidden" animate="visible" variants={containerVariants}>
                  {allowedShortcuts.length === 0 && (
                    <Grid item xs={12}>
                      <Paper sx={{ p: 2, borderRadius: 3, textAlign: "center" }}>
                        <Typography variant="body2">Aucun raccourci disponible pour votre rôle ({role ?? "non attribué"}).</Typography>
                        <Typography variant="caption" color="text.secondary">Contactez un administrateur pour obtenir des permissions.</Typography>
                      </Paper>
                    </Grid>
                  )}

                  <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    {allowedShortcuts.map((s) => (
                      <Grid item xs={12} sm={6} md={4} key={s.id}>
                        <motion.div variants={itemVariants} style={{ height: "100%" }}>
                          <ShortcutCard {...s} />
                        </motion.div>
                      </Grid>
                    ))}
                  </Grid>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </Box>

        <Box sx={{ mt: 6, textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary">© Loumo </Typography>
        </Box>
      </Container>

      {/* sparkles */}
      <MotionBox sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* a few subtle sparkles */}
        {[...Array(7)].map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0], y: [0, -6, 0] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.25 }} style={{ position: "absolute", left: `${Math.random() * 90}%`, top: `${10 + Math.random() * 70}%` }}>
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", background: "linear-gradient(90deg,#FFD77A,#FF7AB6)", boxShadow: "0 6px 18px rgba(255,122,182,0.12)" }} />
          </motion.div>
        ))}
      </MotionBox>

    </Box>
  );
}

function ShortcutCard({ id, title, desc, icon, href, color = "primary" }: (typeof shortcutsDefinition)[0]) {
  const theme = useTheme();
  const shouldReduce = useReducedMotion();

  return (
    <MotionCard whileHover={shouldReduce ? {} : { y: -6, scale: 1.02 }} transition={{ type: "spring", stiffness: 250, damping: 18 }} component={Link} href={href} sx={{ textDecoration: "none", height: "100%", borderRadius: 3, p: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid", borderColor: "divider", boxShadow: `0 6px 18px ${alpha(theme.palette.grey[400], 0.06)}`, background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.96)}, ${alpha(theme.palette.background.paper, 0.9)})`, backdropFilter: 'blur(6px)', '&:hover': { boxShadow: `0 12px 30px ${alpha(theme.palette[color].main, 0.12)}`, borderColor: alpha(theme.palette[color].main, 0.35), }, }}>
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Avatar sx={{ width: 44, height: 44, mb: 1.2, background: `linear-gradient(45deg, ${theme.palette[color].light} 30%, ${theme.palette[color].main} 90%)`, color: theme.palette[color].contrastText, boxShadow: `0 6px 18px ${alpha(theme.palette[color].main, 0.2)}` }}>{icon}</Avatar>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "text.primary", fontSize: "0.95rem" }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.4, display: 'block' }}>{desc}</Typography>
      </CardContent>
      <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ color: "primary.main", p: 0.6 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, mr: 0.4 }}>Ouvrir</Typography>
        <ArrowForward sx={{ fontSize: 16 }} />
      </Stack>
    </MotionCard>
  );
}
