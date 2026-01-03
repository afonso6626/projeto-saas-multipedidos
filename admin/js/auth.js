import { auth, db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

// ============================================================
// 1. GUARDA DE SEGURANÇA IMEDIATA (Flash Guard)
// ============================================================
(function instantSecurityCheck() {
    const role = sessionStorage.getItem('USER_ROLE');
    const path = window.location.pathname;
    const pageName = path.split('/').pop() || 'index.html';

    // Páginas que o Atendente PODE ver
    const ALLOWED_PAGES_ATENDENTE = [
        'pedidos.html',
        'historico.html',
        'clientes.html',
        'motoboys.html',
        'index.html',
        'menu.html'
    ];

    // Se for atendente:
    if (role === 'atendente') {
        // 1. Bloqueio de Acesso
        if (!ALLOWED_PAGES_ATENDENTE.includes(pageName)) {
            window.location.href = 'pedidos.html';
            // throw new Error("Acesso Negado"); // Comentado para evitar travamento no console
        }

        // 2. Limpeza Visual IMEDIATA
        document.addEventListener('DOMContentLoaded', () => {
            applyAttendantRestrictions();
        });
    }
})();

// ============================================================
// 2. LÓGICA PRINCIPAL
// ============================================================

const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logoutButton');
const userEmailSpan = document.getElementById('user-email');

document.addEventListener('DOMContentLoaded', () => {
    // Delay visual para evitar flash de conteúdo
    setTimeout(() => {
        document.body.classList.add('auth-loaded');
    }, 50); 
    
    atualizarNomeDaLojaSidebar(); 
});

// --- LOGIN ---
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('error-message');

        if(errorMessage) errorMessage.textContent = '';
        showLoader();

        auth.signInWithEmailAndPassword(email, password)
            .then(async (userCredential) => {
                await processarLoginUsuario(userCredential.user);
            })
            .catch((error) => {
                console.error("Erro login:", error);
                let msg = 'Email ou senha inválidos.';
                if(error.code === 'auth/user-not-found') msg = 'Usuário não encontrado.';
                if(error.code === 'auth/wrong-password') msg = 'Senha incorreta.';
                if(error.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Tente mais tarde.';
                
                if(errorMessage) errorMessage.textContent = msg;
                hideLoader();
            });
    });
}

/**
 * Processa o usuário após o login para descobrir sua Loja e Função.
 */
async function processarLoginUsuario(user) {
    try {
        // Tenta pegar o token com Claims (força refresh para garantir dados novos)
        let tokenResult = await user.getIdTokenResult(true);
        let claims = tokenResult.claims;

        let lojaId = claims.lojaId;
        let funcao = claims.dono ? 'dono' : (claims.role || 'atendente');

        // --- RETRY CLAIMS (Correção para Latência) ---
        // Se acabou de criar a conta, o backend pode demorar 1 ou 2 segundos para setar a Claim.
        // Se não veio lojaId, esperamos um pouco e tentamos de novo antes de falhar.
        if (!lojaId) {
            console.log("Claims ausentes. Tentando atualização...");
            await new Promise(r => setTimeout(r, 2000)); // Espera 2s
            tokenResult = await user.getIdTokenResult(true);
            claims = tokenResult.claims;
            lojaId = claims.lojaId;
            funcao = claims.dono ? 'dono' : (claims.role || 'atendente');
        }

        // --- FALLBACK: BUSCA NO BANCO ---
        // Se ainda não tem lojaId (Ex: Backend offline na criação), tenta buscar no Firestore.
        // Nota: Isso falhará se as regras de segurança exigirem lojaId para ler.
        if (!lojaId) {
            console.log("Buscando vínculo no Firestore (Fallback)...");
            try {
                const snapshot = await db.collection('funcionarios').where('email', '==', user.email).limit(1).get();
                if (!snapshot.empty) {
                    const docData = snapshot.docs[0].data();
                    lojaId = docData.lojaId;
                    funcao = docData.funcao || 'atendente';
                }
            } catch (queryError) {
                console.warn("Falha no fallback de banco:", queryError.code);
                // Se der erro de permissão aqui, é porque o usuário realmente não tem acesso a nada.
                if (queryError.code === 'permission-denied') {
                    throw new Error("Sua conta não possui uma loja vinculada e o acesso foi negado.");
                }
            }
        }

        if (lojaId) {
            // Sucesso! Salva na sessão
            sessionStorage.setItem('SAAS_LOJA_ID', lojaId);
            sessionStorage.setItem('USER_ROLE', funcao);
            
            // Busca o nome da loja para exibir (Opcional)
            await atualizarNomeDaLojaSidebar(lojaId);

            // Redireciona
            if (funcao === 'atendente') window.location.href = 'admin/pedidos.html';
            else window.location.href = 'admin/dashboard.html';
        } else {
            // Se chegou aqui, não tem Claim e não achou no banco
            throw new Error("Usuário sem loja vinculada. Contate o suporte.");
        }

    } catch (error) {
        console.error("Erro fatal no login:", error);
        let displayMsg = error.message;
        
        // Mensagem amigável para o erro de permissão cru
        if (displayMsg.includes("Missing or insufficient permissions")) {
            displayMsg = "Erro de Permissão: Sua conta não está vinculada a nenhuma loja.";
        }

        alert(displayMsg);
        auth.signOut(); // Desloga para não ficar num estado "zumbi"
    } finally {
        hideLoader();
    }
}

