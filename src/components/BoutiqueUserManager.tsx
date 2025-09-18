"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import Image from "next/image"; // Ajout de l'import pour next/image
import {
  getAuth,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  arrayUnion,
  getDoc, // <--- ajouté pour lire le document utilisateur
} from "firebase/firestore";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Snackbar,
  Alert,
  IconButton,
  Avatar,
  ThemeProvider,
  createTheme,
  CssBaseline,
  GlobalStyles,
  Grid,
  Stack,
  Divider,
  SelectChangeEvent, // Ajout pour typer l'événement onChange du Select
} from "@mui/material";
import {
  Storefront,
  BusinessCenter,
  AddCircleOutline,
  Edit,
  Delete,
  PeopleAlt,
  CloudUpload,
  Visibility,
  VisibilityOff,
  Close,
  Save,
  Cancel,
  CheckCircle,
  ErrorOutline,
  Palette,
  Language,
  ReceiptLong,
  HomeWork,
  SupervisorAccount,
  Info,
  AccountBalanceWallet,
  Link as LinkIcon,
  Business,
  LocationOn,
  AddBusiness,
  SettingsInputComponent,
} from "@mui/icons-material";
import { useAuthState } from "react-firebase-hooks/auth";

// --- ULTRA MODERN THEME ---
const neonTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#40E0D0', contrastText: '#1A1A2D' },
    secondary: { main: '#F000B8', contrastText: '#FFFFFF' },
    background: { default: '#12121F', paper: '#1E1E32' },
    text: { primary: '#E0E0E0', secondary: '#B0B0B0' },
    success: { main: '#00FFA3' },
    error: { main: '#FF4D4D' },
    info: { main: '#29B6F6'},
    action: {
      active: '#40E0D0', hover: 'rgba(64, 224, 208, 0.08)',
      selected: 'rgba(64, 224, 208, 0.16)', disabled: 'rgba(255, 255, 255, 0.3)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
  },
  typography: {
    fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: '0.05em',
      background: 'linear-gradient(90deg, #40E0D0, #F000B8)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      textAlign: 'center',
      marginBottom: '1.5rem',
    },
    h5: {
      fontWeight: 700, letterSpacing: '0.05em',
      background: 'linear-gradient(90deg, #40E0D0, #F000B8)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      marginBottom: '1rem',
    },
    h6: {
      fontWeight: 600, letterSpacing: '0.03em', color: '#E0E0E0',
      marginBottom: '0.8rem', borderBottom: '1px solid rgba(64, 224, 208, 0.5)',
      paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px',
    },
    body1: { color: '#B0B0B0', lineHeight: 1.7 },
    body2: { color: '#A0A0A0' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.05em' },
    caption: { color: '#888', fontStyle: 'italic' },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0px 8px 25px rgba(0, 255, 255, 0.1), 0px 4px 10px rgba(240, 0, 184, 0.08)',
          borderRadius: '16px',
          border: '1px solid rgba(64, 224, 208, 0.2)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: '10px', padding: '10px 22px', transition: 'all 0.3s ease-in-out', },
        containedPrimary: {
          boxShadow: '0px 4px 15px rgba(64, 224, 208, 0.4)',
          '&:hover': { boxShadow: '0px 6px 20px rgba(64, 224, 208, 0.6)', transform: 'translateY(-2px) scale(1.02)', backgroundColor: '#50F0E0', },
        },
        outlinedPrimary: {
          borderColor: '#40E0D0', color: '#40E0D0',
          '&:hover': { backgroundColor: 'rgba(64, 224, 208, 0.1)', borderColor: '#50F0E0', transform: 'scale(1.02)'},
        },
        textPrimary: { color: '#40E0D0', '&:hover': { backgroundColor: 'rgba(64, 224, 208, 0.1)' } }
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& label.Mui-focused': { color: '#40E0D0', },
          '& .MuiOutlinedInput-root': {
            borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)',
            '& fieldset': { borderColor: 'rgba(64, 224, 208, 0.3)', },
            '&:hover fieldset': { borderColor: '#40E0D0', },
            '&.Mui-focused fieldset': { borderColor: '#40E0D0', boxShadow: '0 0 0 3px rgba(64, 224, 208, 0.3)', },
          },
          '& .MuiInputBase-input': { color: '#E0E0E0', },
        },
      },
    },
    MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)',
            '&.MuiOutlinedInput-root': {
                '& fieldset': { borderColor: 'rgba(64, 224, 208, 0.3)', },
                '&:hover fieldset': { borderColor: '#40E0D0', },
                '&.Mui-focused fieldset': { borderColor: '#40E0D0', boxShadow: '0 0 0 3px rgba(64, 224, 208, 0.3)', },
              },
          },
          icon: { color: '#40E0D0', }
        }
    },
    MuiInputLabel: { styleOverrides: { root: { color: '#A0A0A0', '&.Mui-focused': { color: '#40E0D0', }, } } },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: 'rgba(64, 224, 208, 0.15)', color: '#40E0D0' },
          '&.Mui-selected': { backgroundColor: 'rgba(64, 224, 208, 0.25) !important', color: '#40E0D0', fontWeight: 'bold', },
        },
      },
    },
    MuiAvatar: {
        styleOverrides: {
            root: { border: '2px solid #40E0D0', boxShadow: '0 0 12px rgba(64, 224, 208, 0.6)', }
        }
    },
    MuiTableHead: {
        styleOverrides: {
            root: {
                backgroundColor: 'rgba(64, 224, 208, 0.15)',
                '& .MuiTableCell-root': {
                    color: '#40E0D0', fontWeight: 'bold', letterSpacing: '0.05em',
                    borderBottom: '2px solid rgba(64, 224, 208, 0.4)',
                }
            }
        }
    },
    MuiTableRow: {
        styleOverrides: {
            root: {
                transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
                '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.04) !important',
                    boxShadow: 'inset 0 0 15px rgba(64, 224, 208, 0.25)',
                },
            },
        },
    },
    MuiTableCell: { styleOverrides: { root: { borderBottom: '1px solid rgba(255,255,255,0.12)', padding: '12px 16px' } } },
    MuiDialog: {
        styleOverrides: {
            paper: {
                border: '1px solid #F000B8',
                boxShadow: '0px 12px 40px rgba(240, 0, 184, 0.25), 0px 6px 20px rgba(0,0,0,0.15)',
                borderRadius: '18px',
            }
        }
    },
    MuiDialogTitle: {
        styleOverrides: {
            root: {
                fontWeight: 700, color: '#F000B8',
                borderBottom: '1px solid rgba(240, 0, 184, 0.4)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 24px',
            }
        }
    },
    MuiAlert: {
        styleOverrides: {
            root: { borderRadius: '10px', border: '1px solid', fontWeight: 500 },
            standardSuccess: { backgroundColor: 'rgba(0, 255, 163, 0.12)', color: '#00FFA3', borderColor: '#00FFA3', '& .MuiAlert-icon': { color: '#00FFA3', } },
            standardError: { backgroundColor: 'rgba(255, 77, 77, 0.12)', color: '#FF4D4D', borderColor: '#FF4D4D', '& .MuiAlert-icon': { color: '#FF4D4D', } },
            standardInfo: { backgroundColor: 'rgba(41, 182, 246, 0.12)', color: '#29B6F6', borderColor: '#29B6F6', '& .MuiAlert-icon': { color: '#29B6F6', } },
        }
    },
    MuiIconButton: {
        styleOverrides: {
            root: { color: '#B0B0B0', '&:hover': { color: '#40E0D0', backgroundColor: 'rgba(64, 224, 208, 0.1)', } }
        }
    },
    MuiTooltip: {
        styleOverrides: {
            tooltip: {
                backgroundColor: '#1E1E32', color: '#E0E0E0', border: '1px solid #40E0D0',
                boxShadow: '0 0 10px rgba(64, 224, 208, 0.3)', fontSize: '0.8rem',
            },
            arrow: { color: '#40E0D0', }
        }
    }
  },
});

