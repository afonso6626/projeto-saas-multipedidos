import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS: PEGAR ID DA LOJA ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');

    if (!LOJA_ATUAL) {
        console.error("Sessão inválida. Redirecionando...");
        return;
    }

    // Verifica se estamos na página de cardápio antes de executar qualquer código
    const categoriesTableBody = document.getElementById('categories-table-body');
    if (!categoriesTableBody) {
        return;
    }

    // --- SELETORES DE ELEMENTOS ---
    const addCategoryBtn = document.getElementById('add-category-btn');
    const categoryForm = document.getElementById('category-form');
    const categoryNameInput = document.getElementById('category-name');
    const categoryIdInput = document.getElementById('category-id');
    const modalTitle = document.getElementById('modal-title');
    const modalId = 'category-modal';

    // --- FUNÇÕES ---

    /**
     * Busca todas as categorias do Firestore e as renderiza na tabela.
     */
    const fetchCategories = async () => {
        showLoader();
        categoriesTableBody.innerHTML = '<tr><td colspan="2">Carregando...</td></tr>';
        
        try {
            // CORREÇÃO: Filtra pela LOJA_ATUAL antes de ordenar
            const snapshot = await db.collection('categorias')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM SAAS
                .orderBy('ordem')
                .get();

            if (snapshot.empty) {
                categoriesTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Nenhuma categoria encontrada. Adicione a primeira!</td></tr>';
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const category = doc.data();
                html += `
                    <tr data-id="${doc.id}" style="cursor: grab;">
                        <td class="category-name-cell">${category.nome}</td>
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
            console.error("Erro ao buscar categorias: ", error);
            
            // Tratamento específico para falta de índice (Comum ao usar where + orderBy)
            if(error.code === 'failed-precondition') {
                alert("Necessário criar índice no Firebase. Abra o console (F12) e clique no link fornecido pelo erro.");
            }
            
            categoriesTableBody.innerHTML = '<tr><td colspan="2">Erro de permissão ou índice. Veja o console.</td></tr>';
        } finally {
            hideLoader();
        }
    };

    /**
     * Salva ou atualiza uma categoria no Firestore.
     */
    const saveCategory = async (name, id) => {
        showLoader();
        
        // CORREÇÃO: Inclui o lojaId nos dados
        const data = {
            nome: name,
            lojaId: LOJA_ATUAL // <--- VINCULA À LOJA
        };

        try {
            if (id) {
                // Atualização (update)
                await db.collection('categorias').doc(id).update(data);
            } else {
                // Criação (add)
                // CORREÇÃO: Busca a última ordem APENAS desta loja
                const lastCategorySnapshot = await db.collection('categorias')
                    .where('lojaId', '==', LOJA_ATUAL) // <--- FILTRO
                    .orderBy('ordem', 'desc')
                    .limit(1)
                    .get();
                
                const newOrder = lastCategorySnapshot.empty ? 0 : lastCategorySnapshot.docs[0].data().ordem + 1;
                
                data.ordem = newOrder;
                data.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
                
                await db.collection('categorias').add(data);
            }

            console.log(`Categoria ${id ? 'atualizada' : 'adicionada'} com sucesso!`);
            categoryForm.reset();
            categoryIdInput.value = '';
            closeModal(modalId);
            fetchCategories(); // Atualiza a tabela
        } catch (error) {
            console.error("Erro ao salvar categoria: ", error);
            alert("Não foi possível salvar a categoria.");
        } finally {
            hideLoader();
        }
    };
    
    /**
     * Exclui uma categoria do Firestore.
     */
    const deleteCategory = (id) => {
        if (!confirm("Tem certeza que deseja excluir esta categoria?")) {
            return;
        }
        
        showLoader();
        db.collection('categorias').doc(id).delete()
        .then(() => {
            fetchCategories();
        })
        .catch(error => {
            console.error("Erro ao excluir: ", error);
            alert("Não foi possível excluir.");
        })
        .finally(() => {
            hideLoader();
        });
    };

    /**
     * Inicializa o SortableJS e salva a nova ordem das categorias
     */
    const initSortableCategories = () => {
        if(typeof Sortable === 'undefined') return;

        new Sortable(categoriesTableBody, {
            animation: 150,
            handle: 'tr', // Permite arrastar clicando em qualquer lugar da linha (ou especifique um ícone)
            onEnd: async (evt) => { 
                showLoader();
                const items = evt.from.children; 
                const batch = db.batch(); 

                for (let i = 0; i < items.length; i++) {
                    const docId = items[i].dataset.id;
                    const docRef = db.collection('categorias').doc(docId);
                    // Atualiza a ordem
                    batch.update(docRef, { ordem: i });
                }
                
                try {
                    await batch.commit(); 
                } catch (error) {
                    console.error("Erro ao reordenar:", error);
                } finally {
                    hideLoader();
                }
            }
        });
    };

    // --- EVENT LISTENERS ---

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

    // Listener para fechar modal (X e Cancelar)
    const modalElement = document.getElementById(modalId);
    if(modalElement) {
        modalElement.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal(modalId));
        });
    }

    // Inicia
    fetchCategories();
});