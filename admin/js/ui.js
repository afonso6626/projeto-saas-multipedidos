// ============================================================
// UI.JS - Interface, Menus e Modais
// ============================================================

// --- CONTROLE DE LOADER ---
export function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
}

export function hideLoader() {
    const loader = document.getElementById('loader');
    if(loader) loader.classList.add('hidden');
}

// --- CONTROLE DE MODAIS ---
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        const firstInput = modal.querySelector('input, select');
        if(firstInput) firstInput.focus();
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) modal.classList.add('hidden');
}

// ============================================================
// INICIALIZAÇÃO GLOBAL
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. TEMA (CLARO/ESCURO)
    const savedTheme = localStorage.getItem('theme') || 'light';
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            if(themeIcon) themeIcon.textContent = '☀️';
        } else {
            document.body.classList.remove('dark-mode');
            if(themeIcon) themeIcon.textContent = '🌙';
        }
        localStorage.setItem('theme', theme);
    };
    applyTheme(savedTheme);

    if(themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
            applyTheme(newTheme);
        });
    }

    // 2. FECHAR MODAIS AO CLICAR FORA
    document.querySelectorAll('.modal-container, .modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });

    // 3. LÓGICA DO MENU LATERAL (DROPDOWN)
    const dropdownToggles = document.querySelectorAll('.has-submenu');

    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const parentLi = toggle.parentElement;
            parentLi.classList.toggle('open');
        });
    });

    // 4. AUTO-EXPANDIR MENU ATIVO (A Mágica Acontece Aqui)
    // Verifica qual página estamos e abre o menu correspondente
    const currentPath = window.location.pathname;
    
    const allSubmenuLinks = document.querySelectorAll('.sidebar-submenu a');
    
    allSubmenuLinks.forEach(link => {
        const href = link.getAttribute('href');
        // Se a URL atual contém o link do menu (ex: "produtos.html")
        if (href && currentPath.includes(href)) {
            // 1. Marca o link como ativo (azulzinho)
            link.classList.add('active'); 
            
            // 2. Abre o pai dele (o Dropdown)
            const parentSubmenu = link.closest('.sidebar-submenu');
            if (parentSubmenu && parentSubmenu.parentElement) {
                parentSubmenu.parentElement.classList.add('open');
            }
        }
    });
});