const GlobalAppStyles = () => (
  <GlobalStyles
    styles={{
      '*::-webkit-scrollbar': { width: '10px', height: '10px', },
      '*::-webkit-scrollbar-track': { background: '#1A1A2D', },
      '*::-webkit-scrollbar-thumb': { background: 'linear-gradient(180deg, #40E0D0, #F000B8)', borderRadius: '5px', border: '2px solid #1A1A2D', },
      '*::-webkit-scrollbar-thumb:hover': { background: 'linear-gradient(180deg, #50F0E0, #FF30C8)', },
      'body': { backgroundColor: neonTheme.palette.background.default, }
    }}
  />
);

const InfoItem = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number | undefined; }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
    <Avatar sx={{ bgcolor: 'rgba(64, 224, 208, 0.1)', color: 'primary.main', width: 36, height: 36 }}>
      {icon}
    </Avatar>
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 500 }}>
        {value || 'N/A'}
      </Typography>
    </Box>
  </Box>
);

const auth = getAuth();
const db = getFirestore();

const currencies = [
  { value: "FCFA", label: "FCFA" },
  { value: "€", label: "Euro (€)" },
  { value: "$", label: "Dollar ($)" },
  { value: "Fc", label: "Franc Congolais (Fc)" },
];

type Role = "gerant" | "caissier" | "stock"; // Type pour les rôles

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

