// components/BonAchatPDFDoc.tsx (ou PurchaseOrderPDFDoc.tsx)
"use client";

import React from 'react';
// Commentez les imports MUI pour ce test si possible, ou assurez-vous qu'ils ne sont pas utilisés.
// import { Box, Typography, /* ... autres imports MUI ... */ } from '@mui/material';
import { Timestamp } from 'firebase/firestore';

// Gardez les interfaces pour que les props passent, mais on ne les utilisera pas toutes dans ce test.
interface PurchaseOrderItemDataForPDF {
  prixAchatUnitaire: number;
  nomProduit: string;
  productId: string;
  quantite: number;
}
export interface PurchaseOrderDataForPDF {
  id: string;
  createdAt: Timestamp;
  etat: string;
  items: PurchaseOrderItemDataForPDF[];
  status: string;
  supplierAdresse?: string;
  supplierId: string;
  supplierName: string;
  supplierTelephone?: string;
  total: number;
  totalPaye: number;
  resteAPayer: number;
  userId?: string;
}
export interface ShopInfo {
  nom?: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  pays?: string;
  telephone?: string;
  email?: string;
  logoUrl?: string;
  siret?: string;
  numTva?: string;
  devise: string;
}
interface PurchaseOrderPDFDocProps {
  order: PurchaseOrderDataForPDF;
  shopInfo: ShopInfo;
}

const PurchaseOrderPDFDoc: React.FC<PurchaseOrderPDFDocProps> = ({ order, shopInfo }) => {
  // Log pour vérifier que les props arrivent
  console.log("PDF DOC MINIMAL - Order ID:", order?.id);
  console.log("PDF DOC MINIMAL - Shop Name:", shopInfo?.nom);

  if (!order || !shopInfo) {
      return (
          <div style={{ padding: '20px', border: '2px dashed red', backgroundColor: 'lightpink', width: '210mm', minHeight: '297mm', fontFamily: 'Arial', color: 'black' }}>
              <h1 style={{color: 'darkred'}}>ERREUR: Données manquantes pour PDF minimal</h1>
              <p>Order ID: {order?.id || "NON FOURNI"}</p>
              <p>Shop Name: {shopInfo?.nom || "NON FOURNI"}</p>
          </div>
      );
  }

  return (
    <div
      style={{
        width: '210mm', // A4 width
        minHeight: '100px', // Hauteur minimale pour être sûr que ce n'est pas 0
        padding: '20px',
        backgroundColor: 'yellow', // Couleur de fond très visible
        color: 'black',            // Couleur de texte contrastante
        fontFamily: 'Arial, sans-serif', // Police standard la plus sûre
        fontSize: '12pt',
        border: '5px solid blue',   // Bordure visible
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ margin: '0 0 10px 0', paddingBottom: '5px', borderBottom: '2px solid green', color: 'green' }}>
        BON DE COMMANDE (TEST MINIMAL)
      </h1>
      <p style={{ margin: '5px 0' }}>
        <strong>ID Commande :</strong> {order.id || "N/A"}
      </p>
      <p style={{ margin: '5px 0' }}>
        <strong>Fournisseur :</strong> {order.supplierName || "N/A"}
      </p>
      <p style={{ margin: '5px 0' }}>
        <strong>Boutique :</strong> {shopInfo.nom || "N/A"}
      </p>
      <p style={{ margin: '5px 0', color: 'red', fontWeight: 'bold' }}>
        Si vous voyez ceci, la capture de base fonctionne.
      </p>
      <div style={{marginTop: '20px', padding: '10px', border: '1px dashed purple'}}>
        Contenu interne pour tester la hauteur. Lorem ipsum dolor sit amet.
      </div>

      {/* Test avec une image simple (remplacez par une URL d'image valide et accessible publiquement SANS CORS) */}
      {/* <img 
          src="https://via.placeholder.com/150/0000FF/808080?Text=Test+Image" 
          alt="Test Image" 
          style={{marginTop: '10px', border: '1px solid black'}}
          crossOrigin="anonymous" // Nécessaire si html2canvas l'exige
      /> */}
    </div>
  );
};

export default PurchaseOrderPDFDoc;