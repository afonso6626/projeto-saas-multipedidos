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

    const couponsTableBody = document.getElementById('coupons-table-body');
    if (!couponsTableBody) return;

    // --- SELETORES ---
    const addCouponBtn = document.getElementById('add-coupon-btn');
    const couponModal = document.getElementById('coupon-modal');
    const couponForm = document.getElementById('coupon-form');
    const modalTitle = couponModal.querySelector('#modal-title');
    
    const couponIdInput = document.getElementById('coupon-id');
    const couponCodeInput = document.getElementById('coupon-code');
    const couponTypeSelect = document.getElementById('coupon-type');
    const couponValueInput = document.getElementById('coupon-value');
    const couponActiveSelect = document.getElementById('coupon-active');
    
    // --- 2. BUSCAR CUPONS (DA LOJA ATUAL) ---
    const fetchCoupons = async () => {
        showLoader();
        couponsTableBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
        try {
            // FILTRO SAAS: Busca apenas cupons desta loja
            const snapshot = await db.collection('cupons')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .orderBy('codigo')
                .get();

            if (snapshot.empty) {
                couponsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Nenhum cupom criado.</td></tr>';
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const coupon = doc.data();
                const valor = coupon.tipo === 'percentual'
                    ? `${coupon.valor}%`
                    : `R$ ${parseFloat(coupon.valor).toFixed(2).replace('.', ',')}`;

                const statusClass = coupon.ativo ? 'active' : 'inactive';
                const statusText = coupon.ativo ? 'Ativo' : 'Inativo';

                html += `
                    <tr>
                        <td style="font-weight:bold; color:var(--primary-color);">${coupon.codigo}</td>
                        <td>${coupon.tipo === 'percentual' ? 'Porcentagem' : 'Valor Fixo'}</td>
                        <td>${valor}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <button class="btn-action btn-edit" data-id="${doc.id}">Editar</button>
                            <button class="btn-action btn-delete" data-id="${doc.id}">Excluir</button>
                        </td>
                    </tr>
                `;
            });
            couponsTableBody.innerHTML = html;

        } catch (error) {
            console.error("Erro cupons:", error);
            if(error.code === 'failed-precondition') alert("Falta criar índice no Firebase (Cupons). Veja o Console.");
            couponsTableBody.innerHTML = '<tr><td colspan="5">Erro ao carregar.</td></tr>';
        } finally {
            hideLoader();
        }
    };

    // --- 3. SALVAR CUPOM (COM ID DA LOJA) ---
    const saveCoupon = async (data, id) => {
        showLoader();
        
        // VINCULA À LOJA
        data.lojaId = LOJA_ATUAL;

        try {
            if (id) {
                await db.collection('cupons').doc(id).update(data);
            } else {
                // Opcional: Verificar se o código já existe PARA ESSA LOJA antes de criar
                // (Para evitar duplicidade dentro da mesma loja)
                const check = await db.collection('cupons')
                    .where('lojaId', '==', LOJA_ATUAL)
                    .where('codigo', '==', data.codigo)
                    .get();
                
                if(!check.empty) {
                    alert("Já existe um cupom com este código nesta loja.");
                    hideLoader();
                    return;
                }

                await db.collection('cupons').add(data);
            }
            
            closeModal('coupon-modal');
            fetchCoupons();
            alert("Cupom salvo!");

        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Não foi possível salvar o cupom.");
        } finally {
            hideLoader();
        }
    };
    
    // --- 4. EXCLUIR ---
    const deleteCoupon = async (id) => {
        if (!confirm("Tem certeza que deseja excluir este cupom?")) return;
        showLoader();
        try {
            await db.collection('cupons').doc(id).delete();
            fetchCoupons();
        } catch (error) {
            console.error("Erro ao excluir:", error);
        } finally {
            hideLoader();
        }
    };

    // --- LISTENERS ---

    addCouponBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Novo Cupom';
        couponForm.reset();
        couponIdInput.value = '';
        openModal('coupon-modal');
    });

    couponForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const couponData = {
            codigo: couponCodeInput.value.toUpperCase().trim(), // Força maiúsculas
            tipo: couponTypeSelect.value,
            valor: parseFloat(couponValueInput.value),
            ativo: couponActiveSelect.value === 'true'
        };

        if(!couponData.codigo) {
            alert("Digite um código válido.");
            return;
        }

        saveCoupon(couponData, couponIdInput.value);
    });

    couponsTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const id = target.dataset.id;
        
        if (id && target.classList.contains('btn-edit')) {
            showLoader();
            const doc = await db.collection('cupons').doc(id).get();
            const coupon = doc.data();
            
            modalTitle.textContent = 'Editar Cupom';
            couponIdInput.value = doc.id;
            couponCodeInput.value = coupon.codigo;
            couponTypeSelect.value = coupon.tipo;
            couponValueInput.value = coupon.valor;
            couponActiveSelect.value = coupon.ativo.toString();
            
            hideLoader();
            openModal('coupon-modal');
        }
        
        if (id && target.classList.contains('btn-delete')) {
            deleteCoupon(id);
        }
    });
    
    // Fechar Modal
    const modalEl = document.getElementById('coupon-modal');
    if(modalEl) {
        modalEl.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('coupon-modal'));
        });
    }

    // INICIA
    fetchCoupons();
});