export function CreateBoutique({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [nom, setNom] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [devise, setDevise] = useState("FCFA");
  const [adresse, setAdresse] = useState("");
  const [legal, setLegal] = useState("");
  const [siteweb, setSiteweb] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 750 * 1024) {
        setError("L'image est trop volumineuse (max ~750KB)."); setLogo(null);
        if (fileInputRef.current) fileInputRef.current.value = ""; return;
      }
      setError(null);
      try {
        const base64 = await toBase64(file); setLogo(base64);
      // CORRECTION LIGNE ~520 (original): _err au lieu de err, suppression du commentaire eslint-disable
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_err: unknown) { 
        setError("Erreur lors du traitement de l'image."); 
        setLogo(null); 
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logo) { setError("Veuillez télécharger un logo."); return; }
    setError(null); setIsSubmitting(true);
    const u = auth.currentUser;
    if (!u) { alert("Vous devez être connecté"); setIsSubmitting(false); return; }

    try {
      // --- NOUVEAU: vérifier le nombre de boutiques autorisées par utilisateur (max 4) ---
      const userRef = doc(db, "users", u.uid);
      const userSnap = await getDoc(userRef);
      let currentCount = 0;
      if (userSnap.exists()) {
        const ud = userSnap.data() as any;
        currentCount = Number(ud.nombreboutique ?? ud.nombreBoutique ?? ud.nombre ?? 0) || 0;
      } else {
        currentCount = 0;
      }

      if (currentCount >= 4) {
        // Ne pas créer, indiquer uniquement le message demandé
        setError("impossible de créer une boutique nombre autorisé atteint.");
        setIsSubmitting(false);
        return;
      }

      // Création de la boutique (autorisé)
      const ref = await addDoc(collection(db, "boutiques"), {
        nom, logoUrl: logo, devise, adresse, legal, siteweb,
        proprietaireId: u.uid, utilisateursIds: [u.uid], createdAt: new Date(),
      });

      // Mettre à jour le compteur sur le document utilisateur
      if (userSnap.exists()) {
        // si le doc existe, on met à jour le champ nombreboutique (création si absent)
        await updateDoc(userRef, { nombreboutique: currentCount + 1 });
      } else {
        // si le doc n'existe pas, on crée / merge avec nombreboutique = 1
        await setDoc(userRef, { nombreboutique: 1, email: u.email ?? "", createdAt: new Date() }, { merge: true });
      }

      setSuccess(true);
      onCreated(ref.id);
    } catch (err: unknown) { // Cette partie semble correcte car 'err' est utilisé (err.message)
      setError(err instanceof Error ? err.message : "Erreur lors de la création de la boutique."); 
    }
    finally { setIsSubmitting(false); }
  };

  const handleCloseSuccess = () => {
    setSuccess(false);
    setNom(""); setLogo(null); setDevise("FCFA"); setAdresse(""); setLegal(""); setSiteweb("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
    onCancel();
  };


  if (success) {
    return (
        <Paper elevation={6} sx={{ p: { xs: 2, sm: 3, md: 4 }, textAlign: 'center' }}>
            <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" sx={{ color: 'success.main', borderBottom: 'none', justifyContent: 'center' }}>
                Boutique Créée avec Succès !
            </Typography>
            <Typography sx={{my: 2}}>
                Votre nouvelle boutique digitale est prête à être configurée.
            </Typography>
            <Button variant="contained" color="primary" onClick={handleCloseSuccess}>
                Terminé
            </Button>
        </Paper>
    );
  }

  return (
    <Paper component="form" onSubmit={handleSubmit} elevation={6} sx={{ p: { xs: 2, sm: 3, md: 4 }, display: "grid", gap: 2.5 }}>
      <Typography variant="h6"><Storefront sx={{ color: 'primary.main' }}/> Configurer Votre Nouvelle Boutique</Typography>
      {error && <Alert icon={<ErrorOutline fontSize="inherit" />} severity="error">{error}</Alert>}
      <TextField label="Nom de la boutique" value={nom} onChange={(e) => setNom(e.target.value)} required fullWidth InputProps={{ startAdornment: <BusinessCenter sx={{ mr: 1, color: 'text.secondary' }} /> }} />
      <Box sx={{ border: `2px dashed ${neonTheme.palette.primary.main}`, borderRadius: '10px', p: 2, textAlign: 'center' }}>
        <Button variant="outlined" component="label" startIcon={<CloudUpload />} fullWidth>
          Télécharger Logo (Max 750KB)
          <input type="file" hidden accept="image/*" ref={fileInputRef} onChange={handleLogoUpload} />
        </Button>
        {logo && (
          <Box mt={2} textAlign="center" sx={{ border: `1px solid ${neonTheme.palette.primary.main}`, borderRadius: '8px', p:1, display: 'inline-block', background: 'rgba(64,224,208,0.05)' }}>
            {/* CORRECTION LIGNE 399: Utilisation de next/image */}
            <Image 
              src={logo} 
              alt="Aperçu du logo" 
              width={120} // Ajustez ces valeurs si nécessaire
              height={100} // Maintient la hauteur max de l'original
              style={{ objectFit: "contain", borderRadius: "4px", display: 'block' }} 
            />
          </Box>
        )}
      </Box>
      <FormControl fullWidth required>
        <InputLabel id="devise-label">Devise Principale</InputLabel>
        <Select labelId="devise-label" value={devise} label="Devise Principale" onChange={(e) => setDevise(e.target.value)} startAdornment={<Palette sx={{ mr: 1, color: 'text.secondary' }} />}>
          {currencies.map((option) => (<MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>))}
        </Select>
      </FormControl>
      <TextField label="Adresse Physique" value={adresse} onChange={(e) => setAdresse(e.target.value)} required multiline rows={2} fullWidth InputProps={{ startAdornment: <HomeWork sx={{ mr: 1, color: 'text.secondary' }} /> }} />
      <TextField label="Informations Légales (RCCM / NUI)" value={legal} onChange={(e) => setLegal(e.target.value)} required fullWidth InputProps={{ startAdornment: <ReceiptLong sx={{ mr: 1, color: 'text.secondary' }} /> }} />
      <TextField label="Site Web (Optionnel)" value={siteweb} onChange={(e) => setSiteweb(e.target.value)} placeholder="https://exemple.com" fullWidth InputProps={{ startAdornment: <Language sx={{ mr: 1, color: 'text.secondary' }} /> }} />
      <Stack direction="row" spacing={2} sx={{ mt: 1, justifyContent: 'flex-end' }}>
        <Button variant="text" color="secondary" onClick={onCancel} startIcon={<Cancel/>}>Annuler</Button>
        <Button type="submit" variant="contained" color="primary" disabled={isSubmitting || !logo} startIcon={isSubmitting ? null : <AddCircleOutline />} sx={{ minWidth: '180px' }}>
          {isSubmitting ? (<CircularProgress size={24} color="inherit" />) : ("Lancer la Boutique")}
        </Button>
      </Stack>
    </Paper>
  );
}

