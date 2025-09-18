// src/components/UsersByCreator.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
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
  IconButton,
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
  // Grid, // Grid n'est plus utilisé directement, Stack est préféré
  Avatar,
  Chip,
  Tooltip,
  useTheme,
  alpha,
  TableContainer,
  TablePagination,
  InputAdornment,
} from "@mui/material";
import Stack from "@mui/material/Stack";
import {
  AssignmentInd as AssignmentIndIcon,
  Close as CloseIcon,
  Phone as PhoneIcon,
  Info as InfoIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
  Badge as BadgeIcon,
  WorkOutline as WorkOutlineIcon,
  SupervisorAccount as SupervisorAccountIcon,
  Storefront as StorefrontIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  Visibility as VisibilityIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
  Security as SecurityIcon,
  BusinessCenter as BusinessCenterIcon, // Caisse
  Inventory as InventoryIcon, // Stock
  Search as SearchIcon,
} from "@mui/icons-material";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  setDoc,
  deleteDoc,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp, // Pour createdAt
} from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";

// Primary Firebase config
import { firebaseConfig } from "@/lib/firebase";

// Init apps
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const secondaryApp = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);
const db = getFirestore(app);

interface UserDoc {
  uid: string;
  email: string;
  fullName: string;
  matricule?: string;
  poste?: string;
  phoneNumber?: string;
  role: "stock" | "caisse" | "gerant" | "admin";
  clientId: string;
  createdAt: unknown; // Idéalement Firestore Timestamp
}

interface Boutique {
  id: string;
  nom: string;
  utilisateursIds?: string[];
}

const getRoleProps = (role: UserDoc["role"] | undefined) => {
  switch (role) {
    case "admin":
      return { icon: <AdminPanelSettingsIcon />, color: "error", label: "Admin" };
    case "gerant":
      return { icon: <SupervisorAccountIcon />, color: "warning", label: "Gérant" };
    case "caisse":
      return { icon: <BusinessCenterIcon />, color: "info", label: "Caisse" };
    case "stock":
      return { icon: <InventoryIcon />, color: "success", label: "Stock" };
    default:
      return { icon: <InfoIcon />, color: "default", label: "Inconnu" };
  }
};

