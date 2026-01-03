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

    const promotionsTableBody = document.getElementById('promotions-table-body');
    if (!promotionsTableBody) return;

    // --- SELETORES ---
    const addPromotionBtn = document.getElementById('add-promotion-btn');
    const promotionModal = document.getElementById('promotion-modal');
    const promotionForm = document.getElementById('promotion-form');
    const modalTitle = document.getElementById('promotion-modal-title');
    
    const promotionIdInput = document.getElementById('promotion-id');
    const promotionNameInput = document.getElementById('promotion-name');
    const mainProductSelect = document.getElementById('promotion-main-product');
    const secondaryProductSelect = document.getElementById('promotion-secondary-product');
    const discountTypeSelect = document.getElementById('promotion-discount-type');
    const discountValueInput = document.getElementById('promotion-discount-value');
    const daysCheckboxes = document.querySelectorAll('#promotion-days input[type="checkbox"]');
    const activeSelect = document.getElementById('promotion-active');

    let allProducts = [];

    // --- 2. CARREGAR PRODUTOS (DA MINHA LOJA) PARA O SELECT ---
    const fetchProductsForSelect = async () => {
        try {
            // FILTRO SAAS: Só traz produtos desta loja
            const snapshot = await db.collection('produtos')
                .where('lojaId', '==', LOJA_ATUAL)
                .orderBy('nome')
                .get();
            
            allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            let optionsHtml = '<option value="">-- Selecione um produto --</option>';
            allProducts.forEach(prod => {
                // Mostra o nome e a variação (se tiver) para facilitar
                const variacao = prod.variacoes && prod.variacoes[0] ? ` (${prod.variacoes[0].preco})` : '';
                optionsHtml += `<option value="${prod.id}">${prod.nome}${variacao}</option>`;
            });

            // Preenche os dois selects (Compre X, Ganhe Y)
            mainProductSelect.innerHTML = optionsHtml;
            secondaryProductSelect.innerHTML = optionsHtml;

        } catch (error) {
            console.error("Erro ao carregar produtos para seleção:", error);
            // Se der erro de índice aqui, avisa também
            if(error.code === 'failed-precondition') alert("Falta índice de Produtos no Firebase.");
        }
    };
    
    // --- 3. CARREGAR PROMOÇÕES (DA MINHA LOJA) ---
    const fetchPromotions = async () => {
        showLoader();
        promotionsTableBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
        try {
            // FILTRO SAAS
            const snapshot = await db.collection('promocoes')
                .where('lojaId', '==', LOJA_ATUAL)
                .orderBy('nome')
                .get();

            if (snapshot.empty) {
                promotionsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px;">Nenhuma promoção ativa.</td></tr>';
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const promo = doc.data();
                const statusClass = promo.ativa ? 'active' : 'inactive';
                const statusText = promo.ativa ? 'Ativa' : 'Inativa';
                // Traduz o tipo visualmente
                const tipoDesc = promo.tipoDesconto === 'percentual' ? `${promo.valorDesconto}% OFF` : `R$ ${promo.valorDesconto} OFF`;

                html += `
                    <tr>
                        <td>${promo.nome}</td>
                        <td>${tipoDesc}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <button class="btn-action btn-edit" data-id="${doc.id}">Editar</button>
                            <button class="btn-action btn-delete" data-id="${doc.id}">Excluir</button>
                        </td>
                    </tr>
                `;
            });
            promotionsTableBody.innerHTML = html;

        } catch (error) {
            console.error("Erro promoções:", error);
            if(error.code === 'failed-precondition') alert("Falta índice de Promoções no Firebase.");
            promotionsTableBody.innerHTML = '<tr><td colspan="4">Erro ao carregar.</td></tr>';
        } finally {
            hideLoader();
        }
    };

    // --- 4. SALVAR PROMOÇÃO (VINCULADA À LOJA) ---
    const savePromotion = async (data, id) => {
        showLoader();
        
        // VINCULA À LOJA
        data.lojaId = LOJA_ATUAL;

        try {
            if (id) await db.collection('promocoes').doc(id).update(data);
            else await db.collection('promocoes').add(data);
            
            closeModal('promotion-modal');
            fetchPromotions();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Não foi possível salvar a promoção.");
        } finally {
            hideLoader();
        }
    };
    
    // --- 5. EXCLUIR ---
    const deletePromotion = async (id) => {
        if (!confirm("Excluir esta promoção?")) return;
        showLoader();
        try {
            await db.collection('promocoes').doc(id).delete();
            fetchPromotions();
        } catch (error) {
            console.error("Erro ao excluir:", error);
        } finally {
            hideLoader();
        }
    };

    // --- LISTENERS ---

    addPromotionBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Nova Promoção';
        promotionForm.reset();
        promotionIdInput.value = '';
        // Marca todos os dias por padrão
        daysCheckboxes.forEach(cb => cb.checked = true);
        openModal('promotion-modal');
    });

    promotionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Coleta dias selecionados
        const diasAtivos = [];
        daysCheckboxes.forEach(cb => {
            if (cb.checked) diasAtivos.push(parseInt(cb.value));
        });

        if (diasAtivos.length === 0) {
            alert("Selecione pelo menos um dia da semana.");
            return;
        }
        
        const promotionData = {
            nome: promotionNameInput.value,
            produtoPrincipalId: mainProductSelect.value,
            produtoSecundarioId: secondaryProductSelect.value,
            tipoDesconto: discountTypeSelect.value,
            valorDesconto: parseFloat(discountValueInput.value),
            diasAtivos: diasAtivos,
            ativa: activeSelect.value === 'true'
        };

        savePromotion(promotionData, promotionIdInput.value);
    });

    promotionsTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const id = target.dataset.id;
        
        if (id && target.classList.contains('btn-edit')) {
            showLoader();
            const doc = await db.collection('promocoes').doc(id).get();
            const promo = doc.data();
            
            modalTitle.textContent = 'Editar Promoção';
            promotionIdInput.value = doc.id;
            promotionNameInput.value = promo.nome;
            mainProductSelect.value = promo.produtoPrincipalId;
            secondaryProductSelect.value = promo.produtoSecundarioId;
            discountTypeSelect.value = promo.tipoDesconto;
            discountValueInput.value = promo.valorDesconto;
            activeSelect.value = promo.ativa.toString(); // Converte boolean para string do select

            // Marca os dias corretos
            daysCheckboxes.forEach(cb => {
                cb.checked = promo.diasAtivos.includes(parseInt(cb.value));
            });
            
            hideLoader();
            openModal('promotion-modal');
        }
        
        if (id && target.classList.contains('btn-delete')) {
            deletePromotion(id);
        }
    });

    // Fechar Modal
    const modalEl = document.getElementById('promotion-modal');
    if(modalEl) {
        modalEl.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('promotion-modal'));
        });
    }

    // INICIALIZAÇÃO
    // Primeiro carrega os produtos (para o select), depois a lista
    (async function init() {
        await fetchProductsForSelect();
        await fetchPromotions();
    })();
});