export function CreateManager({ boutiqueId }: { boutiqueId: string }) {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState<Role>("gerant"); // Utilisation du type Role
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pwd);
      const uid = cred.user.uid;
      await setDoc(doc(db, "users", uid), {
        uid, email, nom, role, createdAt: new Date(),
      });
      await updateDoc(doc(db, "boutiques", boutiqueId), {
        utilisateursIds: arrayUnion(uid),
      });
      setSuccess(true); setEmail(""); setPwd(""); setNom(""); setRole("gerant");
    } catch (err: unknown) { 
      setError(err instanceof Error ? err.message : "Erreur lors de la création du gérant."); 
    }
    finally { setIsSubmitting(false); }
  };

  if (success) {
    return (
        <Alert icon={<CheckCircle fontSize="inherit" />} severity="success" onClose={() => setSuccess(false)} sx={{ mt: 3 }}>
            Nouvel utilisateur ajouté et affecté avec succès !
        </Alert>
    );
  }

  return (
    <Paper component="form" onSubmit={handleSubmit} elevation={6} sx={{ p: { xs: 2, sm: 3, md: 4 }, display: "grid", gap: 2.5, mt: 4, }}>
      <Typography variant="h6"><PeopleAlt sx={{ color: 'secondary.main' }}/> Ajouter un Collaborateur</Typography>
      {error && <Alert icon={<ErrorOutline fontSize="inherit" />} severity="error" sx={{mb:1}}>{error}</Alert>}
      <TextField label="Email du collaborateur" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
      <TextField label="Mot de passe (min. 6 caractères)" type={showPassword ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} required fullWidth InputProps={{ endAdornment: (<IconButton aria-label="toggle password visibility" onClick={() => setShowPassword(!showPassword)} edge="end"> {showPassword ? <VisibilityOff /> : <Visibility />} </IconButton>), }} />
      <TextField label="Nom complet" value={nom} onChange={(e) => setNom(e.target.value)} required fullWidth />
      <FormControl fullWidth required>
        <InputLabel id="role-label">Rôle de l&apos;utilisateur</InputLabel>
        {/* CORRECTION LIGNE 467: Typage correct pour e.target.value */}
        <Select 
          labelId="role-label" 
          value={role} 
          label="Rôle de l'utilisateur" 
          onChange={(e: SelectChangeEvent<Role>) => setRole(e.target.value as Role)} 
          startAdornment={<SupervisorAccount sx={{ mr: 1, color: 'text.secondary' }} />}
        >
          <MenuItem value="gerant">Gérant</MenuItem>
          <MenuItem value="caissier">Caissier</MenuItem>
          <MenuItem value="stock">Stock</MenuItem>
        </Select>
      </FormControl>
      <Button type="submit" variant="contained" color="secondary" startIcon={isSubmitting ? null : <AddCircleOutline />} disabled={isSubmitting} sx={{ justifySelf: 'start', mt: 1, minWidth: '200px' }}>
        {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Créer et Affecter"}
      </Button>
    </Paper>
  );
}

