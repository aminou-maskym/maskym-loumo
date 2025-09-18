"use client";

import * as React from "react";
import {
  Container,
  Typography,
  Stack,
  Paper,
  Link,
  Box,
  Grid,
  IconButton,
  Button,
} from "@mui/material";
import PhoneIcon from "@mui/icons-material/Phone";
import EmailIcon from "@mui/icons-material/Email";
import BusinessIcon from "@mui/icons-material/Business";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LanguageIcon from "@mui/icons-material/Language";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { useTheme } from "@mui/material/styles";
import QRCode from "react-qr-code"; // 👈 Install: npm install react-qr-code
import { motion } from "framer-motion"; // 👈 Install: npm install framer-motion pour des animations magiques et vivantes

// Import d'une police esthétique depuis Google Fonts (ajoutée pour un look magique)
import { Poppins } from 'next/font/google';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-poppins',
});

export default function HelpPage() {
  const theme = useTheme();
  const companyName = "Maskym Business";
  const phoneNumber = "+237674184832";
  const emailAddress = "Loumo@Maskym.com";
  const whatsappUrl = "https://wa.me/message/LK4KO3EXF55UP1";
  const websiteName = "Maskym Dev"; // Nom affiché pour le site, sans URL visible
  const websiteUrl = "https://maskym-dev.web.app/"; // URL cachée, utilisée seulement pour le lien

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`"${text}" copié dans le presse-papiers ✅`);
    } catch (err) {
      console.error("Erreur lors de la copie:", err);
      alert(`Erreur lors de la copie. Vous pouvez copier manuellement : ${text}`);
    }
  };

  // Variants pour animations Framer Motion : fade-in, scale on hover, etc. pour un effet magique et vivant
  const fadeInVariants = {
    hidden: { opacity: 0, y: 10 }, // Réduction du déplacement pour compacité
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  };

  const hoverVariants = {
    hover: { scale: 1.03, transition: { duration: 0.2 } }, // Animation plus subtile pour magie
  };

  return (
    <Container
      component="main"
      className={poppins.variable}
      sx={{
        mt: 2, // Réduction des marges pour fitting sur un écran
        py: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100vh", // Adaptation responsive à la hauteur d'écran
        background: "linear-gradient(135deg, #f0f4ff 0%, #e0eaff 100%)",
        fontFamily: 'var(--font-poppins)', // Police esthétique appliquée
        [theme.breakpoints.down('sm')]: { // Responsive pour petits écrans
          px: 1,
          py: 1,
        },
        animation: 'gradientAnimation 15s ease infinite', // Animation magique du fond
        '@keyframes gradientAnimation': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        backgroundSize: '200% 200%', // Pour l'effet d'animation fluide et vivant
      }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInVariants}
      >
        <Typography
          variant="h5" // Réduction de la taille pour compacité (de h4 à h5)
          component="h1"
          align="center"
          gutterBottom
          sx={{
            mb: 2, // Moins d'espace
            fontWeight: "bold",
            color: theme.palette.primary.main,
            textShadow: "0 1px 2px rgba(0,0,0,0.1)", // Ombre subtile pour esthétique
            animation: 'textGlow 2s ease-in-out infinite alternate', // Animation magique sur le texte
            '@keyframes textGlow': {
              '0%': { textShadow: '0 0 5px rgba(25, 118, 210, 0.3)' },
              '100%': { textShadow: '0 0 15px rgba(25, 118, 210, 0.7)' },
            },
          }}
        >
          Contact & Assistance
        </Typography>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInVariants}
        transition={{ delay: 0.1 }}
      >
        <Typography
          variant="body2" // Réduction pour compacité
          align="center"
          sx={{ 
            mb: 2, 
            color: "text.secondary", 
            maxWidth: "90%", // Responsive largeur
            animation: 'fadeInText 1s ease-out', // Animation esthétique sur le texte
            '@keyframes fadeInText': {
              '0%': { opacity: 0, transform: 'translateY(5px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          Besoin d&apos;aide ou d&apos;informations supplémentaires ? N&apos;hésitez pas
          à nous contacter via les coordonnées ci-dessous. Notre équipe est prête à
          vous assister.
        </Typography>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInVariants}
        transition={{ delay: 0.2 }}
      >
        <Paper
          elevation={3} // Réduction de l'ombre pour légèreté
          sx={{
            p: { xs: 1.5, sm: 2, md: 2.5 }, // Paddings réduits pour fitting, responsive
            width: "100%",
            maxWidth: "550px", // Réduction maxWidth pour compacité
            borderRadius: 2,
            background:
              theme.palette.mode === "light"
                ? "linear-gradient(135deg, #ffffffaa 0%, #f1f1f1cc 100%)"
                : theme.palette.background.paper,
            backdropFilter: "blur(10px)", // Réduction du blur pour performance
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          <Stack spacing={1.5}> 
            {/* Nom entreprise avec animation */}
            <motion.div
              variants={hoverVariants}
              whileHover="hover"
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <BusinessIcon color="primary" sx={{ fontSize: "1.5rem" }} /> 
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: "medium" }}>
                  {companyName}
                </Typography>
              </Box>
            </motion.div>

            {/* Téléphone avec hover glow */}
            <motion.div
              variants={hoverVariants}
              whileHover="hover"
              sx={{
                "&:hover": { boxShadow: "0 0 8px rgba(25, 118, 210, 0.2)" },
              }}
            >
              <Grid container alignItems="center" spacing={0.5}>
                <Grid item xs="auto">
                  <PhoneIcon color="primary" sx={{ fontSize: "1.2rem" }} />
                </Grid>
                <Grid item xs>
                  <Link
                    href={`tel:${phoneNumber}`}
                    underline="hover"
                    color="inherit"
                    sx={{
                      fontSize: "1rem", // Réduction taille police
                      fontWeight: "medium",
                      wordBreak: "break-all",
                      "&:hover": { color: theme.palette.primary.dark },
                    }}
                  >
                    {phoneNumber}
                  </Link>
                </Grid>
                <Grid item xs="auto">
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(phoneNumber)}
                    title="Copier le numéro"
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Grid>
              </Grid>
            </motion.div>

            {/* Email avec animation similaire */}
            <motion.div
              variants={hoverVariants}
              whileHover="hover"
              sx={{
                "&:hover": { boxShadow: "0 0 8px rgba(25, 118, 210, 0.2)" },
              }}
            >
              <Grid container alignItems="center" spacing={0.5}>
                <Grid item xs="auto">
                  <EmailIcon color="primary" sx={{ fontSize: "1.2rem" }} />
                </Grid>
                <Grid item xs>
                  <Link
                    href={`mailto:${emailAddress}`}
                    underline="hover"
                    color="inherit"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: "medium",
                      wordBreak: "break-all",
                      "&:hover": { color: theme.palette.primary.dark },
                    }}
                  >
                    {emailAddress}
                  </Link>
                </Grid>
                <Grid item xs="auto">
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(emailAddress)}
                    title="Copier l'email"
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Grid>
              </Grid>
            </motion.div>

            {/* Site Web : Lien caché, juste le nom affiché, avec instruction pour cliquer */}
            <motion.div
              variants={hoverVariants}
              whileHover="hover"
              sx={{
                "&:hover": { boxShadow: "0 0 8px rgba(25, 118, 210, 0.2)" },
              }}
            >
              <Grid container alignItems="center" spacing={0.5}>
                <Grid item xs="auto">
                  <LanguageIcon color="primary" sx={{ fontSize: "1.2rem" }} />
                </Grid>
                <Grid item xs>
                  <Link
                    href={websiteUrl}
                    target="_blank"
                    underline="hover"
                    color="inherit"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: "medium",
                      "&:hover": { color: theme.palette.primary.dark },
                    }}
                  >
                    {websiteName} - Cliquez pour visiter notre site web
                  </Link>
                </Grid>
              </Grid>
            </motion.div>

            {/* QR Code WhatsApp avec animation rotative subtile sur hover */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              whileHover={{ rotate: 1, scale: 1.03 }}
              sx={{ textAlign: "center", mt: 1.5 }} // Moins de marge
            >
              <Typography variant="body2" gutterBottom>
                Scannez pour discuter sur WhatsApp <br />
                (avec la caméra de votre smartphone)
              </Typography>
              <Box
                sx={{
                  display: "inline-block",
                  p: 1, // Padding réduit
                  borderRadius: 2,
                  backgroundColor: "#fff",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                <QRCode value={whatsappUrl} size={128} /> 
              </Box>
            </motion.div>

            {/* Bouton WhatsApp avec pulse animation */}
            <Box sx={{ textAlign: "center", mt: 1 }}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  scale: [1, 1.03, 1],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
              >
                <Button
                  variant="contained"
                  color="success"
                  size="medium" // Taille bouton réduite
                  startIcon={<WhatsAppIcon sx={{ fontSize: "1.2rem" }} />}
                  href={whatsappUrl}
                  target="_blank"
                  sx={{
                    borderRadius: 3,
                    textTransform: "none",
                    fontWeight: "bold",
                    px: 2, // Padding réduit
                    boxShadow: "0 2px 8px rgba(76, 175, 80, 0.2)",
                  }}
                >
                  Écrire sur WhatsApp
                </Button>
              </motion.div>
            </Box>
          </Stack>
        </Paper>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInVariants}
        transition={{ delay: 0.4 }}
      >
        <Typography
          variant="caption" // Taille réduite
          align="center"
          sx={{ mt: 2, color: "text.disabled" }}
        >
          Nous nous efforçons de répondre dans les plus brefs délais.
        </Typography>
      </motion.div>
    </Container>
  );
}