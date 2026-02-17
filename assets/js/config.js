import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const firebaseConfig = {
  apiKey: "AIzaSyDxHTTM4Fpr33XCby7xbp1KIEVQ0oiohfs",
  authDomain: "barberia-e70b9.firebaseapp.com",
  projectId: "barberia-e70b9",
  storageBucket: "barberia-e70b9.firebasestorage.app",
  messagingSenderId: "751753961022",
  appId: "1:751753961022:web:e123bba8a47d68e165fb6f",
  measurementId: "G-1YBD4V8CFC"
};

// --- Configuración de Supabase ---
// Pega aquí la URL y la clave 'anon' que copiaste de tu proyecto de Supabase.
const supabaseUrl = 'https://jhnzerzaaoyvtzcrulrw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpobnplcnphYW95dnR6Y3J1bHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTksImV4cCI6MjA4NjkxMzIxOX0.eMvn3I7Dr8sUlksnl6qdEgemXDP0LnMQx4ZJM41W1rQ';

// --- Inicialización de servicios ---
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-BO', {
        style: 'currency',
        currency: 'BOB',
        minimumFractionDigits: 2
    }).format(amount);
};