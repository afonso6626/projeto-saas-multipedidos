import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) {
        console.error("Sessão inválida. Redirecionando...");
        return;
    }
    // ------------------------

    const productsTableBody = document.getElementById('products-table-body');
    if (!productsTableBody) return;

    // --- VARIAVEIS E SELETORES ---
    let allProducts = [];
    let categoriesMap = new Map();
    
    const searchInput = document.getElementById('search-produtos');
    const addProductBtn = document.getElementById('add-product-btn');
    const productModal = document.getElementById('product-modal');
    const productForm = document.getElementById('product-form');
    const modalTitle = productModal.querySelector('#modal-title');
    
    // Inputs
    const productIdInput = document.getElementById('product-id');
    const productNameInput = document.getElementById('product-name');
    const productCategorySelect = document.getElementById('product-category');
    const productDescriptionInput = document.getElementById('product-description');
    
    const gruposChecklistContainer = document.getElementById('grupos-opcionais-checklist');
    const variationsContainer = document.getElementById('variations-container');
    const addVariationBtn = document.getElementById('add-variation-btn');

    // --- 2. FUNÇÕES AUXILIARES (VARIAÇÕES) ---
    const addVariationRow = (variation = { tamanho: '', preco: '', estoque: '' }) => {
        const div = document.createElement('div');
        div.className = 'variation-row';
        // Layout de grid para os inputs
        div.style.display = 'grid';
        div.style.gridTemplateColumns = '1fr 1fr 1fr auto';
        div.style.gap = '10px';
        div.style.marginBottom = '10px';

        div.innerHTML = `
            <input type="text" class="variation-tamanho form-control" placeholder="Tamanho (Ex: Padrão)" value="${variation.tamanho || ''}" required>
            <input type="number" class="variation-preco form-control" step="0.01" placeholder="Preço (R$)" value="${variation.preco || ''}" required>
            <input type="number" class="variation-estoque form-control" step="1" placeholder="Estoque (opcional)" value="${variation.estoque !== undefined && variation.estoque !== null ? variation.estoque : ''}">
            <button type="button" class="btn btn-danger btn-sm btn-remove-variation" style="height:42px;">&times;</button>
        `;
        variationsContainer.appendChild(div);
    };

    // --- 3. CARREGAR DADOS AUXILIARES (CATEGORIAS E GRUPOS) ---
    
    // === CORREÇÃO AQUI: Carregamento seguro das categorias ===
    const fetchCategoriesForSelect = async () => {
        try {
            // Removemos o orderBy do banco para garantir que carregue mesmo sem índice
            const snapshot = await db.collection('categorias')
                .where('lojaId', '==', LOJA_ATUAL)
                .get();
            
            productCategorySelect.innerHTML = '<option value="">Selecione uma categoria</option>';
            categoriesMap.clear(); // Limpa o mapa antigo

            if (snapshot.empty) {
                console.warn("Nenhuma categoria encontrada para esta loja.");
            }

            // Converte para array para ordenar no Javascript (mais seguro)
            let cats = [];
            snapshot.forEach(doc => {
                cats.push({ id: doc.id, ...doc.data() });
            });

            // Ordena por ordem (se existir)
            cats.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

            // Preenche o mapa e o select
            cats.forEach(cat => {
                categoriesMap.set(cat.id, cat.nome);
                
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.nome;
                productCategorySelect.appendChild(option);
            });
            console.log("Categorias carregadas com sucesso.");

        } catch (error) {
            console.error("Erro categorias:", error);
        }
    };
    
    const renderOptionalGroups = async (productGroupsIds = []) => {
        gruposChecklistContainer.innerHTML = 'Carregando...';
        try {
            // SAAS: Busca apenas grupos desta loja
            const snapshot = await db.collection('gruposOpcionais')
                .where('lojaId', '==', LOJA_ATUAL)
                .orderBy('nome')
                .get();
            
            let html = '';
            if (snapshot.empty) {
                html = '<small style="color:#777">Nenhum grupo de opcionais criado.</small>';
            } else {
                snapshot.forEach(doc => {
                    const isChecked = productGroupsIds.includes(doc.id) ? 'checked' : '';
                    html += `
                    <label class="checkbox-label" style="display:block; margin-bottom:5px;">
                        <input type="checkbox" value="${doc.id}" ${isChecked}> ${doc.data().nome}
                    </label>`;
                });
            }
            gruposChecklistContainer.innerHTML = html;
        } catch (error) {
            console.error("Erro grupos:", error);
            gruposChecklistContainer.innerHTML = "Erro ao carregar grupos.";
        }
    };

    // --- 4. CARREGAR PRODUTOS (SAAS) ---
    const fetchProducts = async () => {
        showLoader();
        productsTableBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
        try {
            // SAAS: Busca blindada
            // Tenta carregar sem ordenação no banco para evitar erro de índice
            const productsSnapshot = await db.collection('produtos')
                .where('lojaId', '==', LOJA_ATUAL)
                .get();
            
            allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, product: doc.data() }));
            
            // Ordena no Javascript
            allProducts.sort((a, b) => (a.product.ordem || 0) - (b.product.ordem || 0));

            renderProducts(allProducts);
        } catch (error) { 
            console.error("Erro produtos:", error);
            productsTableBody.innerHTML = '<tr><td colspan="5">Erro ao carregar.</td></tr>';
        } finally { hideLoader(); }
    };

    const renderProducts = (productsToRender) => {
        productsTableBody.innerHTML = '';
        if (productsToRender.length === 0) {
            productsTableBody.innerHTML = '<tr><td colspan="5">Nenhum produto encontrado.</td></tr>';
            return;
        }
        
        let html = '';
        productsToRender.forEach(item => {
            const { id, product } = item;
            // Mostra o preço da primeira variação como referência
            const precoBase = (product.variacoes && product.variacoes.length > 0) 
                ? `R$ ${parseFloat(product.variacoes[0].preco).toFixed(2).replace('.', ',')}` 
                : 'R$ 0,00';
            
            const isChecked = product.disponivel !== false;
            const categoryName = categoriesMap.get(product.categoriaId) || 'Sem Categoria';
            
            html += `
            <tr data-id="${id}" style="cursor: grab;">
                <td><span style="font-weight:600">${product.nome}</span></td>
                <td>${categoryName}</td>
                <td>${precoBase}</td>
                <td>
                    <label class="switch">
                        <input type="checkbox" class="toggle-disponivel" data-id="${id}" ${isChecked ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </td>
                <td>
                    <button class="btn-action btn-edit" data-id="${id}">Editar</button>
                    <button class="btn-action btn-delete" data-id="${id}">Excluir</button>
                </td>
            </tr>`;
        });
        
        productsTableBody.innerHTML = html;
        initSortableProducts(); // Ativa o arrastar e soltar
    };

    // --- 5. SALVAR PRODUTO (SAAS) ---
    const saveProduct = async (data, id) => {
        // Processa as variações do formulário
        data.variacoes = Array.from(variationsContainer.querySelectorAll('.variation-row')).map(row => {
            const estoqueInput = row.querySelector('.variation-estoque').value;
            return {
                tamanho: row.querySelector('.variation-tamanho').value,
                preco: parseFloat(row.querySelector('.variation-preco').value),
                estoque: estoqueInput === '' ? null : parseInt(estoqueInput, 10)
            };
        }).filter(v => v.tamanho && !isNaN(v.preco));

        if (data.variacoes.length === 0) { 
            alert("Adicione pelo menos uma variação válida (Tamanho e Preço)."); 
            return; 
        }
        
        // Pega os grupos de opcionais marcados
        data.gruposOpcionaisIds = Array.from(gruposChecklistContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        
        // *** VÍNCULO SAAS OBRIGATÓRIO ***
        data.lojaId = LOJA_ATUAL;

        showLoader();
        try {
            if (id) {
                // Edição
                await db.collection('produtos').doc(id).update(data);
            } else {
                // Criação: Calcula ordem
                const q = db.collection('produtos')
                    .where('lojaId', '==', LOJA_ATUAL)
                    .where('categoriaId', '==', data.categoriaId)
                    .orderBy('ordem', 'desc')
                    .limit(1);
                
                let newOrder = 0;
                try {
                    const lastProductSnapshot = await q.get();
                    newOrder = lastProductSnapshot.empty ? 0 : lastProductSnapshot.docs[0].data().ordem + 1;
                } catch(e) {
                    console.warn("Sem índice de ordem, usando 0");
                }
                
                data.ordem = newOrder;
                data.disponivel = true;
                
                await db.collection('produtos').add(data);
            }
            closeModal('product-modal');
            fetchProducts();
        } catch(error) { 
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar produto."); 
        } finally { hideLoader(); }
    };
    
    // --- 6. AÇÕES (DELETAR, TOGGLE, ORDENAR) ---
    
    const deleteProduct = async (id) => {
        if (!confirm("Tem certeza?")) return;
        showLoader();
        try {
            await db.collection('produtos').doc(id).delete();
            fetchProducts();
        } catch(error) { console.error(error); hideLoader(); }
    };

    const toggleDisponibilidade = async (id, currentState) => {
        // Não bloqueia a tela, faz silenciosamente
        try {
            await db.collection('produtos').doc(id).update({ disponivel: !currentState });
            // Atualiza lista local para refletir sem recarregar
            const productIndex = allProducts.findIndex(p => p.id === id);
            if (productIndex !== -1) allProducts[productIndex].product.disponivel = !currentState;
        } catch(error) { console.error(error); }
    };

    const initSortableProducts = () => {
        if(typeof Sortable === 'undefined') return;
        
        new Sortable(productsTableBody, {
            animation: 150,
            handle: 'tr',
            onEnd: async (evt) => {
                showLoader();
                const items = evt.from.children;
                const batch = db.batch();
                
                for (let i = 0; i < items.length; i++) {
                    const docId = items[i].dataset.id;
                    const docRef = db.collection('produtos').doc(docId);
                    batch.update(docRef, { ordem: i });
                }
                
                try {
                    await batch.commit();
                } catch (error) { console.error("Erro ordenação:", error); } 
                finally { hideLoader(); }
            }
        });
    };

    // --- 7. LISTENERS ---

    addProductBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Novo Produto';
        productForm.reset();
        productIdInput.value = '';
        variationsContainer.innerHTML = '';
        addVariationRow(); // Adiciona uma linha vazia por padrão
        renderOptionalGroups(); // Carrega grupos desmarcados
        openModal('product-modal');
    });

    addVariationBtn.addEventListener('click', () => addVariationRow());
    
    variationsContainer.addEventListener('click', e => {
        if (e.target.classList.contains('btn-remove-variation')) {
            if (variationsContainer.querySelectorAll('.variation-row').length > 1) {
                e.target.closest('.variation-row').remove();
            } else { 
                alert("O produto precisa de pelo menos uma opção de preço."); 
            }
        }
    });
    
    productForm.addEventListener('submit', e => {
        e.preventDefault();
        saveProduct({
            nome: productNameInput.value,
            categoriaId: productCategorySelect.value,
            descricao: productDescriptionInput.value,
        }, productIdInput.value);
    });

    productsTableBody.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        if (!id) return;

        if (e.target.classList.contains('btn-edit')) {
            showLoader();
            const doc = await db.collection('produtos').doc(id).get();
            const product = doc.data();
            
            modalTitle.textContent = 'Editar Produto';
            productIdInput.value = doc.id;
            productNameInput.value = product.nome;
            productCategorySelect.value = product.categoriaId;
            productDescriptionInput.value = product.descricao;
            
            variationsContainer.innerHTML = '';
            (product.variacoes || [{tamanho: 'Padrão', preco: ''}]).forEach(v => addVariationRow(v));
            
            await renderOptionalGroups(product.gruposOpcionaisIds || []);
            
            hideLoader();
            openModal('product-modal');
        } 
        else if (e.target.classList.contains('btn-delete')) {
            deleteProduct(id);
        }
    });

    productsTableBody.addEventListener('change', e => {
        if (e.target.classList.contains('toggle-disponivel')) {
            toggleDisponibilidade(e.target.dataset.id, !e.target.checked);
        }
    });

    // Filtro de Busca Local
    const filterProducts = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = allProducts.filter(item => 
            item.product.nome.toLowerCase().includes(searchTerm)
        );
        renderProducts(filtered);
    };
    searchInput.addEventListener('input', filterProducts);

    // Fechamento de Modal
    const modalEl = document.getElementById('product-modal');
    if(modalEl) {
        modalEl.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('product-modal'));
        });
    }
    
    // --- INICIALIZAÇÃO SEQUENCIAL ---
    // Garante que as categorias carregam antes dos produtos
    (async function init() {
        showLoader();
        await fetchCategoriesForSelect(); 
        await fetchProducts();
        hideLoader();
    })();
});