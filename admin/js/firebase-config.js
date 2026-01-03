// admin/js/firebase-config.js

// SUAS CHAVES ORIGINAIS E REAIS DO PROJETO painel-a2f75
const firebaseConfig = {
  apiKey: "AIzaSyCtsNqXGPeCvBK4qBA6yV5DcbZ-5F2Dc8s",
  authDomain: "painel-a2f75.firebaseapp.com",
  projectId: "painel-a2f75",
  storageBucket: "painel-a2f75.firebasestorage.app",
  messagingSenderId: "401613649175",
  appId: "1:401613649175:web:97f84c3f74a0fcced63352"
};

// Inicializa o Firebase (Verifica se já não foi iniciado para evitar erro)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Configura os serviços
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider(); // Necessário para o botão do Google

// Exporta para os outros arquivos usarem
export { auth, db, googleProvider };