// --- MONITORAMENTO DE ESTADO ---
auth.onAuthStateChanged(async (user) => {
    const path = window.location.pathname;
    const isRootPage = path.endsWith('index.html') || path.endsWith('/') || path.includes('menu.html');

    // Não faz nada se for a página do cardápio do cliente
    if (path.includes('menu.html')) return;

    if (user) {
        if(userEmailSpan) userEmailSpan.textContent = user.email;

        // Se o usuário está logado mas perdemos a sessão (F5), recupera os dados
        if (!sessionStorage.getItem('SAAS_LOJA_ID')) {
            // Mostra loader se não estiver na tela de login (evita piscar)
            if(!isRootPage) showLoader();
            await processarLoginUsuario(user);
        }

        // Se estiver na tela de login e já estiver autenticado, redireciona
        if (path.endsWith('index.html') || path === '/') {
            const role = sessionStorage.getItem('USER_ROLE');
            // Só redireciona se já tivermos a role definida
            if(role) {
                window.location.href = role === 'atendente' ? 'admin/pedidos.html' : 'admin/dashboard.html';
            }
        }
    } else {
        // Se não tiver usuário e estiver tentando acessar /admin/, chuta para o login
        if (!isRootPage && path.includes('/admin/')) {
            window.location.href = '../index.html';
        }
    }
});

// --- UI HELPERS ---

function applyAttendantRestrictions() {
    const ALLOWED = ['pedidos.html', 'historico.html', 'clientes.html', 'motoboys.html'];
    const navItems = document.querySelectorAll('.sidebar-nav > ul > li'); 

    navItems.forEach(li => {
        const link = li.querySelector('a');
        if (!link) return;
        
        const href = link.getAttribute('href');
        const text = link.innerText.trim();

        if (text.includes('Dashboard')) {
            li.style.display = 'none';
            return;
        }

        if (link.classList.contains('has-submenu')) {
            const subLinks = li.querySelectorAll('.sidebar-submenu a');
            let hasPermission = false;
            subLinks.forEach(sub => {
                if (ALLOWED.includes(sub.getAttribute('href'))) hasPermission = true;
            });
            if (!hasPermission) li.style.display = 'none';
        } 
        else if (href && !href.includes('#') && !ALLOWED.includes(href)) {
            li.style.display = 'none';
        }
    });

    ['store-status-toggle', 'btn-archive-orders', 'add-user-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        showLoader();
        sessionStorage.clear();
        auth.signOut().then(() => window.location.href = '../index.html');
    });
}

// Lógica de "Esqueci a Senha"
const forgotBtn = document.getElementById('btn-forgot-password');
const forgotForm = document.getElementById('forgot-password-form');
if (forgotBtn) forgotBtn.addEventListener('click', (e) => { e.preventDefault(); openModal('forgot-password-modal'); });
if (forgotForm) forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    showLoader();
    auth.sendPasswordResetEmail(document.getElementById('recovery-email').value)
        .then(() => { alert("Link enviado! Verifique seu e-mail."); closeModal('forgot-password-modal'); })
        .catch(e => alert("Erro: " + e.message))
        .finally(() => hideLoader());
});
const forgotModalEl = document.getElementById('forgot-password-modal');
if(forgotModalEl) forgotModalEl.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(b => b.addEventListener('click', () => closeModal('forgot-password-modal')));

async function atualizarNomeDaLojaSidebar(lojaIdForce = null) {
    const sidebarTitle = document.querySelector('.sidebar-header h3');
    if (!sidebarTitle) return;
    
    // Tenta pegar do cache primeiro
    const nomeSalvo = sessionStorage.getItem('SAAS_NOME_LOJA');
    if (nomeSalvo && !lojaIdForce) { sidebarTitle.textContent = nomeSalvo; return; }
    
    const id = lojaIdForce || sessionStorage.getItem('SAAS_LOJA_ID');
    if (!id) return;

    try {
        // Tenta ler configuração. Se falhar por permissão, ignora silenciosamente.
        const doc = await db.collection('configuracoes').doc(id).get();
        if (doc.exists) {
            const nome = doc.data().nome || 'Painel Admin';
            sidebarTitle.textContent = nome;
            sessionStorage.setItem('SAAS_NOME_LOJA', nome);
        }
    } catch (e) {
        // Ignora erros aqui para não travar a UI (ex: permissão de leitura em config)
        console.log("Info: Não foi possível carregar nome da loja (Permissão ou Internet).");
    }
}