export default function UsersByCreator() {
  const theme = useTheme();
  const [user, loadingAuth] = useAuthState(auth);
  const [loadingData, setLoadingData] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [matricule, setMatricule] = useState("");
  const [poste, setPoste] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserDoc["role"]>("stock");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [assignDialog, setAssignDialog] = useState<{ uid: string; open: boolean }>({ uid: "", open: false });
  const [detailsDialog, setDetailsDialog] = useState<{ user: UserDoc | null; open: boolean; edit: boolean }>({
    user: null,
    open: false,
    edit: false,
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selBoutique, setSelBoutique] = useState("");

  const [isCreating, setIsCreating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" | "info" | "warning" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const [users, setUsers] = useState<UserDoc[]>([]);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const rowsPerPage = 10;

  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    const bq = collection(db, "boutiques");
    const uq = query(collection(db, "users"), where("clientId", "==", user.uid));
    
    const unsubB = onSnapshot(bq, (snap) => {
        setBoutiques(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Boutique, 'id'>) })));
    }, (error) => {
        console.error("Error fetching boutiques:", error);
        setSnackbar({ open: true, message: "Erreur de chargement des boutiques.", severity: "error" });
    });

    const unsubU = onSnapshot(uq, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserDoc, 'uid'>) })));
      setLoadingData(false);
    }, (error) => {
        console.error("Error fetching users:", error);
        setSnackbar({ open: true, message: "Erreur de chargement des utilisateurs.", severity: "error" });
        setLoadingData(false);
    });

    return () => {
      unsubB();
      unsubU();
    };
  }, [user]);

  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));

  const modernTextFieldProps = {
    variant: "filled" as const,
    sx: {
      '& .MuiFilledInput-root': {
        backgroundColor: alpha(theme.palette.primary.light, 0.1),
        '&:hover': {
          backgroundColor: alpha(theme.palette.primary.light, 0.15),
        },
        '&.Mui-focused': {
          backgroundColor: alpha(theme.palette.primary.light, 0.2),
        },
      },
      borderRadius: 1,
    }
  };
  
  const modernSelectProps = {
    variant: "filled" as const,
     sx: {
      backgroundColor: alpha(theme.palette.primary.light, 0.1),
      borderRadius: 1,
      '&:hover': {
        backgroundColor: alpha(theme.palette.primary.light, 0.15),
      },
       '&.Mui-focused': {
        backgroundColor: alpha(theme.palette.primary.light, 0.2),
      },
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return users.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(lowerSearchTerm) || // Added optional chaining for safety
        u.email?.toLowerCase().includes(lowerSearchTerm)
    );
  }, [users, searchTerm]);

  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [filteredUsers, page, rowsPerPage]);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  if (loadingAuth || loadingData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} thickness={4} />
        <Typography variant="h6" sx={{ ml: 2, color: theme.palette.text.secondary }}>Chargement des données...</Typography>
      </Box>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsCreating(true);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = cred.user.uid;
      const newUserDoc: UserDoc = {
        uid,
        email,
        fullName,
        matricule: matricule || undefined,
        poste: poste || undefined,
        phoneNumber: phone || undefined,
        role,
        clientId: user.uid,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", uid), newUserDoc);
      setSnackbar({ open: true, message: "Utilisateur créé avec succès !", severity: "success" });
      setEmail(""); setPassword(""); setFullName(""); setMatricule(""); setPoste(""); setPhone(""); setRole("stock");
      setCreateDialogOpen(false);
    } catch (error: unknown) {
      console.error("Erreur création:", error);
      setSnackbar({ open: true, message: `Erreur lors de la création: ${error.code === 'auth/email-already-in-use' ? 'Cet email est déjà utilisé.' : error.message || "Vérifiez les informations."}`, severity: "error" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAssign = async () => {
    setIsAssigning(true);
    const uidToAssign = assignDialog.uid;
    if (!selBoutique) {
        setSnackbar({ open: true, message: "Veuillez sélectionner une boutique.", severity: "warning" });
        setIsAssigning(false);
        return;
    }
    try {
      const prevBoutique = boutiques.find((b) => b.utilisateursIds?.includes(uidToAssign));
      if (prevBoutique && prevBoutique.id !== selBoutique) { 
        await updateDoc(doc(db, "boutiques", prevBoutique.id), { utilisateursIds: arrayRemove(uidToAssign) });
      }
      if(!prevBoutique || prevBoutique.id !== selBoutique) {
        await updateDoc(doc(db, "boutiques", selBoutique), { utilisateursIds: arrayUnion(uidToAssign) });
      }
      setSnackbar({ open: true, message: "Affectation réussie !", severity: "success" });
      setAssignDialog({ uid: "", open: false });
      setSelBoutique("");
    } catch (error: unknown) {
      console.error("Erreur affectation:", error);
      setSnackbar({ open: true, message: `Erreur d'affectation: ${error.message || "Réessayez."}`, severity: "error" });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!detailsDialog.user) return;
    setIsUpdating(true);
    try {
      const { uid, fullName, matricule, poste, phoneNumber, role } = detailsDialog.user;
      await updateDoc(doc(db, "users", uid), { 
        fullName, 
        matricule: matricule || null,
        poste: poste || null,
        phoneNumber: phoneNumber || null,
        role 
      });
      setSnackbar({ open: true, message: "Utilisateur mis à jour avec succès !", severity: "success" });
      setDetailsDialog((prev) => ({ ...prev, edit: false }));
    } catch (error: unknown) {
      console.error("Erreur mise à jour:", error);
      setSnackbar({ open: true, message: `Erreur de mise à jour: ${error.message || "Réessayez."}`, severity: "error" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!detailsDialog.user) return;
    setIsDeleting(true);
    try {
      const uidToDelete = detailsDialog.user.uid;
      const assignedBoutique = boutiques.find(b => b.utilisateursIds?.includes(uidToDelete));
      if (assignedBoutique) {
        await updateDoc(doc(db, "boutiques", assignedBoutique.id), { utilisateursIds: arrayRemove(uidToDelete) });
      }
      await deleteDoc(doc(db, "users", uidToDelete));
      // Décommenter si la suppression de l'utilisateur de Firebase Auth est aussi nécessaire
      // try {
      //   await deleteUserFn({ uid: uidToDelete });
      //   setSnackbar({ open: true, message: "Utilisateur supprimé avec succès (DB & Auth)!", severity: "success" });
      // } catch (authError: any) {
      //   console.error("Erreur suppression Auth:", authError);
      //   setSnackbar({ open: true, message: `Utilisateur supprimé de la DB, mais erreur Auth: ${authError.message || "Réessayez."}`, severity: "warning" });
      // }
      setSnackbar({ open: true, message: "Utilisateur supprimé de la base de données !", severity: "success" });
      
      setDetailsDialog({ user: null, open: false, edit: false });
    } catch (error: unknown) {
      console.error("Erreur suppression (Firestore):", error);
      setSnackbar({ open: true, message: `Erreur de suppression Firestore: ${error.message || "Réessayez."}`, severity: "error" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const getBoutiqueName = (uid: string | undefined) => {
    if (!uid) return "N/A";
    const b = boutiques.find((b) => b.utilisateursIds?.includes(uid));
    return b ? b.nom : "Non affecté";
  };

  // DetailItem avec la correction pour le nesting p > div
  const DetailItem = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | React.ReactNode | undefined | null }) => (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 1.5, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
      {React.cloneElement(icon as React.ReactElement, { sx: { color: 'primary.main', fontSize: '1.4rem' }})}
      <Typography variant="body2" color="text.secondary" sx={{minWidth: '100px'}}>{label}:</Typography>
      <Typography
        component="div" // Correction: Utiliser 'div' pour éviter p > div nesting
        variant="body1"
        fontWeight="medium"
        sx={{ flexGrow: 1, wordBreak: 'break-word', display: 'flex', alignItems: 'center' }}
      >
        {value ?? 'N/A'}
      </Typography>
    </Stack>
  );

  const commonDialogProps = {
    PaperProps: {
      sx: {
        borderRadius: 3,
        backgroundImage: `linear-gradient(to bottom right, ${alpha(theme.palette.background.paper, 0.9)}, ${alpha(theme.palette.background.default, 0.9)})`,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`
      }
    }
  };

  return (
    <Box sx={{ 
        p: { xs: 2, md: 4 }, 
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${theme.palette.grey[900]} 0%, ${theme.palette.grey[800]} 100%)`,
        color: theme.palette.common.white
      }}>
      <Stack direction={{xs: 'column', sm: 'row'}} justifyContent="space-between" alignItems="center" mb={4} spacing={2}>
        <Typography variant="h4" component="h1" fontWeight="bold" sx={{
            background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textAlign: {xs: 'center', sm: 'left'}
        }}>
          Gestion des Utilisateurs
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<AddCircleOutlineIcon />} 
          onClick={() => setCreateDialogOpen(true)}
          sx={{ 
            borderRadius: 2, 
            px: 3, 
            py: 1.5,
            fontWeight: 'bold',
            background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            '&:hover': {
                transform: 'scale(1.05)',
                boxShadow: `0 0 15px ${theme.palette.primary.main}`
            },
            transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
            alignSelf: {xs: 'stretch', sm: 'auto'}
          }}
        >
          Ajouter Utilisateur
        </Button>
      </Stack>

      <Box sx={{ mb: 3, maxWidth: {xs: '100%', sm: '400px'} }}>
        <TextField
          fullWidth
          variant="filled"
          placeholder="Rechercher par nom ou email..."
          value={searchTerm}
          onChange={(e) => {setSearchTerm(e.target.value); setPage(0);}}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: theme.palette.primary.light }} />
              </InputAdornment>
            ),
            sx: modernTextFieldProps.sx['& .MuiFilledInput-root'],
          }}
          sx={{ ...modernTextFieldProps.sx, borderRadius: 2 }}
        />
      </Box>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} fullWidth maxWidth="sm" {...commonDialogProps}>
        <DialogTitle sx={{ background: `linear-gradient(to right, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`, color: 'white', borderBottom: `1px solid ${theme.palette.primary.main}`}}>
          Nouvel Utilisateur
          <IconButton onClick={() => setCreateDialogOpen(false)} sx={{ position: "absolute", right: 12, top: 12, color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box component="form" id="user-create-form" onSubmit={handleCreate} sx={{ display: "grid", gap: 2.5 }}>
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}/>
            <TextField label="Mot de passe (min. 6 caractères)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}/>
            <TextField label="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)} required fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}/>
            <TextField label="Matricule (Optionnel)" value={matricule} onChange={(e) => setMatricule(e.target.value)} fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}/>
            <TextField label="Poste (Optionnel)" value={poste} onChange={(e) => setPoste(e.target.value)} fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}/>
            <TextField
              label="Téléphone (Optionnel)"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              InputProps={{ startAdornment: <PhoneIcon sx={{ mr: 1, color: theme.palette.primary.main }} /> }}
              fullWidth
              {...modernTextFieldProps}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel id="role-label-create" shrink sx={{color: theme.palette.text.secondary, '&.Mui-focused': { color: theme.palette.primary.main }}}>Rôle</InputLabel>
              <Select labelId="role-label-create" value={role} label="Rôle" onChange={(e) => setRole(e.target.value as UserDoc["role"])} {...modernSelectProps} >
                <MenuItem value="stock">Stock</MenuItem>
                <MenuItem value="caisse">Caisse</MenuItem>
                <MenuItem value="gerant">Gérant</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: `1px solid ${alpha(theme.palette.divider,0.1)}` }}>
          <Button onClick={() => setCreateDialogOpen(false)} sx={{ color: theme.palette.text.secondary }}>Annuler</Button>
          <Button type="submit" form="user-create-form" variant="contained" disabled={isCreating} sx={{
            background: `linear-gradient(to right, ${theme.palette.success.main}, ${theme.palette.success.dark})`,
            '&:hover': { transform: 'scale(1.03)' },
            transition: 'transform 0.2s'
          }}>
            {isCreating ? <CircularProgress size={24} color="inherit" /> : <><SaveIcon sx={{mr:1}}/>Créer</>}
          </Button>
        </DialogActions>
      </Dialog>

      <Paper sx={{ 
          mt: 1,
          width: '100%',
          overflow: 'hidden',
          borderRadius: 3, 
          backgroundColor: alpha(theme.palette.grey[800], 0.7),
          backdropFilter: 'blur(5px)',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
        }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader sx={{
              '& .MuiTableCell-head': {
                  color: theme.palette.secondary.light,
                  fontWeight: 'bold',
                  borderBottom: `2px solid ${theme.palette.primary.main}`,
                  fontSize: '1rem',
                  backgroundColor: alpha(theme.palette.grey[800], 0.95), // Ensure header is opaque
              },
              '& .MuiTableCell-body': {
                  color: theme.palette.grey[300],
                  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              },
              '& .MuiTableRow-root:hover': {
                  backgroundColor: alpha(theme.palette.primary.dark, 0.2),
                  transition: 'background-color 0.3s ease',
              }
          }}>
            <TableHead>
              <TableRow>
                <TableCell>Utilisateur</TableCell>
               
                <TableCell sx={{display: {xs: 'none', sm: 'table-cell'}}}>Téléphone</TableCell>
                <TableCell>Rôle</TableCell>
                <TableCell>Boutique</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="subtitle1" sx={{p: 3, color: theme.palette.grey[400]}}>
                      {searchTerm ? "Aucun utilisateur ne correspond à votre recherche." : "Aucun utilisateur trouvé. Commencez par en créer un !"}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {paginatedUsers.map((u) => {
                const roleProps = getRoleProps(u.role);
                return (
                <TableRow key={u.uid} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                  <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Avatar sx={{ bgcolor: theme.palette.primary.main, width: 36, height: 36, fontSize: '0.9rem' }}>
                              {u.fullName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'N/A'}
                          </Avatar>
                          <Typography variant="subtitle2" fontWeight="medium">{u.fullName || 'Nom Inconnu'}</Typography>
                      </Stack>
                  </TableCell>
                  
                  <TableCell sx={{display: {xs: 'none', sm: 'table-cell'}}}>{u.phoneNumber || "-"}</TableCell>
                  <TableCell>
                      <Chip 
                          icon={roleProps.icon}
                          label={roleProps.label}
                          size="small"
                          variant="outlined"
                          color={roleProps.color as "primary" | "secondary" | "error" | "info" | "success" | "warning" | "default"}
                          sx={{
                            borderColor: roleProps.color !== 'default' ? `${roleProps.color}.main` : theme.palette.grey[500], 
                            color: roleProps.color !== 'default' ? `${roleProps.color}.light` : theme.palette.grey[300],
                            '& .MuiChip-icon': { color: roleProps.color !== 'default' ? `${roleProps.color}.main` : theme.palette.grey[400] }
                          }}
                      />
                  </TableCell>
                  <TableCell>
                      <Chip 
                          icon={<StorefrontIcon />}
                          label={getBoutiqueName(u.uid)}
                          size="small"
                          variant="outlined"
                          sx={{
                              borderColor: getBoutiqueName(u.uid) === "Non affecté" ? theme.palette.grey[600] : theme.palette.info.main,
                              color: getBoutiqueName(u.uid) === "Non affecté" ? theme.palette.grey[400] : theme.palette.info.light,
                              '& .MuiChip-icon': { color: getBoutiqueName(u.uid) === "Non affecté" ? theme.palette.grey[500] : theme.palette.info.main }
                          }}
                      />
                  </TableCell>
                  <TableCell align="right">
                      <Tooltip title="Détails">
                          <IconButton size="small" onClick={() => setDetailsDialog({ user: u, open: true, edit: false })} sx={{ color: theme.palette.info.light, '&:hover': { color: theme.palette.info.main, transform: 'scale(1.1)' } }}>
                              <VisibilityIcon />
                          </IconButton>
                      </Tooltip>
                      <Tooltip title="Affecter Boutique">
                          <IconButton size="small" onClick={() => setAssignDialog({ uid: u.uid, open: true })} sx={{ ml: 0.5, color: theme.palette.warning.light, '&:hover': { color: theme.palette.warning.main, transform: 'scale(1.1)' } }}>
                              <AssignmentIndIcon />
                          </IconButton>
                      </Tooltip>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          sx={{ 
            color: theme.palette.grey[400],
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
            '& .MuiTablePagination-selectIcon': { color: theme.palette.primary.light },
            '& .MuiButtonBase-root.Mui-disabled': { color: theme.palette.grey[700] },
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                color: theme.palette.grey[300]
            }
          }}
          component="div"
          count={filteredUsers.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPageOptions={[10]}
          labelRowsPerPage="Lignes par page:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count !== -1 ? count : `plus de ${to}`}`}
        />
      </Paper>

      <Dialog open={assignDialog.open} onClose={() => setAssignDialog({ uid: "", open: false })} fullWidth maxWidth="xs" {...commonDialogProps}>
        <DialogTitle sx={{ background: `linear-gradient(to right, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`, color: 'white' }}>
          Affecter à une Boutique
          <IconButton onClick={() => setAssignDialog({ uid: "", open: false })} sx={{ position: "absolute", right: 12, top: 12, color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <FormControl fullWidth>
            <InputLabel id="assign-boutique-label" shrink sx={{color: theme.palette.text.secondary, '&.Mui-focused': { color: theme.palette.primary.main }}}>Boutique</InputLabel>
            <Select labelId="assign-boutique-label" value={selBoutique} label="Boutique" onChange={(e) => setSelBoutique(e.target.value)} {...modernSelectProps}>
              {boutiques.length === 0 && <MenuItem disabled>Aucune boutique disponible</MenuItem>}
              {boutiques.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  <StorefrontIcon sx={{ mr: 1, color: theme.palette.primary.light }} /> {b.nom}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{p:2}}>
          <Button onClick={() => setAssignDialog({ uid: "", open: false })} sx={{ color: theme.palette.text.secondary }}>Annuler</Button>
          <Button variant="contained" onClick={handleAssign} disabled={!selBoutique || isAssigning} sx={{
            background: `linear-gradient(to right, ${theme.palette.info.main}, ${theme.palette.info.dark})`,
            '&:hover': { transform: 'scale(1.03)' },
            transition: 'transform 0.2s'
          }}>
            {isAssigning ? <CircularProgress size={24} color="inherit" /> : "Affecter"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={detailsDialog.open} onClose={() => setDetailsDialog({ user: null, open: false, edit: false })} fullWidth maxWidth="md" {...commonDialogProps}>
        <DialogTitle sx={{ background: `linear-gradient(to right, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`, color: 'white', display: 'flex', alignItems: 'center' }}>
          <InfoIcon sx={{mr: 1.5}} /> Informations de l&apos;Utilisateur
          <IconButton
            onClick={() => setDetailsDialog({ user: null, open: false, edit: false })}
            sx={{ position: "absolute", right: 12, top: 12, color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: {xs: 1.5, md: 3}, background: alpha(theme.palette.background.paper, 0.6) }}>
          {detailsDialog.user && (
            !detailsDialog.edit ? (
                <Box>
                    <DetailItem icon={<EmailIcon />} label="Email" value={detailsDialog.user.email} />
                    <DetailItem icon={<BadgeIcon />} label="Nom complet" value={detailsDialog.user.fullName} />
                    <DetailItem icon={<SecurityIcon />} label="Matricule" value={detailsDialog.user.matricule} />
                    <DetailItem icon={<WorkOutlineIcon />} label="Poste" value={detailsDialog.user.poste} />
                    <DetailItem icon={<PhoneIcon />} label="Téléphone" value={detailsDialog.user.phoneNumber} />
                    <DetailItem icon={getRoleProps(detailsDialog.user.role).icon} label="Rôle" value={
                        <Chip 
                            label={getRoleProps(detailsDialog.user.role).label}
                            size="small"
                            color={getRoleProps(detailsDialog.user.role).color as unknown}
                        />
                    } />
                     <DetailItem 
                        icon={<StorefrontIcon />} 
                        label="Boutique Actuelle" 
                        value={getBoutiqueName(detailsDialog.user.uid)} 
                    />
                </Box>
            ) : (
                <Box component="form" id="user-update-form" onSubmit={(e) => { e.preventDefault(); handleUpdateUser(); }} sx={{ display: "grid", gap: 2.5, mt: 1 }}>
                    <TextField label="Email" value={detailsDialog.user.email} disabled fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}/>
                    <TextField
                        label="Nom complet"
                        value={detailsDialog.user.fullName}
                        onChange={(e) => setDetailsDialog((prev) => prev.user ? { ...prev, user: { ...prev.user!, fullName: e.target.value } } : prev )}
                        fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }} autoFocus
                    />
                    <TextField
                        label="Matricule"
                        value={detailsDialog.user.matricule || ""}
                        onChange={(e) => setDetailsDialog((prev) => prev.user ? { ...prev, user: { ...prev.user!, matricule: e.target.value || undefined } } : prev )}
                        fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="Poste"
                        value={detailsDialog.user.poste || ""}
                        onChange={(e) => setDetailsDialog((prev) => prev.user ? { ...prev, user: { ...prev.user!, poste: e.target.value || undefined } } : prev )}
                        fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="Téléphone"
                        type="tel"
                        value={detailsDialog.user.phoneNumber || ""}
                        onChange={(e) => setDetailsDialog((prev) => prev.user ? { ...prev, user: { ...prev.user!, phoneNumber: e.target.value || undefined } } : prev )}
                        fullWidth {...modernTextFieldProps} InputLabelProps={{ shrink: true }}
                        InputProps={{ startAdornment: <PhoneIcon sx={{ mr: 1, color: theme.palette.primary.main }} /> }}
                    />
                    <FormControl fullWidth>
                        <InputLabel id="role-label-edit" shrink sx={{color: theme.palette.text.secondary, '&.Mui-focused': { color: theme.palette.primary.main }}}>Rôle</InputLabel>
                        <Select
                            labelId="role-label-edit"
                            value={detailsDialog.user.role}
                            label="Rôle"
                            onChange={(e) => setDetailsDialog((prev) => prev.user ? { ...prev, user: { ...prev.user!, role: e.target.value as UserDoc["role"] } } : prev )}
                            {...modernSelectProps}
                        >
                        <MenuItem value="stock">Stock</MenuItem>
                        <MenuItem value="caisse">Caisse</MenuItem>
                        <MenuItem value="gerant">Gérant</MenuItem>
                        <MenuItem value="admin">Admin</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            )
          )}
        </DialogContent>
        <DialogActions sx={{p:2, borderTop: `1px solid ${alpha(theme.palette.divider,0.1)}`, justifyContent: 'space-between'}}>
          <Button 
            onClick={() => setDeleteConfirmOpen(true)} 
            startIcon={<DeleteIcon />} 
            color="error"
            variant="outlined"
            disabled={!detailsDialog.user || isDeleting}
            sx={{ 
                borderColor: theme.palette.error.main, 
                color: theme.palette.error.light,
                '&:hover': { borderColor: theme.palette.error.dark, backgroundColor: alpha(theme.palette.error.main, 0.1)}
            }}
          >
            {isDeleting ? <CircularProgress size={20} color="error" /> : "Supprimer"}
          </Button>
          <Box>
            {!detailsDialog.edit ? (
              <Button 
                onClick={() => setDetailsDialog((prev) => ({ ...prev, edit: true }))} 
                startIcon={<EditIcon />}
                variant="contained"
                disabled={!detailsDialog.user}
                sx={{ 
                    background: `linear-gradient(to right, ${theme.palette.secondary.main}, ${theme.palette.secondary.dark})`,
                    '&:hover': { transform: 'scale(1.03)' },
                    transition: 'transform 0.2s'
                }}
              >
                Modifier
              </Button>
            ) : (
              <>
                <Button onClick={() => setDetailsDialog(prev => ({...prev, user: users.find(u => u.uid === prev.user?.uid) || null, edit: false}))} startIcon={<CancelIcon />} sx={{ color: theme.palette.text.secondary, mr: 1 }}>
                    Annuler Modif.
                </Button>
                <Button type="submit" form="user-update-form" variant="contained" disabled={isUpdating}
                    sx={{ 
                        background: `linear-gradient(to right, ${theme.palette.success.main}, ${theme.palette.success.dark})`,
                        '&:hover': { transform: 'scale(1.03)' },
                        transition: 'transform 0.2s'
                    }}
                >
                  {isUpdating ? <CircularProgress size={24} color="inherit" /> : <><SaveIcon sx={{mr:1}}/>Enregistrer</>}
                </Button>
              </>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} {...commonDialogProps} maxWidth="xs">
        <DialogTitle sx={{ background: `linear-gradient(to right, ${theme.palette.error.dark}, ${theme.palette.error.main})`, color: 'white' }}>
            <SecurityIcon sx={{mr:1, verticalAlign: 'middle'}}/> Confirmation de Suppression
        </DialogTitle>
        <DialogContent sx={{pt: 2, color: theme.palette.text.primary}}>
            <Typography>Êtes-vous sûr de vouloir supprimer définitivement {detailsDialog.user?.fullName ? `l'utilisateur ${detailsDialog.user.fullName}` : "cet utilisateur"} ? Cette action est irréversible.</Typography>
        </DialogContent>
        <DialogActions sx={{p:2}}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ color: theme.palette.text.secondary }}>Annuler</Button>
          <Button color="error" variant="contained" onClick={handleDeleteUser} disabled={isDeleting}
            sx={{ 
                background: `linear-gradient(to right, ${theme.palette.error.main}, ${theme.palette.error.dark})`,
                '&:hover': { transform: 'scale(1.03)' },
                transition: 'transform 0.2s'
            }}
          >
            {isDeleting ? <CircularProgress size={24} color="inherit" /> : "Supprimer"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        TransitionProps={{
            onEnter: (node) => {
                if (node) {
                    node.style.transition = 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out';
                    node.style.transform = 'translateX(100%)';
                    node.style.opacity = '0';
                    requestAnimationFrame(() => {
                        node.style.transform = 'translateX(0)';
                        node.style.opacity = '1';
                    });
                }
            },
            onExit: (node) => {
                 if (node) {
                    node.style.transition = 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out';
                    node.style.transform = 'translateX(100%)';
                    node.style.opacity = '0';
                 }
            }
        }}
      >
        <Alert 
            onClose={handleCloseSnackbar} 
            severity={snackbar.severity} 
            sx={{ 
                width: "100%", 
                borderRadius: 2, 
                boxShadow: 6,
                '.MuiAlert-icon': { fontSize: '1.5rem' } 
            }} 
            variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}