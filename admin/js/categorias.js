import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS: PEGAR ID DA LOJA ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');

    if (!LOJA_ATUAL) {
        console.error("Sessão inválida. Redirecionando...");
        return;
    }

    const categoriesTableBody = document.getElementById('categories-table-body');
    if (!categoriesTableBody) return;

    // --- SELETORES ---
    const addCategoryBtn = document.getElementById('add-category-btn');
    const categoryForm = document.getElementById('category-form');
    const categoryNameInput = document.getElementById('category-name');
    const categoryIdInput = document.getElementById('category-id');
    const modalTitle = document.getElementById('modal-title');
    const modalId = 'category-modal';

    // --- 2. BUSCAR CATEGORIAS (FILTRADO POR LOJA) ---
    const fetchCategories = async () => {
        showLoader();
        categoriesTableBody.innerHTML = '<tr><td colspan="2">Carregando...</td></tr>';
        
        try {
            // Busca apenas categorias desta loja
            const snapshot = await db.collection('categorias')
                .where('lojaId', '==', LOJA_ATUAL) // <--- FILTRO
                .orderBy('ordem')
                .get();

            if (snapshot.empty) {
                categoriesTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px;">Nenhuma categoria encontrada.</td></tr>';
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const category = doc.data();
                html += `
                    <tr data-id="${doc.id}" style="cursor: grab;">
                        <td class="category-name-cell" style="font-weight:500;">${category.nome}</td>
                        <td>
                            <button class="btn-action btn-edit" data-id="${doc.id}">Editar</button>
                            <button class="btn-action btn-delete" data-id="${doc.id}">Excluir</button>
                        </td>
                    </tr>
                `;
            });
            categoriesTableBody.innerHTML = html;
            
            initSortableCategories();

        } catch (error) {
            console.error("Erro categorias:", error);
            if(error.code === 'failed-precondition') {
                // Se der erro de índice, tenta carregar sem ordem para não travar
                try {
                    const snapBackup = await db.collection('categorias').where('lojaId', '==', LOJA_ATUAL).get();
                    let html = '';
                    snapBackup.forEach(doc => {
                        const category = doc.data();
                        html += `<tr data-id="${doc.id}"><td class="category-name-cell">${category.nome}</td><td>...</td></tr>`;
                    });
                    categoriesTableBody.innerHTML = html || '<tr><td>Sem categorias</td></tr>';
                } catch(e) {}
            } else {
                categoriesTableBody.innerHTML = '<tr><td colspan="2">Erro ao carregar.</td></tr>';
            }
        } finally {
            hideLoader();
        }
    };

    // --- 3. SALVAR (CRIAR OU EDITAR) ---
    const saveCategory = async (name, id) => {
        showLoader();
        
        // Dados básicos
        const data = {
            nome: name,
            lojaId: LOJA_ATUAL // <--- O PULO DO GATO: VINCULA À LOJA
        };

        try {
            if (id) {
                await db.collection('categorias').doc(id).update(data);
            } else {
                // Descobre a última ordem
                const lastSnapshot = await db.collection('categorias')
                    .where('lojaId', '==', LOJA_ATUAL)
                    .orderBy('ordem', 'desc')
                    .limit(1)
                    .get();
                
                const newOrder = lastSnapshot.empty ? 0 : lastSnapshot.docs[0].data().ordem + 1;
                
                data.ordem = newOrder;
                data.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
                
                await db.collection('categorias').add(data);
            }

            categoryForm.reset();
            categoryIdInput.value = '';
            closeModal(modalId);
            
            fetchCategories();

        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Não foi possível salvar.");
        } finally {
            hideLoader();
        }
    };
    
    // ... Restante do código (delete, sortable, listeners) permanece igual ...
    // Vou colocar aqui para garantir que funcione 100%
    
    const deleteCategory = (id) => {
        if (!confirm("Tem certeza?")) return;
        showLoader();
        db.collection('categorias').doc(id).delete()
        .then(() => fetchCategories())
        .finally(() => hideLoader());
    };

    const initSortableCategories = () => {
        if(typeof Sortable === 'undefined') return;
        new Sortable(categoriesTableBody, {
            animation: 150,
            handle: 'tr', 
            onEnd: async (evt) => {
                const items = evt.from.children;
                const batch = db.batch();
                for (let i = 0; i < items.length; i++) {
                    const docId = items[i].dataset.id;
                    const docRef = db.collection('categorias').doc(docId);
                    batch.update(docRef, { ordem: i });
                }
                try { await batch.commit(); } catch (error) { console.error(error); }
            }
        });
    };

    addCategoryBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Nova Categoria';
        categoryForm.reset();
        categoryIdInput.value = '';
        openModal(modalId);
    });

    categoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const categoryName = categoryNameInput.value.trim();
        const categoryId = categoryIdInput.value;
        if (categoryName) {
            saveCategory(categoryName, categoryId);
        }
    });
    
    categoriesTableBody.addEventListener('click', (e) => {
        const target = e.target;
        const id = target.dataset.id;
        if (id && target.classList.contains('btn-edit')) {
            const row = target.closest('tr');
            const name = row.querySelector('.category-name-cell').textContent;
            modalTitle.textContent = 'Editar Categoria';
            categoryNameInput.value = name;
            categoryIdInput.value = id;
            openModal(modalId);
        }
        if (id && target.classList.contains('btn-delete')) {
            deleteCategory(id);
        }
    });

    const modalEl = document.getElementById(modalId);
    if(modalEl) {
        modalEl.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal(modalId));
        });
    }

    fetchCategories();
});