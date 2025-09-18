// src/app/boutiques/page.tsx
"use client";

import * as React from "react";
import { useState } from "react";
import {
  Container,
  Typography,
  Divider,
  Box,
  Button,
  ThemeProvider,
  createTheme,
  CssBaseline,
  GlobalStyles,
  Paper,
  Grid, // Utilisé pour une meilleure mise en page responsive
  Alert as MuiAlert, // Pour styliser les messages
} from "@mui/material";
import {
  BoutiqueList,
  CreateBoutique,
  CreateManager, // Si vous décidez de le réutiliser
} from "@/components/BoutiqueUserManager";
import UsersByCreator from "@/components/UsersByCreator";
import { AddBusiness, CheckCircle, BusinessCenter, PeopleAlt } from "@mui/icons-material"; // Icônes adaptées
import CreateCaisse from "@/components/CreateCaisse";

// --- NOUVEAU THÈME PROFESSIONNEL ---
const professionalTheme = createTheme({
  palette: {
    mode: 'light', // Passage en mode clair
    primary: {
      main: '#005A9C', // Bleu corporate
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#6C757D', // Gris moyen pour actions secondaires
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F4F6F8', // Gris très clair pour le fond général
      paper: '#FFFFFF',   // Blanc pour les cartes et modales
    },
    text: {
      primary: '#212529', // Noir/Gris foncé pour texte principal
      secondary: '#495057', // Gris moyen pour texte secondaire
      disabled: '#ADB5BD',
    },
    success: {
      main: '#28A745', // Vert pour succès
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#DC3545', // Rouge pour erreurs
      contrastText: '#FFFFFF',
    },
    info: {
      main: '#17A2B8', // Cyan/Bleu clair pour info
      contrastText: '#FFFFFF',
    },
    divider: 'rgba(0, 0, 0, 0.12)', // Couleur standard pour les séparateurs en mode clair
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif', // Police professionnelle
    h4: {
      fontWeight: 600,
      fontSize: '1.75rem', // Taille ajustée
      color: '#003366', // Bleu plus foncé pour les grands titres
      marginBottom: '1.5rem',
      textAlign: 'left', // Alignement standard
      // Responsive font size
      '@media (max-width:600px)': {
        fontSize: '1.5rem',
      },
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.25rem', // Taille ajustée
      color: '#004080', // Bleu moyen
      marginBottom: '1rem',
      paddingBottom: '0.5rem',
      borderBottom: `1px solid rgba(0, 90, 156, 0.2)`, // Bordure avec couleur primaire adoucie
      // Responsive font size
       '@media (max-width:600px)': {
        fontSize: '1.1rem',
      },
    },
    h6: {
      fontWeight: 500,
      fontSize: '1rem', // Taille standard pour sous-titres
      color: '#212529',
      marginBottom: '0.75rem',
      // Pas de bordure par défaut ici, géré par contexte si besoin
    },
    body1: {
      fontSize: '0.95rem', // Légèrement plus petit pour un look compact
      lineHeight: 1.6,
      color: '#343A40',
    },
    body2: {
      fontSize: '0.85rem', // Plus petit pour détails, textes secondaires
      color: '#6C757D',
    },
    button: {
      textTransform: 'none', // Pas de majuscules pour un look plus doux
      fontWeight: 500,
      borderRadius: '6px', // Coins légèrement arrondis
      fontSize: '0.9rem',
    },
    caption: {
        fontSize: '0.75rem',
        color: '#6C757D',
    }
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: '8px', // Arrondi modéré
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.06), 0px 4px 5px 0px rgba(0,0,0,0.04), 0px 1px 10px 0px rgba(0,0,0,0.03)', // Ombre très subtile
          // backgroundImage: 'none', // Important pour les thèmes clairs/sombres MUI
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true, // Pour un look plus plat par défaut
      },
      styleOverrides: {
        root: {
          padding: '8px 18px', // Padding ajusté
        },
        containedPrimary: {
          '&:hover': {
            backgroundColor: '#004A8C', // Bleu un peu plus foncé au survol
          },
        },
        outlinedPrimary: {
            borderColor: '#005A9C',
            color: '#005A9C',
            '&:hover': {
              backgroundColor: 'rgba(0, 90, 156, 0.04)',
            },
          },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small', // Champs plus compacts
      },
      styleOverrides: {
        root: {
          '& label.Mui-focused': {
            color: '#005A9C',
          },
          '& .MuiOutlinedInput-root': {
            borderRadius: '6px',
            '&.Mui-focused fieldset': {
              borderColor: '#005A9C',
              boxShadow: `0 0 0 2px rgba(0, 90, 156, 0.2)`,
            },
          },
        },
      },
    },
    MuiSelect: {
        defaultProps: {
            size: 'small',
        },
        styleOverrides: {
          root: {
            borderRadius: '6px',
          }
        }
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(0, 0, 0, 0.1)', // Séparateur plus clair
          margin: '24px 0', // Espacement standard des Divider
        }
      }
    },
    MuiTable: {
        defaultProps: {
            size: 'small', // Tableaux plus compacts
        }
    },
    MuiTableCell: {
        styleOverrides: {
            head: {
                fontWeight: 600,
                color: '#003366', // Texte d'en-tête plus foncé
                backgroundColor: 'rgba(0, 90, 156, 0.05)', // Fond léger pour l'en-tête
                fontSize: '0.875rem',
            },
            body: {
                fontSize: '0.875rem', // Texte de cellule un peu plus petit
            }
        }
    },
    MuiDialog: {
        styleOverrides: {
            paper: {
                borderRadius: '12px', // Arrondi plus important pour les modales
                boxShadow: '0px 5px 15px rgba(0,0,0,0.1)',
            }
        }
    },
    MuiAlert: {
        styleOverrides: {
            root: {
                borderRadius: '6px',
                fontSize: '0.9rem',
            },
            standardSuccess: { backgroundColor: 'rgba(40, 167, 69, 0.1)', color: '#155724', borderLeft: `4px solid #28a745` },
            standardError: { backgroundColor: 'rgba(220, 53, 69, 0.1)', color: '#721c24', borderLeft: `4px solid #dc3545` },
            standardInfo: { backgroundColor: 'rgba(23, 162, 184, 0.1)', color: '#0c5460', borderLeft: `4px solid #17a2b8` },
        }
    },
    // ... (ajuster les autres composants si nécessaire: MuiAvatar, etc.)
  },
});

