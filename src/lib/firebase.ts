// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED,
} from "firebase/firestore";

// Ta configuration Firebase
export const firebaseConfig = {

  apiKey: "AIzaSyAkZlF91wr9nVWTddoglDxz-W-RYIKJExc",
  authDomain: "loumo-23570.firebaseapp.com",
  projectId: "loumo-23570",
  storageBucket: "loumo-23570.firebasestorage.app",
  messagingSenderId: "538069428373",
  appId: "1:538069428373:web:619c1f05794893ccb6139c",
  measurementId: "G-Z2RY4FDVXZ"
};
// Initialise l'app Firebase
const app = initializeApp(firebaseConfig);

// Authentification
export const auth = getAuth(app);

// Firestore
export const db = getFirestore(app);

// Active la persistance IndexedDB (multi‐onglet + cache illimité)
enableIndexedDbPersistence(db, { synchronizeTabs: true, cacheSizeBytes: CACHE_SIZE_UNLIMITED })
  .catch(err => {
    console.warn("Persistance Firestore non disponible :", err.code);
  });
