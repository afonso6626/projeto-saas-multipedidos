// ATENÇÃO: SUBSTITUA ESTA CONFIGURAÇÃO PELA SUA NOVA CHAVE ASSIM QUE POSSÍVEL
const firebaseConfig = {
  apiKey: "AIzaSyCQgqyI2BwX-Z-Gf2Y5U6izxiv3cU_Oa1Y",
  authDomain: "painel-b28d7.firebaseapp.com",
  projectId: "painel-b28d7",
  storageBucket: "painel-b28d7.firebasestorage.app",
  messagingSenderId: "163008691731",
  appId: "1:163008691731:web:8dcba24854a9542afd49e6"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// --- LÓGICA DA PÁGINA DE LOGIN (index.html) ---

// Verifica se estamos na página de login antes de adicionar os listeners
if (document.getElementById('loginButton')) {
    const loginButton = document.getElementById('loginButton');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');

    // Função para tentar fazer o login
    const handleLogin = () => {
        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            errorMessage.textContent = 'Por favor, preencha todos os campos.';
            return;
        }
        
        errorMessage.textContent = '';

        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Login bem-sucedido!
                console.log('Login realizado com sucesso:', userCredential.user);
                // Redireciona para o dashboard
                window.location.href = 'dashboard.html';
            })
            .catch((error) => {
                // Trata os erros de login
                console.error('Erro no login:', error.code, error.message);
                if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    errorMessage.textContent = 'Email ou senha inválidos.';
                } else {
                    errorMessage.textContent = 'Ocorreu um erro. Tente novamente.';
                }
            });
    };

    loginButton.addEventListener('click', handleLogin);
}


// --- LÓGICA DE PROTEÇÃO DE PÁGINAS (Ex: dashboard.html) ---

// Esta função verifica se o usuário está logado. Se não estiver, redireciona para o login.
auth.onAuthStateChanged((user) => {
    // Se não há usuário logado E não estamos na página de login, redireciona
    if (!user && window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
        console.log('Nenhum usuário logado. Redirecionando para a página de login.');
        window.location.href = 'index.html';
    }
    
    // Se há um usuário logado E estamos na página de login, redireciona para o dashboard
    if (user && (window.location.pathname === '/index.html' || window.location.pathname === '/')) {
        console.log('Usuário já logado. Redirecionando para o dashboard.');
        window.location.href = 'dashboard.html';
    }
});