import { db } from './firebase-config.js';
import { showLoader, hideLoader } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) return;
    // ----------------------

    if (!document.getElementById('fidelidade-regras-form')) return;

    // SELETORES
    const regrasForm = document.getElementById('fidelidade-regras-form');
    const reaisInput = document.getElementById('reais-por-ponto');
    const pontosInput = document.getElementById('pontos-por-real');
    
    const addPremioForm = document.getElementById('add-premio-form');
    const premioNomeInput = document.getElementById('premio-nome');
    const premioPontosInput = document.getElementById('premio-pontos');
    const premiosTableBody = document.getElementById('premios-table-body');

    // --- 1. CARREGAR REGRAS (DO DOC DA LOJA) ---
    const loadRegras = async () => {
        try {
            const doc = await db.collection('configuracoes').doc(LOJA_ATUAL).get();
            if (doc.exists) {
                const data = doc.data();
                // Procura o objeto fidelidade dentro das configurações da loja
                if (data.fidelidade) {
                    reaisInput.value = data.fidelidade.reaisPorPonto || 1;
                    pontosInput.value = data.fidelidade.pontosPorReal || 1;
                }
            }
        } catch (error) {
            console.error("Erro ao carregar regras:", error);
        }
    };
    
    // --- 2. BUSCAR PRÊMIOS (DA LOJA ATUAL) ---
    const fetchPremios = async () => {
        showLoader();
        premiosTableBody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
        try {
            // FILTRO SAAS
            const snapshot = await db.collection('premiosFidelidade')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .orderBy('pontos')
                .get();
            
            premiosTableBody.innerHTML = '';
            if (snapshot.empty) {
                premiosTableBody.innerHTML = '<tr><td colspan="3">Nenhum prêmio cadastrado.</td></tr>';
                return;
            }
            
            snapshot.forEach(doc => {
                const premio = doc.data();
                premiosTableBody.innerHTML += `
                    <tr>
                        <td>${premio.nome}</td>
                        <td>${premio.pontos}</td>
                        <td><button class="btn-action btn-delete" data-id="${doc.id}" style="color:red;">Excluir</button></td>
                    </tr>
                `;
            });
        } catch(e){ 
            console.error("Erro prêmios:", e);
            if(e.code === 'failed-precondition') alert("Falta índice no Firebase. Veja o console.");
            premiosTableBody.innerHTML = '<tr><td colspan="3">Erro ao carregar.</td></tr>';
        } finally { 
            hideLoader(); 
        }
    };

    // --- 3. SALVAR REGRAS ---
    regrasForm.addEventListener('submit', async e => {
        e.preventDefault();
        showLoader();
        try {
            const regras = {
                reaisPorPonto: parseFloat(reaisInput.value),
                pontosPorReal: parseInt(pontosInput.value)
            };

            // Salva dentro do documento principal da loja
            await db.collection('configuracoes').doc(LOJA_ATUAL).set({
                fidelidade: regras
            }, { merge: true }); // merge: true para não apagar nome, endereço, etc.

            alert("Regras salvas!");
        } catch (error) { 
            console.error("Erro salvar regras:", error);
            alert("Erro ao salvar.");
        } finally { 
            hideLoader(); 
        }
    });
    
    // --- 4. ADICIONAR PRÊMIO ---
    addPremioForm.addEventListener('submit', async e => {
        e.preventDefault();
        const nome = premioNomeInput.value;
        const pontos = parseInt(premioPontosInput.value);
        if (!nome || !pontos) return;

        showLoader();
        try {
            await db.collection('premiosFidelidade').add({
                lojaId: LOJA_ATUAL, // <--- VINCULA À LOJA
                nome: nome,
                pontos: pontos
            });
            addPremioForm.reset();
            fetchPremios();
        } catch(e){ 
            console.error("Erro adicionar prêmio:", e);
        } finally { 
            hideLoader(); 
        }
    });

    // --- 5. EXCLUIR PRÊMIO ---
    premiosTableBody.addEventListener('click', async e => {
        if (e.target.classList.contains('btn-delete')) {
            const id = e.target.dataset.id;
            if (!confirm("Excluir este prêmio?")) return;
            
            showLoader();
            try {
                await db.collection('premiosFidelidade').doc(id).delete();
                fetchPremios();
            } catch(e){ console.error(e); } finally { hideLoader(); }
        }
    });

    // INÍCIO
    loadRegras();
    fetchPremios();
});