// Définition d'un type plus précis pour les données de la boutique
interface BoutiqueData {
  nom?: string;
  logoUrl?: string;
  devise?: string;
  adresse?: string;
  legal?: string;
  siteweb?: string;
  proprietaireId?: string;
  utilisateursIds?: string[];
  createdAt?: Date; // Ou FieldValue pour Firestore Timestamps
  [key: string]: unknown; // Pour d'autres champs non listés explicitement
}

interface Boutique {
  id: string;
  data: BoutiqueData;
}


export function BoutiqueList() {
  const [user, loading] = useAuthState(auth);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [selected, setSelected] = useState<Boutique | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" | "info" }>({ open: false, message: "", severity: "success" });
  const [modalError, setModalError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const originalSelectedData = useRef<BoutiqueData | null>(null);

  useEffect(() => {
    if (!user) { setBoutiques([]); return; }
    const q = query(collection(db, "boutiques"), where("proprietaireId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setBoutiques(snap.docs.map((d) => ({ id: d.id, data: d.data() as BoutiqueData })));
    }, () => {
      setSnackbar({ open: true, message: "Erreur de chargement des boutiques", severity: "error" });
    });
    return () => unsubscribe();
  }, [user]);

  if (loading) return ( <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}> <CircularProgress color="primary" size={60} thickness={4}/> </Box> );

  const openDetails = (boutique: Boutique) => {
    setSelected({ ...boutique, data: { ...boutique.data } });
    originalSelectedData.current = { ...boutique.data };
    setIsEditing(false);
    setModalError(null);
  };

  const handleClose = () => { setSelected(null); setIsEditing(false); setModalError(null); originalSelectedData.current = null; };

  const handleModalLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected) return; const file = event.target.files?.[0];
    if (file) {
       if (file.size > 750 * 1024) { setModalError("L'image est trop volumineuse (max ~750KB)."); if (editFileInputRef.current) editFileInputRef.current.value = ""; return; }
      setModalError(null);
      try { 
        const base64 = await toBase64(file); 
        setSelected((s) => s ? { ...s, data: { ...s.data, logoUrl: base64 } } : s); 
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      catch (_err: unknown) { // Utilisation de _err pour indiquer non-utilisation
        setModalError("Erreur lors du traitement de l'image."); 
      }
    }
  };

  const handleSave = async () => {
    if (!selected || !selected.data) return; 
    if (!selected.data.logoUrl) { setModalError("Le logo est requis."); return; }
    setModalError(null); setIsSaving(true);
    try {
      await updateDoc(doc(db, "boutiques", selected.id), selected.data);
      setSnackbar({ open: true, message: "Modifications cyber-enregistrées !", severity: "success" });
      setIsEditing(false);
      originalSelectedData.current = { ...selected.data };
    // CORRECTION LIGNE ~532: _error au lieu de error
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error: unknown) { 
      setSnackbar({ open: true, message: "Erreur: impossible de mettre à jour.", severity: "error" }); 
    }
    finally { setIsSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected || !selected.data.nom) return; 
    if (!window.confirm(`ATTENTION : Désintégrer la boutique "${selected.data.nom}" ? Cette action est irréversible.`)) return;
    setIsDeleting(true);
    try { 
      await deleteDoc(doc(db, "boutiques", selected.id)); 
      setSnackbar({ open: true, message: "Boutique désintégrée.", severity: "success" }); 
      handleClose(); 
    }
    // CORRECTION LIGNE ~540: _error au lieu de error
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    catch (_error: unknown) { 
      setSnackbar({ open: true, message: "Erreur lors de la désintégration.", severity: "error" }); 
    }
    finally { setIsDeleting(false); }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setModalError(null);
    if (selected && originalSelectedData.current) {
      setSelected(s => s ? { ...s, data: { ...originalSelectedData.current } as BoutiqueData } : null);
    }
  };

  return (
    <Box sx={{ mt: 4, p: { xs: 1, sm: 2 } }}>
      <Typography variant="h5" sx={{ textAlign: 'center', mb: 3 }}>Votre Flotte de Boutiques Digitales</Typography>
      {boutiques.length === 0 && !loading && user && (
        <Paper sx={{p:4, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2}}>
            <Storefront sx={{fontSize: 70, color: 'primary.main', opacity: 0.7}}/>
            <Typography variant="h6" sx={{color: 'text.secondary', borderBottom: 'none', justifyContent: 'center'}}>
                Votre univers commercial est en sommeil...
            </Typography>
            <Typography sx={{color: 'text.secondary', maxWidth: '500px'}}>
                Cliquez sur &quot;Créer une nouvelle Boutique&quot; plus haut pour lancer votre première boutique et débloquer son potentiel !
            </Typography>
        </Paper>
      )}
      {boutiques.length > 0 && (
        <Paper sx={{ mt: 1, overflowX: 'auto', p: { xs: 1, sm: 2} }}>
          <Table size="medium" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{width: 80}}>Logo</TableCell>
                <TableCell>Nom de la Boutique</TableCell>
                <TableCell>Devise</TableCell>
                <TableCell align="center"># Utilisateurs</TableCell>
                <TableCell align="right">Gestion</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {boutiques.map((boutique) => (
                <TableRow key={boutique.id} hover>
                  <TableCell>
                    <Avatar src={boutique.data.logoUrl || undefined} alt={boutique.data.nom} variant="rounded" sx={{ width: 50, height: 50 }}>
                        {!boutique.data.logoUrl && boutique.data.nom?.charAt(0).toUpperCase()}
                    </Avatar>
                  </TableCell>
                  <TableCell component="th" scope="row" sx={{fontWeight: 'bold', color: 'text.primary'}}>{boutique.data.nom}</TableCell>
                  <TableCell>{boutique.data.devise}</TableCell>
                  <TableCell align="center">
                    <Box sx={{display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'secondary.main', fontWeight: 'bold'}}>
                        <PeopleAlt fontSize="small"/>
                        {Array.isArray(boutique.data.utilisateursIds) ? boutique.data.utilisateursIds.length : 0}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Button variant="outlined" size="small" startIcon={<SettingsInputComponent/>} onClick={() => openDetails(boutique)}>
                        Gérer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog open={!!selected} onClose={handleClose} fullWidth maxWidth="md">
        <DialogTitle>
            {isEditing ? "Édition Cybernétique" : "Console de Gestion"}: {selected?.data?.nom}
          <IconButton aria-label="close" onClick={handleClose}><Close /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important', pb: 3 }}>
          {modalError && <Alert icon={<ErrorOutline fontSize="inherit" />} severity="error" sx={{mb:2}}>{modalError}</Alert>}
          {selected && selected.data && ( // Ajout de selected.data pour la sécurité
            <>
              {!isEditing ? (
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <Avatar
                        src={selected.data.logoUrl}
                        alt={`Logo de ${selected.data.nom}`}
                        variant="rounded"
                        sx={{ width: 150, height: 150, mb: 1, border: `4px solid ${neonTheme.palette.secondary.main}`, boxShadow: `0 0 20px ${neonTheme.palette.secondary.main}aa` }}
                    />
                    <Typography variant="h6" sx={{color: 'text.primary', borderBottom: 'none', textAlign: 'center', justifyContent:'center' }}>{selected.data.nom}</Typography>
                  </Grid>
                  <Grid item xs={12} md={8}>
                    <Paper variant="outlined" sx={{p: 2.5, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)'}}>
                      <InfoItem icon={<AccountBalanceWallet />} label="Devise principale" value={selected.data.devise} />
                      <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.1)' }} />
                      <InfoItem icon={<LocationOn />} label="Adresse" value={selected.data.adresse} />
                      <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.1)' }} />
                      <InfoItem icon={<Business />} label="Infos Légales (RCCM/NUI)" value={selected.data.legal} />
                      <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.1)' }} />
                      <InfoItem icon={<LinkIcon />} label="Site Web" value={selected.data.siteweb || "Non spécifié"} />
                    </Paper>
                  </Grid>
                </Grid>
              ) : (
                <Grid container spacing={2.5}>
                    <Grid item xs={12} md={4} sx={{textAlign: 'center'}}>
                        <Box sx={{ border: `1px dashed ${neonTheme.palette.secondary.main}`, borderRadius: '10px', p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%' }}>
                            {selected.data.logoUrl && (
                            <Avatar src={selected.data.logoUrl} alt="Logo actuel" variant="rounded" sx={{ width: 120, height: 120, mb: 1, border: `3px solid ${neonTheme.palette.secondary.main}`}} />
                            )}
                            <Button variant="outlined" color="secondary" component="label" startIcon={<CloudUpload />} fullWidth>
                                Changer Logo
                                <input type="file" hidden accept="image/*" ref={editFileInputRef} onChange={handleModalLogoUpload} />
                            </Button>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={8}>
                        <TextField label="Nom" value={selected.data.nom || ""} fullWidth onChange={(e) => setSelected((s) => s ? { ...s, data: { ...s.data, nom: e.target.value } } : s)} required InputProps={{startAdornment: <BusinessCenter sx={{ mr: 1, color: 'text.secondary' }} />}} />
                        <FormControl fullWidth required sx={{mt: 2.5}}>
                            <InputLabel id="modal-devise-label">Devise</InputLabel>
                            <Select labelId="modal-devise-label" value={selected.data.devise || "FCFA"} label="Devise" onChange={(e) => setSelected((s) => s ? { ...s, data: { ...s.data, devise: e.target.value } } : s)} startAdornment={<Palette sx={{ mr: 1, color: 'text.secondary' }} />}>
                            {currencies.map((option) => (<MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>))}
                            </Select>
                        </FormControl>
                        <TextField label="Adresse" value={selected.data.adresse || ""} fullWidth multiline rows={2} onChange={(e) => setSelected((s) => s ? { ...s, data: { ...s.data, adresse: e.target.value } } : s)} required sx={{mt: 2.5}} InputProps={{startAdornment: <HomeWork sx={{ mr: 1, color: 'text.secondary' }} />}} />
                        <TextField label="RCCM / NUI" value={selected.data.legal || ""} fullWidth onChange={(e) => setSelected((s) => s ? { ...s, data: { ...s.data, legal: e.target.value } } : s)} required sx={{mt: 2.5}} InputProps={{startAdornment: <ReceiptLong sx={{ mr: 1, color: 'text.secondary' }} />}}/>
                        <TextField label="Site web" value={selected.data.siteweb || ""} fullWidth onChange={(e) => setSelected((s) => s ? { ...s, data: { ...s.data, siteweb: e.target.value } } : s)} placeholder="https://..." sx={{mt: 2.5}} InputProps={{startAdornment: <Language sx={{ mr: 1, color: 'text.secondary' }} />}}/>
                    </Grid>
                </Grid>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${neonTheme.palette.secondary.main}44`, justifyContent: 'space-between' }}>
          <Button color="error" startIcon={<Delete />} onClick={handleDelete} disabled={isDeleting || isEditing} variant="outlined">
            {isDeleting ? <CircularProgress size={20} color="inherit" /> : "Désintégrer"}
          </Button>
          <Box sx={{display: 'flex', gap: 1.5}}>
            {!isEditing ? (
                <Button startIcon={<Edit />} onClick={() => {setIsEditing(true); setModalError(null);}} variant="contained" color="primary">
                    Modifier les Données
                </Button>
            ) : (
                <>
                <Button onClick={handleCancelEdit} variant="text" color="secondary" startIcon={<Cancel/>}>
                    Annuler
                </Button>
                <Button variant="contained" color="primary" onClick={handleSave} disabled={isSaving || !selected?.data?.logoUrl} startIcon={isSaving ? null : <Save/> }>
                    {isSaving ? <CircularProgress size={20} color="inherit"/> : "Sauvegarder Changements"}
                </Button>
                </>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled" sx={{ width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }} iconMapping={{ success: <CheckCircle fontSize="inherit" />, error: <ErrorOutline fontSize="inherit" />, info: <Info fontSize="inherit"/> }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}


export default function ModernizedBoutiqueManagement() {
  const [activeBoutiqueId, setActiveBoutiqueId] = useState<string | null>(null);
  const [showCreateBoutiqueForm, setShowCreateBoutiqueForm] = useState(false);

  const handleBoutiqueCreated = (id: string) => {
    setActiveBoutiqueId(id);
    // setShowCreateBoutiqueForm(false); // Le formulaire gère sa propre fermeture
  };

  const handleCancelCreateBoutique = () => {
    setShowCreateBoutiqueForm(false);
  };

  return (
    <ThemeProvider theme={neonTheme}>
      <CssBaseline />
      <GlobalAppStyles />
      <Box sx={{ maxWidth: '1200px', margin: 'auto', p: {xs: 2, md: 3} }}>
        <Typography variant="h4" component="h1" gutterBottom>
          🚀 Interface de Gestion Cyber-Commerciale 🚀
        </Typography>
        
        <Box sx={{mb: 4, p: 3, background: 'rgba(64, 224, 208, 0.05)', borderRadius: '12px', border: `1px solid rgba(64, 224, 208, 0.1)`}}>
            {!showCreateBoutiqueForm ? (
                <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} alignItems="center" justifyContent="space-between">
                    <Box>
                        <Typography variant="h6" sx={{color: 'primary.main', borderBottom: 'none', m:0}}>Prêt à Lancer Votre Empire ?</Typography>
                        <Typography variant="body2" sx={{color: 'text.secondary'}}>Enregistrez une nouvelle boutique digitale pour commencer.</Typography>
                    </Box>
                    <Button 
                        variant="contained" 
                        color="primary"
                        size="large"
                        startIcon={<AddBusiness />} 
                        onClick={() => setShowCreateBoutiqueForm(true)}
                        sx={{minWidth: '300px'}}
                    >
                        Créer une nouvelle Boutique 
                    </Button>
                </Stack>
            ) : (
                <CreateBoutique onCreated={handleBoutiqueCreated} onCancel={handleCancelCreateBoutique} />
            )}
        </Box>
        
        {activeBoutiqueId && !showCreateBoutiqueForm && (
            <Box sx={{mt: -2, mb: 4}}>
                 <CreateManager boutiqueId={activeBoutiqueId} />
            </Box>
        )}
       
        <BoutiqueList />
      </Box>
    </ThemeProvider>
  );
}
