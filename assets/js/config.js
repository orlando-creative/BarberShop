import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxHTTM4Fpr33XCby7xbp1KIEVQ0oiohfs",
  authDomain: "barberia-e70b9.firebaseapp.com",
  projectId: "barberia-e70b9",
  storageBucket: "barberia-e70b9.firebasestorage.app",
  messagingSenderId: "751753961022",
  appId: "1:751753961022:web:e123bba8a47d68e165fb6f",
  measurementId: "G-1YBD4V8CFC"
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-BO', {
        style: 'currency',
        currency: 'BOB',
        minimumFractionDigits: 2
    }).format(amount);
};