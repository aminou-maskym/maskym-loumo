// src/components/ExpirationAlerts.tsx
"use client";

import React, { useState, useMemo } from "react"; // useEffect n'est plus utilisé ici directement
import {
  Box,
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Typography,
  Chip,
  IconButton,
  Stack,
  Divider,
  Avatar,
  Paper,
  Grid, // Assurez-vous que Grid est importé
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import VisibilityIcon from '@mui/icons-material/Visibility';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';

// Réutiliser l'interface Produit si elle est exportée, sinon la redéfinir ici
interface Produit {
  id: string;
  nom: string;
  description?: string;
  numeroSerie?: string;
  categoryId?: string;
  categoryName?: string;
  emplacement?: string;
  cout?: number;
  unite?: string;
  prix?: number;
  stock?: number;
  stockMin?: number;
  supplierId?: string;
  supplierName?: string;
  dateExpiration?: { seconds: number; nanoseconds: number };
  createdAt?: { seconds: number; nanoseconds: number };
  updatedAt?: { seconds: number; nanoseconds: number };
  imageUrl?: string;
}

interface ExpirationAlertsProps {
  products: Produit[];
  devise?: string;
}

const calculateDaysRemaining = (expirationTimestamp?: { seconds: number; nanoseconds: number }): number | null => {
  if (!expirationTimestamp) return null;
  const expirationDate = new Date(expirationTimestamp.seconds * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expirationDate.setHours(0, 0, 0, 0);

  const diffTime = expirationDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export default function ExpirationAlerts({ products, devise = "FCFA" }: ExpirationAlertsProps) {
  const [openAlertListDialog, setOpenAlertListDialog] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Produit | null>(null);

  const { expiringSoonProducts, expiredProducts } = useMemo(() => {
    const soon: Produit[] = [];
    const expired: Produit[] = [];

    products.forEach(product => {
      if (product.dateExpiration) {
        const daysRemaining = calculateDaysRemaining(product.dateExpiration);
        if (daysRemaining !== null) {
          if (daysRemaining <= 0) {
            expired.push(product);
          } else if (daysRemaining <= 30) {
            soon.push(product);
          }
        }
      }
    });
    return { expiringSoonProducts: soon, expiredProducts: expired };
  }, [products]);

  const totalAlerts = expiringSoonProducts.length + expiredProducts.length;

  if (totalAlerts === 0) {
    return null;
  }

  const handleOpenAlertList = () => {
    setOpenAlertListDialog(true);
  };

  const handleCloseAlertList = () => {
    setOpenAlertListDialog(false);
  };

  const handleShowProductDetails = (product: Produit) => {
    setSelectedProductForDetails(product);
  };

  const handleCloseProductDetails = () => {
    setSelectedProductForDetails(null);
  };

  const getAlertSeverity = (): "warning" | "error" => {
    return expiredProducts.length > 0 ? "error" : "warning";
  };

  const getAlertTitle = (): string => {
    if (expiredProducts.length > 0 && expiringSoonProducts.length > 0) {
      return `${expiredProducts.length} produit(s) expiré(s) et ${expiringSoonProducts.length} approchent de l'expiration !`;
    }
    if (expiredProducts.length > 0) {
      return `${expiredProducts.length} produit(s) sont expiré(s) !`;
    }
    return `${expiringSoonProducts.length} produit(s) approchent de leur date d'expiration.`;
  };

  const renderExpirationStatus = (product: Produit) => {
    const daysRemaining = calculateDaysRemaining(product.dateExpiration);
    if (daysRemaining === null) return <Chip label="Date N/A" size="small" />;
    if (daysRemaining <= 0) {
      return <Chip icon={<EventBusyIcon />} label={`Expiré (depuis ${Math.abs(daysRemaining)} j.)`} color="error" size="small" variant="outlined" />;
    }
    return <Chip icon={<AccessTimeIcon />} label={`Expire dans ${daysRemaining} j.`} color="warning" size="small" variant="outlined" />;
  };

  return (
    <>
      <Alert
        severity={getAlertSeverity()}
        iconMapping={{
          warning: <WarningAmberIcon fontSize="inherit" />,
          error: <ErrorOutlineIcon fontSize="inherit" />,
        }}
        action={
          <Button color="inherit" size="small" onClick={handleOpenAlertList} startIcon={<VisibilityIcon />}>
            VOIR LA LISTE
          </Button>
        }
        sx={{ mb: 2, borderRadius: 2, boxShadow: 3 }}
      >
        <AlertTitle sx={{ fontWeight: 'bold' }}>{getAlertTitle()}</AlertTitle>
        {expiredProducts.length > 0 && `Certains produits nécessitent une attention immédiate.`}
        {expiredProducts.length === 0 && expiringSoonProducts.length > 0 && `Pensez à vérifier votre stock pour éviter les pertes.`}
      </Alert>

      <Dialog open={openAlertListDialog} onClose={handleCloseAlertList} maxWidth="md" fullWidth>
        <DialogTitle sx={{ backgroundColor: getAlertSeverity() === 'error' ? 'error.dark' : 'warning.dark', color: 'white' }}>
          <Box display="flex" alignItems="center">
            {getAlertSeverity() === 'error' ? <ErrorOutlineIcon sx={{ mr: 1 }} /> : <WarningAmberIcon sx={{ mr: 1 }} />}
            Produits nécessitant une attention
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {expiredProducts.length > 0 && (
            <>
              <Typography variant="h6" gutterBottom sx={{ color: 'error.main', mt:1 }}>
                Produits Expirés ({expiredProducts.length})
              </Typography>
              <List dense>
                {expiredProducts.map(product => (
                  <ListItem
                    key={product.id}
                    secondaryAction={
                      <IconButton edge="end" aria-label="details" onClick={() => handleShowProductDetails(product)}>
                        <InfoOutlinedIcon />
                      </IconButton>
                    }
                    sx={{ '&:hover': { backgroundColor: 'action.hover' }, borderRadius: 1, mb: 0.5 }}
                  >
                    <ListItemIcon>
                      <Avatar src={product.imageUrl || undefined} sx={{ bgcolor: 'error.light' }}>
                        {product.nom.charAt(0)}
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={product.nom}
                      secondary={renderExpirationStatus(product)}
                      secondaryTypographyProps={{ component: 'span' }} // Correction appliquée ici
                    />
                  </ListItem>
                ))}
              </List>
              {expiringSoonProducts.length > 0 && <Divider sx={{ my: 2 }} />}
            </>
          )}
          {expiringSoonProducts.length > 0 && (
            <>
              <Typography variant="h6" gutterBottom sx={{ color: 'warning.main', mt: expiredProducts.length > 0 ? 1: 0 }}>
                Produits en Cours d'Expiration ({expiringSoonProducts.length})
              </Typography>
              <List dense>
                {expiringSoonProducts.map(product => (
                  <ListItem
                    key={product.id}
                    secondaryAction={
                      <IconButton edge="end" aria-label="details" onClick={() => handleShowProductDetails(product)}>
                        <InfoOutlinedIcon />
                      </IconButton>
                    }
                    sx={{ '&:hover': { backgroundColor: 'action.hover' }, borderRadius: 1, mb: 0.5 }}
                  >
                     <ListItemIcon>
                      <Avatar src={product.imageUrl || undefined} sx={{ bgcolor: 'warning.light' }}>
                        {product.nom.charAt(0)}
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={product.nom}
                      secondary={renderExpirationStatus(product)}
                      secondaryTypographyProps={{ component: 'span' }} // Correction appliquée ici
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAlertList}>Fermer</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!selectedProductForDetails}
        onClose={handleCloseProductDetails}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ backgroundColor: "primary.main", color: "#fff", borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}>
          <Box display="flex" alignItems="center">
            <InfoOutlinedIcon sx={{ mr: 1 }}/> Détails du Produit
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: "grey.50", p:3 }}>
          {selectedProductForDetails && (
            <Stack spacing={1.5}>
              <Paper elevation={2} sx={{p:2, borderRadius:2}}>
                <Box display="flex" alignItems="center" mb={2}>
                    <Avatar 
                        src={selectedProductForDetails.imageUrl || undefined} 
                        sx={{ width: 60, height: 60, mr: 2, bgcolor: 'primary.light' }}
                        alt={selectedProductForDetails.nom}
                    >
                        {selectedProductForDetails.nom.charAt(0).toUpperCase()}
                    </Avatar>
                    <Typography variant="h5" component="h2" fontWeight="bold" color="primary.dark">
                        {selectedProductForDetails.nom}
                    </Typography>
                </Box>
                 {selectedProductForDetails.description && (
                    <Box mb={1.5}>
                        <Typography variant="caption" color="text.secondary">Description:</Typography>
                        <Typography variant="body2" sx={{ fontStyle: 'italic', pl:1 }}>{selectedProductForDetails.description}</Typography>
                    </Box>
                 )}
              </Paper>

              <Paper elevation={1} sx={{p:2, borderRadius:2}}>
                <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={6}><DetailItem label="Prix de vente" value={`${selectedProductForDetails.prix ?? 'N/A'} ${devise}`} /></Grid>
                    <Grid item xs={12} sm={6}><DetailItem label="Coût d'achat" value={`${selectedProductForDetails.cout ?? 'N/A'} ${devise}`} /></Grid>
                    <Grid item xs={12} sm={6}><DetailItem label="Stock Actuel" value={`${selectedProductForDetails.stock ?? 'N/A'} ${selectedProductForDetails.unite || ''}`} /></Grid>
                    <Grid item xs={12} sm={6}><DetailItem label="Stock Minimum" value={`${selectedProductForDetails.stockMin ?? 'N/A'} ${selectedProductForDetails.unite || ''}`} /></Grid>
                    <Grid item xs={12} sm={6}><DetailItem label="N° de Série" value={selectedProductForDetails.numeroSerie || "—"} /></Grid>
                    <Grid item xs={12} sm={6}><DetailItem label="Catégorie" value={selectedProductForDetails.categoryName || "—"} /></Grid>
                    <Grid item xs={12} sm={6}><DetailItem label="Fournisseur" value={selectedProductForDetails.supplierName || "—"} /></Grid>
                    <Grid item xs={12} sm={6}><DetailItem label="Emplacement" value={selectedProductForDetails.emplacement || "—"} /></Grid>
                </Grid>
              </Paper>
              
              <Paper elevation={1} sx={{p:2, borderRadius:2}}>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">Informations de péremption</Typography>
                <Box display="flex" alignItems="center" mb={1}>
                    <CalendarTodayIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    <Typography variant="body2">
                    <strong>Date d'expiration:</strong>{" "}
                    {selectedProductForDetails.dateExpiration
                        ? new Date(selectedProductForDetails.dateExpiration.seconds * 1000).toLocaleDateString()
                        : "Non définie"}
                    </Typography>
                </Box>
                {selectedProductForDetails.dateExpiration && renderExpirationStatus(selectedProductForDetails)}
              </Paper>

              <Paper elevation={1} sx={{p:2, borderRadius:2}}>
                 <Typography variant="subtitle2" gutterBottom color="text.secondary">Historique</Typography>
                 {selectedProductForDetails.createdAt && (
                    <DetailItem label="Créé le" value={new Date(selectedProductForDetails.createdAt.seconds * 1000).toLocaleString()} />
                  )}
                  {selectedProductForDetails.updatedAt && (
                    <DetailItem label="Mis à jour le" value={new Date(selectedProductForDetails.updatedAt.seconds * 1000).toLocaleString()} />
                  )}
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px:3, py:2 }}>
          <Button onClick={handleCloseProductDetails} variant="outlined">Fermer</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const DetailItem = ({ label, value }: { label: string, value: string | number | undefined }) => (
    <Box>
        <Typography variant="caption" color="text.secondary" display="block">{label}:</Typography>
        <Typography variant="body2" fontWeight="500">{value ?? 'N/A'}</Typography> {/* Ajout de ?? 'N/A' pour les valeurs undefined */}
    </Box>
);