import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) {
        console.error("Sessão inválida.");
        return;
    }
    // ------------------------

    const tableBody = document.getElementById('motoboys-table-body');
    if (!tableBody) return;

    // --- SELETORES ---
    const addBtn = document.getElementById('add-motoboy-btn');
    const modal = document.getElementById('motoboy-modal');
    const form = document.getElementById('motoboy-form');
    const modalTitle = document.getElementById('modal-title');
    const idInput = document.getElementById('motoboy-id');
    const nameInput = document.getElementById('motoboy-name');
    const phoneInput = document.getElementById('motoboy-phone');

    // --- 2. BUSCAR MOTOBOYS (DA LOJA ATUAL) ---
    const fetchMotoboys = async () => {
        showLoader();
        tableBody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
        try {
            // FILTRO SAAS
            const snapshot = await db.collection('entregadores')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .orderBy('nome')
                .get();
            
            tableBody.innerHTML = '';
            
            if (snapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="3">Nenhum motoboy cadastrado.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const motoboy = doc.data();
                tableBody.innerHTML += `
                    <tr>
                        <td>${motoboy.nome}</td>
                        <td>${motoboy.telefone || 'Não informado'}</td>
                        <td>
                            <button class="btn-action btn-edit" data-id="${doc.id}">Editar</button>
                            <button class="btn-action btn-delete" data-id="${doc.id}">Excluir</button>
                        </td>
                    </tr>
                `;
            });
        } catch (error) { 
            console.error("Erro motoboys:", error);
            if(error.code === 'failed-precondition') alert("Falta criar índice no Firebase (Entregadores). Veja o Console.");
            tableBody.innerHTML = '<tr><td colspan="3">Erro ao carregar.</td></tr>';
        } finally { 
            hideLoader(); 
        }
    };

    // --- 3. SALVAR MOTOBOY (VINCULADO À LOJA) ---
    const saveMotoboy = async (data, id) => {
        showLoader();
        
        // VINCULA À LOJA
        data.lojaId = LOJA_ATUAL;

        try {
            if (id) await db.collection('entregadores').doc(id).update(data);
            else await db.collection('entregadores').add(data);
            
            closeModal('motoboy-modal');
            fetchMotoboys();
        } catch (error) { 
            console.error(error); 
            alert("Erro ao salvar motoboy.");
        } finally { 
            hideLoader(); 
        }
    };

    // --- 4. EXCLUIR ---
    const deleteMotoboy = async (id) => {
        if (!confirm("Tem certeza que deseja excluir este motoboy?")) return;
        showLoader();
        try {
            await db.collection('entregadores').doc(id).delete();
            fetchMotoboys();
        } catch (error) { console.error(error); } 
        finally { hideLoader(); }
    };

    // --- LISTENERS ---

    addBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Novo Motoboy';
        form.reset();
        idInput.value = '';
        openModal('motoboy-modal');
    });

    form.addEventListener('submit', e => {
        e.preventDefault();
        saveMotoboy({
            nome: nameInput.value,
            telefone: phoneInput.value
        }, idInput.value);
    });

    tableBody.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        if (e.target.classList.contains('btn-edit')) {
            showLoader();
            const doc = await db.collection('entregadores').doc(id).get();
            const motoboy = doc.data();
            modalTitle.textContent = 'Editar Motoboy';
            idInput.value = id;
            nameInput.value = motoboy.nome;
            phoneInput.value = motoboy.telefone;
            hideLoader();
            openModal('motoboy-modal');
        } else if (e.target.classList.contains('btn-delete')) {
            deleteMotoboy(id);
        }
    });
    
    // Fechar Modal
    const modalEl = document.getElementById('motoboy-modal');
    if(modalEl) {
        modalEl.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('motoboy-modal'));
        });
    }
    
    // Inicia
    fetchMotoboys();
});