// --- STYLES GLOBAUX POUR LE THÈME PROFESSIONNEL ---
const ProfessionalGlobalStyles = () => (
  <GlobalStyles
    styles={{
      '*::-webkit-scrollbar': {
        width: '8px',
        height: '8px',
      },
      '*::-webkit-scrollbar-track': {
        background: '#F4F6F8', // Fond de la piste de défilement
      },
      '*::-webkit-scrollbar-thumb': {
        background: '#ADB5BD', // Pouce de défilement gris
        borderRadius: '4px',
      },
      '*::-webkit-scrollbar-thumb:hover': {
        background: '#6C757D', // Pouce plus foncé au survol
      },
      'body': {
        backgroundColor: professionalTheme.palette.background.default,
      }
    }}
  />
);


export default function BoutiquesPage() {
  const [newBoutiqueId, setNewBoutiqueId] = useState<string | null>(null);
  const [showCreateBoutiqueForm, setShowCreateBoutiqueForm] = useState(false);

  const handleBoutiqueCreated = (id: string) => {
    setNewBoutiqueId(id);
    // setShowCreateBoutiqueForm(false); // Géré par CreateBoutique via onCancel
  };

  const handleCancelCreateBoutique = () => {
    setShowCreateBoutiqueForm(false);
    setNewBoutiqueId(null);
  };

  return (
    <ThemeProvider theme={professionalTheme}>
      <CssBaseline />
      <ProfessionalGlobalStyles />
      <Container sx={{ py: { xs: 2, sm: 3, md: 4 } }}> {/* Padding responsive */}
        <Typography variant="h4" component="h1" gutterBottom>
          Gestion d&apos;Entreprise
        </Typography>

        <Grid container spacing={{ xs: 3, md: 4 }}> {/* Espacement responsive */}
          {/* Section Utilisateurs */}
          <Grid item xs={12}>
            <Paper sx={{ p: { xs: 2, sm: 2.5 } }}> {/* Padding responsive */}
              <Typography variant="h5" gutterBottom display="flex" alignItems="center">
                <PeopleAlt sx={{ mr: 1, color: 'primary.main' }} /> Collaborateurs
              </Typography>
              <Divider sx={{ my: 2 }} />
              <UsersByCreator />
            </Paper>
          </Grid>

          {/* Section Création/Gestion Boutiques */}
          <Grid item xs={12}>
            <Paper sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography variant="h5" gutterBottom display="flex" alignItems="center">
                <BusinessCenter sx={{ mr: 1, color: 'primary.main' }} /> Gestion des Boutiques
              </Typography>
              <Divider sx={{ my: 2 }} />

              {!showCreateBoutiqueForm && !newBoutiqueId && (
                <Box sx={{p: {xs: 1.5, sm: 2}, display: 'flex', flexDirection: {xs: 'column', sm: 'row'}, alignItems: 'center', justifyContent: 'space-between', gap: 2, backgroundColor: 'rgba(0, 90, 156, 0.03)', borderRadius: '6px', border: `1px solid rgba(0, 90, 156, 0.1)` }}>
                    <Box>
                        <Typography variant="h6" sx={{color: 'primary.main', mb: 0.5}}>Nouvelle Opportunité Commerciale ?</Typography>
                        <Typography variant="body2" color="text.secondary">Enregistrez une nouvelle boutique pour développer vos activités.</Typography>
                    </Box>
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<AddBusiness />}
                        onClick={() => setShowCreateBoutiqueForm(true)}
                        sx={{ width: { xs: '100%', sm: 'auto' }, mt: {xs: 2, sm: 0} }} // Bouton pleine largeur sur petit écran
                    >
                        Créer une Boutique
                    </Button>
                </Box>
              )}

              {showCreateBoutiqueForm && !newBoutiqueId && (
                <Box mt={2}> {/* Espace au-dessus du formulaire */}
                    <CreateBoutique
                    onCreated={handleBoutiqueCreated}
                    onCancel={handleCancelCreateBoutique}
                    />
                </Box>
              )}

              {newBoutiqueId && (
                <MuiAlert severity="success" icon={<CheckCircle fontSize="inherit" />} sx={{ mt: 2, p: 1.5 }}> {/* Alert plus compacte */}
                  <Typography variant="body1" fontWeight="medium">
                    Boutique &quot;{newBoutiqueId}&quot; initialisée avec succès !
                  </Typography>
                  <Typography variant="body2" sx={{mt: 0.5, mb: 1.5}}>
                    Vous pouvez maintenant affecter des collaborateurs à cette nouvelle entité.
                  </Typography>
                  {/* Conserver CreateManager ici si la logique d'affectation immédiate est souhaitée */}
                  <CreateManager boutiqueId={newBoutiqueId} />
                  <Button
                    variant="outlined"
                    size="small" // Bouton plus petit
                    onClick={() => { setNewBoutiqueId(null); setShowCreateBoutiqueForm(false); }}
                    sx={{ display: 'block', mx: 'auto', mt: 1.5 }}
                  >
                    Terminé
                  </Button>
                </MuiAlert>
              )}
            </Paper>
          </Grid>

          {/* Section Liste des Boutiques */}
          <Grid item xs={12}>
             {/* BoutiqueList a son propre Paper et titre, donc pas besoin de l'envelopper ici */}
            <BoutiqueList />
             <CreateCaisse />
          </Grid>
        </Grid>
      </Container>
    </ThemeProvider>
  );
}