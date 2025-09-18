"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
  Fade,
  LinearProgress,
  Grid,
  Paper,
  CssBaseline,
} from "@mui/material";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Email as EmailIcon, Lock as LockIcon, Visibility, VisibilityOff } from "@mui/icons-material";
import { Poppins } from "next/font/google"; // Importation de Poppins

// Police Poppins
const poppinsText = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/");
    } catch (err: any) {
      let errorMessage = "Une erreur est survenue lors de la connexion.";
      if (err?.code) {
        switch (err.code) {
          case "auth/user-not-found":
          case "auth/wrong-password":
          case "auth/invalid-credential":
            errorMessage = "Email ou mot de passe incorrect.";
            break;
          case "auth/invalid-email":
            errorMessage = "Le format de l'email est invalide.";
            break;
          case "auth/too-many-requests":
            errorMessage = "Trop de tentatives. Réessayez plus tard.";
            break;
          default:
            errorMessage = "Erreur de connexion. Veuillez réessayer.";
            console.error("Firebase Auth Error:", err);
        }
      } else {
        console.error("Unknown Auth Error:", err);
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClickShowPassword = () => setShowPassword(!showPassword);

  return (
    <>
      <CssBaseline />
      <Box
        className={poppinsText.className}
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0F172A 0%, #0B1220 60%, #04263A 100%)",
          p: 2,
        }}
      >
        <Fade in timeout={600}>
          <Paper
            elevation={8}
            sx={{
              width: { xs: "100%", sm: 420 },
              borderRadius: 3,
              p: { xs: 3, sm: 4 },
              bgcolor: "rgba(255,255,255,0.03)",
              backdropFilter: "blur(6px)",
              boxShadow: "0 10px 30px rgba(2,6,23,0.6)",
              color: "white",
            }}
          >
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box textAlign="center" mb={0.5}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  Se connecter
                </Typography>
                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.7)", mt: 0.5 }}>
                  Entrez vos identifiants pour continuer
                </Typography>
              </Box>

              {error && (
                <Alert severity="error" sx={{ borderRadius: 1 }}>
                  {error}
                </Alert>
              )}

              <TextField
                label="Adresse e-mail"
                type="email"
                autoComplete="email"
                variant="filled"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon sx={{ color: "rgba(255,255,255,0.7)" }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  bgcolor: "rgba(255,255,255,0.04)",
                  borderRadius: 1,
                  "& .MuiFilledInput-root": {
                    color: "white",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                    "&.Mui-focused": { bgcolor: "rgba(255,255,255,0.06)" },
                  },
                  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.7)" },
                }}
              />

              <TextField
                label="Mot de passe"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                variant="filled"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: "rgba(255,255,255,0.7)" }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={handleClickShowPassword} edge="end" sx={{ color: "rgba(255,255,255,0.7)" }} aria-label={showPassword ? "Cacher le mot de passe" : "Afficher le mot de passe"}>
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  bgcolor: "rgba(255,255,255,0.04)",
                  borderRadius: 1,
                  "& .MuiFilledInput-root": {
                    color: "white",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                    "&.Mui-focused": { bgcolor: "rgba(255,255,255,0.06)" },
                  },
                  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.7)" },
                }}
              />

              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                fullWidth
                sx={{
                  py: 1.25,
                  borderRadius: 1.5,
                  background: "linear-gradient(90deg, #1976d2 0%, #00acc1 100%)",
                  color: "white",
                  fontWeight: 600,
                  boxShadow: "0 6px 18px rgba(0,172,193,0.18)",
                  "&:hover": { transform: "translateY(-2px)", boxShadow: "0 8px 24px rgba(0,172,193,0.22)" },
                  "&:disabled": { opacity: 0.6 },
                }}
              >
                {loading ? "Connexion..." : "Se connecter"}
              </Button>

              {loading && (
                <LinearProgress
                  variant="indeterminate"
                  sx={{
                    mt: 1,
                    height: 6,
                    borderRadius: 1,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    "& .MuiLinearProgress-bar": {
                      background: "linear-gradient(90deg, #1976d2 0%, #00acc1 100%)",
                    },
                  }}
                />
              )}

              <Box textAlign="center" mt={0.5}>
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)" }}>
                  {/* Minimal helper text — can be removed if tu veux tout supprimer */}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Fade>
      </Box>
    </>
  );
}
