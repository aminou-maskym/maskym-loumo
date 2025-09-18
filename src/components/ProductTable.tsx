"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import { supabase } from "@/lib/supabaseClient"; // pour getPublicUrl si besoin
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  Timestamp,
  getDocs,
  Query,
} from "firebase/firestore";

import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Pagination,
  Typography,
  Divider,
  Stack,
  Tooltip,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

import EditProductForm from "./EditProductForm";

// Interface
interface Produit {
  id: string;
  boutiqueId: string;
  nom: string;
  description?: string;
  numeroSerie?: string | null;
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
  dateExpiration?: Timestamp | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  imageUrl?: string;
  imageUrls?: string[];
  imagePath?: string;
}

// utilitaires
const formatTimestamp = (t?: Timestamp | null) => {
  if (!t) return "—";
  try {
    return new Date(t.seconds * 1000).toLocaleDateString();
  } catch {
    return String(t);
  }
};

const formatTimestampForInput = (timestamp: Timestamp | undefined | null): string => {
  if (!timestamp) return "";
  return new Date((timestamp as Timestamp).seconds * 1000).toISOString().split("T")[0];
};

export default function ProductTable() {
  const [user, loadingAuth] = useAuthState(auth);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [devise, setDevise] = useState<string>("FCFA");
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(true);

  // role
  const [userRole, setUserRole] = useState<string | null>(null);

  // Recherche & pagination
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(1);
  const parPage = 10; // paginé à 10

  // Menu & dialogs
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuProd, setMenuProd] = useState<Produit | null>(null);
  const [prodVoir, setProdVoir] = useState<Produit | null>(null);
  const [prodModifier, setProdModifier] = useState<unknown | null>(null);
  const [prodSupprimer, setProdSupprimer] = useState<Produit | null>(null);

  // tri
  const [sortBy, setSortBy] = useState<string | null>("supplierName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Fetch user role once
  useEffect(() => {
    if (!user) {
      setUserRole(null);
      return;
    }
    const fetchRole = async () => {
      try {
        const udoc = await getDoc(doc(db, "users", user.uid));
        if (udoc.exists()) {
          const data = udoc.data() as any;
          setUserRole((data?.role ?? null)?.toString() ?? null);
        } else {
          setUserRole(null);
        }
      } catch (err) {
        console.warn("Impossible de récupérer le rôle utilisateur:", err);
        setUserRole(null);
      }
    };
    fetchRole();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const bQuery = query(collection(db, "boutiques"), where("utilisateursIds", "array-contains", user.uid));

    const unsubscribeBoutique = onSnapshot(
      bQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const bDoc = snapshot.docs[0];
          const bId = bDoc.id;
          setBoutiqueId(bId);
          setDevise((bDoc.data() as any).devise || "FCFA");

          const productsRef = collection(db, "boutiques", bId, "products");
          const productsQuery = productsRef as Query;

          (async () => {
            try {
              const cacheSnap = await getDocs(productsQuery, { source: "cache" });
              if (!cacheSnap.empty) {
                const cached = cacheSnap.docs.map((d) => ({
                  id: d.id,
                  boutiqueId: bId,
                  ...(d.data() as Omit<Produit, "id" | "boutiqueId">),
                }));
                setProduits(cached);
                setLoading(false);
                try {
                  localStorage.setItem("maskym_products_cache", JSON.stringify(cached));
                } catch {}
              } else {
                try {
                  const raw = localStorage.getItem("maskym_products_cache");
                  if (raw) {
                    const parsed = JSON.parse(raw) as Produit[];
                    setProduits(parsed);
                    setLoading(false);
                  }
                } catch {}
              }
            } catch (err) {
              console.warn("Erreur lecture cache products:", err);
              try {
                const raw = localStorage.getItem("maskym_products_cache");
                if (raw) {
                  const parsed = JSON.parse(raw) as Produit[];
                  setProduits(parsed);
                  setLoading(false);
                }
              } catch {}
            } finally {
              const unsubscribeProduits = onSnapshot(
                productsQuery,
                (pSnapshot) => {
                  const productsData = pSnapshot.docs.map((d) => ({
                    id: d.id,
                    boutiqueId: bId,
                    ...(d.data() as Omit<Produit, "id" | "boutiqueId">),
                  }));
                  setProduits(productsData);
                  setLoading(false);
                  try {
                    localStorage.setItem("maskym_products_cache", JSON.stringify(productsData));
                  } catch {}
                },
                (err) => {
                  console.error("Erreur realtime products:", err);
                }
              );

              (window as any).__unsubscribeProducts = unsubscribeProduits;
            }
          })();
        } else {
          setLoading(false);
          setProduits([]);
        }
      },
      (error) => {
        console.error("Erreur de récupération de la boutique:", error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeBoutique();
      try {
        const u = (window as any).__unsubscribeProducts;
        if (typeof u === "function") u();
      } catch {}
    };
  }, [user]);

  const produitsFiltres = useMemo(() => {
    if (!recherche) return produits;
    const q = recherche.toLowerCase();
    return produits.filter(
      (p) =>
        (p.nom || "").toLowerCase().includes(q) ||
        ((p.numeroSerie || "") + "").toLowerCase().includes(q) ||
        ((p.categoryName || "") + "").toLowerCase().includes(q) ||
        ((p.supplierName || "") + "").toLowerCase().includes(q) ||
        ((p.emplacement || "") + "").toLowerCase().includes(q)
    );
  }, [produits, recherche]);

  const produitsTries = useMemo(() => {
    if (!sortBy) return produitsFiltres;
    const arr = [...produitsFiltres];
    arr.sort((a: any, b: any) => {
      const getVal = (obj: any, key: string) => {
        const v = obj[key];
        if (v && typeof v === "object" && "seconds" in v) return v.seconds;
        if (v === undefined || v === null) return "";
        return v;
      };
      const va = getVal(a, sortBy);
      const vb = getVal(b, sortBy);
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      if (sa < sb) return sortDir === "asc" ? -1 : 1;
      if (sa > sb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [produitsFiltres, sortBy, sortDir]);

  const countPages = Math.ceil(produitsTries.length / parPage);
  const produitsAffiches = useMemo(() => {
    const start = (page - 1) * parPage;
    return produitsTries.slice(start, start + parPage);
  }, [produitsTries, page, parPage]);

  const openMenu = (e: React.MouseEvent<HTMLElement>, p: Produit) => {
    setAnchorEl(e.currentTarget);
    setMenuProd(p);
  };
  const closeMenu = () => {
    setAnchorEl(null);
    setMenuProd(null);
  };

  const handleOpenEditModal = () => {
    if (!menuProd) return;
    const productForForm = {
      ...menuProd,
      dateExpiration: formatTimestampForInput(menuProd.dateExpiration as any),
    };
    setProdModifier(productForForm);
    closeMenu();
  };

  const handleDelete = async () => {
    if (!boutiqueId || !prodSupprimer) return;
    await deleteDoc(doc(db, "boutiques", boutiqueId, "products", prodSupprimer.id));
    setProdSupprimer(null);
  };

  // Adaptation: le bouton "Vendre" ouvre automatiquement le saleForm
  const handleSell = (p: Produit) => {
    const payload = {
      produitId: p.id,
      nom: p.nom,
      prix: p.prix ?? 0,
      unite: p.unite ?? "u",
      stock: p.stock ?? 0,
      boutiqueId: p.boutiqueId,
      qty: 1,
    };

    window.dispatchEvent(new CustomEvent("loumo:add-to-sale", { detail: payload }));

    try {
      const fn = (window as any).openSaleForm;
      if (typeof fn === "function") {
        fn(payload);
        return;
      }
    } catch {}
  };

  const getImageUrlsForProduct = (p: Produit): string[] => {
    const urls: string[] = [];
    if (p.imageUrls && Array.isArray(p.imageUrls) && p.imageUrls.length) {
      urls.push(...p.imageUrls);
    } else if (p.imageUrl) {
      urls.push(p.imageUrl);
    } else if (p.imagePath) {
      try {
        const res: any = supabase.storage.from("files").getPublicUrl(p.imagePath);
        const publicUrl = res?.data?.publicUrl ?? res?.publicUrl ?? null;
        if (publicUrl) urls.push(publicUrl);
      } catch (err) {
        console.warn("Impossible d'obtenir publicUrl via supabase pour imagePath:", err);
      }
    }
    return urls;
  };

  // Export Excel (utilise dynamic import pour xlsx)
  const exportToExcel = async () => {
    try {
      const XLSX: any = await import("xlsx");
      const rows = produitsTries.map((p) => {
        const stock = p.stock ?? 0;
        const puv = p.prix ?? 0;
        const pua = p.cout ?? 0;
        return {
          Fournisseur: p.supplierName || "-",
          "Date création": formatTimestamp(p.createdAt),
          "Réf. Produit": p.numeroSerie || "-",
          "Nom du produit": p.nom,
          Unité: p.unite || "-",
          Emplacement: p.emplacement || "-",
          Stock: stock,
          PUV: puv,
          PUA: pua,
          "Montant A": pua * stock,
          "Montant V": puv * stock,
          Catégorie: p.categoryName || "-",
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Produits");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `produits_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erreur export Excel:", err);
      alert("Impossible d'exporter en Excel (vérifie que la librairie xlsx est installée)");
    }
  };

  if (loadingAuth || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="50vh">
        <CircularProgress />
      </Box>
    );
  }

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortDir === "asc" ? <ArrowUpwardIcon fontSize="small" sx={{ ml: 0.5 }} /> : <ArrowDownwardIcon fontSize="small" sx={{ ml: 0.5 }} />;
  };

  // roles allowed to see the panier button
  const allowedRoles = ["gerant", "proprietaire", "admin"];
  const canSeeCart = allowedRoles.includes((userRole ?? "").toLowerCase());

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <TextField
          placeholder="Rechercher par nom, n° de série, catégorie..."
          value={recherche}
          onChange={(e) => {
            setRecherche(e.target.value);
            setPage(1);
          }}
          size="small"
          sx={{ width: { xs: '100%', sm: 360 } }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          }}
        />

        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={exportToExcel}>
            Exporter (Excel)
          </Button>
        </Stack>
      </Stack>

      <Paper elevation={0} sx={{ borderRadius: 1, overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& .MuiTableCell-root': { fontWeight: '600', whiteSpace: 'nowrap', py: 0.6 } }}>
              <TableCell onClick={() => toggleSort("supplierName")} style={{ cursor: "pointer" }}>Fournisseur {renderSortIcon("supplierName")}</TableCell>
              <TableCell onClick={() => toggleSort("createdAt")} style={{ cursor: "pointer" }}>Date création {renderSortIcon("createdAt")}</TableCell>
              <TableCell onClick={() => toggleSort("numeroSerie")} style={{ cursor: "pointer" }}>Réf. Produit {renderSortIcon("numeroSerie")}</TableCell>
              <TableCell onClick={() => toggleSort("nom")} style={{ cursor: "pointer" }}>Nom du produit {renderSortIcon("nom")}</TableCell>
              <TableCell onClick={() => toggleSort("unite")} style={{ cursor: "pointer" }}>Unité {renderSortIcon("unite")}</TableCell>
              <TableCell onClick={() => toggleSort("emplacement")} style={{ cursor: "pointer" }}>MG {renderSortIcon("emplacement")}</TableCell>
              <TableCell align="right" onClick={() => toggleSort("stock")} style={{ cursor: "pointer" }}>Stock {renderSortIcon("stock")}</TableCell>
              <TableCell align="right" onClick={() => toggleSort("prix")} style={{ cursor: "pointer" }}>PUV {renderSortIcon("prix")}</TableCell>
              <TableCell align="right" onClick={() => toggleSort("cout")} style={{ cursor: "pointer" }}>PUA {renderSortIcon("cout")}</TableCell>
              <TableCell align="right">Montant A</TableCell>
              <TableCell align="right">Montant V</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {produitsAffiches.length > 0 ? (
              produitsAffiches.map((p) => {
                const stock = p.stock ?? 0;
                const puv = p.prix ?? 0;
                const pua = p.cout ?? 0;
                const montantA = pua * stock;
                const montantV = puv * stock;

                return (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ py: 0.6 }}>{p.supplierName || "—"}</TableCell>
                    <TableCell sx={{ py: 0.6 }}>{formatTimestamp(p.createdAt)}</TableCell>
                    <TableCell sx={{ py: 0.6 }}>{p.numeroSerie || "—"}</TableCell>
                    <TableCell component="th" scope="row" sx={{ py: 0.6 }}>{p.nom}</TableCell>
                    <TableCell sx={{ py: 0.6 }}>{p.unite || "—"}</TableCell>
                    <TableCell sx={{ py: 0.6 }}>{p.emplacement || "—"}</TableCell>
                    <TableCell align="right" sx={{ py: 0.6 }}>{stock || ""}</TableCell>
                    <TableCell align="right" sx={{ py: 0.6 }}>{(puv).toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ py: 0.6 }}>{(pua).toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ py: 0.6 }}>{(montantV).toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ py: 0.6 }}>{(montantA).toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ py: 0.4 }}>
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                        {/* Affiche le bouton panier seulement pour certains rôles */}
                        {canSeeCart ? (
                          <Tooltip title={stock > 0 ? "Vendre (ouvrir le POS)" : "Rupture de stock"}>
                            <span>
                              <IconButton size="small" onClick={() => handleSell(p)} disabled={stock <= 0}>
                                <AddShoppingCartIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : null}

                        <IconButton size="small" onClick={(e) => openMenu(e, p)}>
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={12} align="center" sx={{ py: 2 }}>
                  <Typography color="text.secondary">Aucun produit à afficher.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {countPages > 1 && (
        <Box mt={1} display="flex" justifyContent="center">
          <Pagination size="small" count={countPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
        </Box>
      )}

      {/* Menu d’actions (sans 'Ajouter au stock') */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
        <MenuItem onClick={() => { setProdVoir(menuProd); closeMenu(); }}>
          <InfoOutlinedIcon fontSize="small" sx={{ mr: 1.2 }} /> Détails
        </MenuItem>
        <MenuItem onClick={handleOpenEditModal}>
          <EditOutlinedIcon fontSize="small" sx={{ mr: 1.2 }} /> Modifier
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setProdSupprimer(menuProd); closeMenu(); }} sx={{ color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1.2 }} /> Supprimer
        </MenuItem>
      </Menu>

      {/* Dialogs (Détails, Edit, Supprimer) */}
      <Dialog open={!!prodVoir} onClose={() => setProdVoir(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Détails du produit</DialogTitle>
        <DialogContent dividers>
          {prodVoir && (
            <>
              {(() => {
                const imageUrls = getImageUrlsForProduct(prodVoir);
                if (imageUrls.length > 0) {
                  return (
                    <Box mb={1}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>{imageUrls.length > 1 ? `${imageUrls.length} images` : "Image"}</Typography>
                      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', py: 0.5 }}>
                        {imageUrls.map((url, idx) => (
                          <Paper key={idx} variant="outlined" sx={{ flex: '0 0 auto', width: 180, height: 120, borderRadius: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={url} alt={`${prodVoir.nom}_img_${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </Paper>
                        ))}
                      </Box>
                    </Box>
                  );
                }
                return (
                  <Box mb={1}>
                    <Typography variant="caption" color="text.secondary">Aucune image disponible pour ce produit.</Typography>
                  </Box>
                );
              })()}

              <Stack spacing={1}>
                <Typography variant="h6">{prodVoir.nom}</Typography>
                <Typography variant="body2" color="text.secondary">{prodVoir.description || "Aucune description."}</Typography>
                <Divider />
                <Typography><strong>Prix de vente:</strong> {prodVoir.prix?.toLocaleString() || 'N/A'} {devise}</Typography>
                <Typography><strong>Coût d'achat:</strong> {prodVoir.cout?.toLocaleString() || 'N/A'} {devise}</Typography>
                <Typography><strong>Stock actuel:</strong> {prodVoir.stock || 0} {prodVoir.unite}</Typography>
                <Typography><strong>Emplacement:</strong> {prodVoir.emplacement || "Non spécifié"}</Typography>
                <Typography><strong>Catégorie:</strong> {prodVoir.categoryName || "Non spécifiée"}</Typography>
                <Typography><strong>Fournisseur:</strong> {prodVoir.supplierName || "Non spécifié"}</Typography>
                <Typography><strong>N° série/SKU:</strong> {prodVoir.numeroSerie || "N/A"}</Typography>
                <Typography><strong>Date d'expiration:</strong> {prodVoir.dateExpiration ? new Date(prodVoir.dateExpiration.seconds * 1000).toLocaleDateString() : "N/A"}</Typography>
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setProdVoir(null)}>Fermer</Button></DialogActions>
      </Dialog>

      <Dialog open={!!prodModifier} onClose={() => setProdModifier(null)} maxWidth="md" fullWidth>
        <DialogTitle>Modifier: {(prodModifier as any)?.nom}</DialogTitle>
        <DialogContent dividers>
          {prodModifier && <EditProductForm product={prodModifier} onDone={() => setProdModifier(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!prodSupprimer} onClose={() => setProdSupprimer(null)}>
        <DialogTitle>Supprimer "{prodSupprimer?.nom}" ?</DialogTitle>
        <DialogContent>
          <Typography>Cette action est irréversible. Êtes-vous sûr de vouloir supprimer ce produit ?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProdSupprimer(null)}>Annuler</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Supprimer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
