/* --- START OF FILE pedidos.js --- */

import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';
import { logAction } from './logger.js';

// --- VARIÁVEIS GLOBAIS DE SOM ---
let audioPlaying = false; 
const audioEl = document.getElementById('notification-sound');

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS: PEGAR ID DA LOJA ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) {
        console.error("Sessão inválida. Redirecionando...");
        window.location.href = 'index.html';
        return;
    }
    console.log("🚀 Painel de Pedidos carregado para:", LOJA_ATUAL);

    if (!document.querySelector('.kanban-board')) return;

    // --- 2. SELETORES DO DOM ---
    const columns = {
        novo: document.querySelector('#column-novo .kanban-column-content'),
        preparando: document.querySelector('#column-preparando .kanban-column-content'),
        pronto: document.querySelector('#column-pronto .kanban-column-content'),
        finalizado: document.querySelector('#column-finalizado .kanban-column-content'),
        cancelado: document.querySelector('#column-cancelado .kanban-column-content')
    };
    
    const modalDetails = document.getElementById('order-details-modal');
    const statusIndicator = document.getElementById('store-status-indicator');
    const statusText = statusIndicator.querySelector('.status-text');
    const statusToggleButton = document.getElementById('store-status-toggle');
    const mainContent = document.querySelector('.main-content');
    
    // Estado Local
    let isFirstLoad = true;
    let isStoreOpen = false;
    let lojaConfig = {}; 
    let deliveryTaxes = [];
    let allProducts = []; 
    
    // Variáveis de Edição / Criação Manual
    let currentEditingOrder = null;
    let manualOrderData = { itens: [], total: 0 }; // Estado do pedido manual
    let isManualOrderMode = false; // Flag para saber qual modal usar ao adicionar produto

    // --- 3. MONITORAR STATUS DA LOJA ---
    db.collection('configuracoes').doc(LOJA_ATUAL).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            isStoreOpen = data.aberta === true;
            lojaConfig = data;
            updateStoreStatusUI(isStoreOpen);
        } else {
            db.collection('configuracoes').doc(LOJA_ATUAL).set({ aberta: false, nome: 'Minha Loja' }, { merge: true });
        }
    });

    function updateStoreStatusUI(isOpen) {
        if (isOpen) {
            statusIndicator.className = 'store-status status-open';
            statusText.textContent = 'Loja Aberta';
            statusToggleButton.textContent = 'Fechar Loja';
            statusToggleButton.className = 'btn btn-danger';
            const banner = mainContent.querySelector('.store-closed-banner');
            if (banner) banner.remove();
        } else {
            statusIndicator.className = 'store-status status-closed';
            statusText.textContent = 'Loja Fechada';
            statusToggleButton.textContent = 'Abrir Loja';
            statusToggleButton.className = 'btn btn-primary';
            if (!mainContent.querySelector('.store-closed-banner')) {
                mainContent.insertAdjacentHTML('afterbegin', '<div class="store-closed-banner">⚠️ Atenção! Seu estabelecimento está fechado para novos pedidos no site.</div>');
            }
        }
    }

    const fetchDeliveryTaxes = async () => {
        try {
            const snapshot = await db.collection('taxasEntrega').where('lojaId', '==', LOJA_ATUAL).get();
            deliveryTaxes = snapshot.docs.map(doc => doc.data());
        } catch (error) { console.error("Erro taxas:", error); }
    };
    
    // --- 4. MONITORAMENTO DE PEDIDOS (KANBAN) ---
    db.collection('pedidos')
        .where('lojaId', '==', LOJA_ATUAL)
        .orderBy('data', 'desc')
        .onSnapshot(snapshot => {
            Object.values(columns).forEach(col => col.innerHTML = '');
            let hasNewOrder = false;

            snapshot.forEach(doc => {
                const order = { id: doc.id, ...doc.data() };
                if (order.arquivado === true) return; 

                const columnEl = columns[order.status];
                if (columnEl) {
                    columnEl.appendChild(createOrderCard(order));
                }
            });

            if (!isFirstLoad) {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added' && change.doc.data().status === 'novo') {
                        hasNewOrder = true;
                    }
                });
                if (hasNewOrder) playAlertLoop();
            }
            isFirstLoad = false;
        }, error => {
            console.error("Erro Firebase:", error);
        });

    // --- 5. SISTEMA DE SOM ---
    function playAlertLoop() {
        if(audioPlaying) return;
        if(audioEl) {
            audioEl.loop = true;
            audioEl.currentTime = 0;
            audioEl.play().then(() => {
                audioPlaying = true;
                showStopSoundButton();
            }).catch(err => console.log("Autoplay bloqueado:", err));
        }
    }

    function showStopSoundButton() {
        if(document.getElementById('btn-stop-sound')) return;
        const btn = document.createElement('button');
        btn.id = 'btn-stop-sound';
        btn.innerHTML = '🔔 <b>PARAR SOM</b>';
        btn.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; background: #dc3545; color: white; padding: 12px 24px; border: none; border-radius: 50px; cursor: pointer; font-size: 16px; box-shadow: 0 0 20px rgba(220, 53, 69, 0.7); animation: pulse 1.5s infinite;';
        
        const style = document.createElement('style');
        style.innerHTML = `@keyframes pulse { 0% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.1); } 100% { transform: translateX(-50%) scale(1); } }`;
        document.head.appendChild(style);

        btn.onclick = () => stopAlert();
        document.body.appendChild(btn);
    }

    function stopAlert() {
        if(audioEl) {
            audioEl.pause();
            audioEl.currentTime = 0;
        }
        audioPlaying = false;
        const btn = document.getElementById('btn-stop-sound');
        if(btn) btn.remove();
    }

    // --- 6. CARD DO PEDIDO ---
    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.dataset.id = order.id;
        
        let dateDisplay = '...';
        if (order.data && order.data.toDate) {
            dateDisplay = order.data.toDate().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        } else if (order.criadoEm && order.criadoEm.toDate) {
            dateDisplay = order.criadoEm.toDate().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        }
        
        const totalVal = parseFloat(order.total || 0);
        const totalFormatted = `R$ ${totalVal.toFixed(2).replace('.', ',')}`;
        
        let infoEntrega = '';
        if (order.tipoEntrega === 'retirada') {
            infoEntrega = `<p class="delivery-type-info" style="color:#007bff; font-weight:bold;">🛍️ Retirada no Balcão</p>`;
        } else {
            const motoboy = order.motoboyNome ? order.motoboyNome : 'Aguardando Motoboy';
            infoEntrega = `<p class="motoboy-info">🛵 ${motoboy}</p>`;
        }

        let iconPag = '💳';
        if(order.pagamento === 'Pix') iconPag = '💠';
        if(order.pagamento === 'Dinheiro') iconPag = '💵';

        card.innerHTML = `
            <h4>#${order.id.substring(0, 5).toUpperCase()}</h4>
            <p><strong>${order.clienteNome || 'Cliente'}</strong></p>
            <p style="color:#666; font-size:0.85rem">🕒 ${dateDisplay}</p>
            <p class="order-total">${totalFormatted}</p>
            <p style="font-size:0.8rem; color:#555;">${iconPag} ${order.pagamento}</p>
            ${infoEntrega}
        `;
        
        card.addEventListener('click', () => {
            stopAlert();
            showOrderDetails(order.id);
        });
        return card;
    }

    // --- 7. DETALHES DO PEDIDO ---
    async function showOrderDetails(orderId) {
        showLoader();
        try {
            const doc = await db.collection('pedidos').doc(orderId).get();
            if (!doc.exists) return;
            const order = { id: doc.id, ...doc.data() };
            populateOrderModal(order);
            
            const motoboySelect = document.getElementById('motoboy-select');
            if (motoboySelect && order.tipoEntrega !== 'retirada') {
                await populateMotoboySelect(motoboySelect, order.motoboyId);
            }
            openModal('order-details-modal');
        } catch (error) { console.error(error); } 
        finally { hideLoader(); }
    }

    // --- CORREÇÃO NO js/pedidos.js ---

    async function populateMotoboySelect(selectElement, selectedMotoboyId) {
        try {
            // O erro acontecia aqui: Faltava o .where('lojaId', '==', LOJA_ATUAL)
            // Sem isso, o sistema tenta ler motoboys de outras lojas e o Firebase bloqueia.
            const snapshot = await db.collection('entregadores')
                .where('lojaId', '==', LOJA_ATUAL) // <--- A CORREÇÃO ESTÁ AQUI
                .orderBy('nome')
                .get();

            let optionsHtml = '<option value="">-- Selecione Entregador --</option>';
            
            if (snapshot.empty) {
                optionsHtml += '<option value="" disabled>Nenhum motoboy cadastrado</option>';
            }

            snapshot.forEach(doc => {
                const selected = doc.id === selectedMotoboyId ? 'selected' : '';
                optionsHtml += `<option value="${doc.id}" data-nome="${doc.data().nome}" ${selected}>${doc.data().nome}</option>`;
            });
            selectElement.innerHTML = optionsHtml;
        } catch (error) { 
            console.error("Erro motoboys:", error); 
            selectElement.innerHTML = '<option value="">Erro ao carregar</option>';
            
            // Dica: Se aparecer erro de índice no console após essa mudança, clique no link que o Firebase fornece.
        }
    }
    function populateOrderModal(order) {
        const body = modalDetails.querySelector('#modal-order-details-body');
        const actions = modalDetails.querySelector('#modal-order-actions');
        
        const totalVal = parseFloat(order.total || 0);
        const totalDisplay = `R$ ${totalVal.toFixed(2).replace('.', ',')}`;
        
        const itemsHtml = (order.itens || []).map(item => {
            const itemPreco = parseFloat(item.preco || item.total || 0);
            let detalhes = '';
            if(item.opcionais && item.opcionais.length > 0) detalhes += `<br><small style="color:#666">+ ${item.opcionais.map(o=>o.nome).join(', ')}</small>`;
            if(item.obs) detalhes += `<br><small style="color:#d63384; font-style:italic;">Obs: ${item.obs}</small>`;

            return `<li style="margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:5px;">
                <div style="display:flex; justify-content:space-between;">
                    <span><b>${item.quantidade || item.qty}x</b> ${item.nome || item.prodName}</span>
                    <span>R$ ${itemPreco.toFixed(2).replace('.',',')}</span>
                </div>
                ${detalhes}
            </li>`;
        }).join('');

        let motoboyHtml = '';
        if (order.tipoEntrega !== 'retirada') {
            motoboyHtml = `
                <div class="order-details-section motoboy-section" style="background:var(--secondary-color); padding:10px; border-radius:8px; margin-top:10px;">
                    <h5 style="margin-bottom:5px;">🛵 Motoboy</h5>
                    <div class="form-group" style="margin-bottom:0;">
                        <select id="motoboy-select" class="form-control"><option value="">Carregando lista...</option></select>
                    </div>
                </div>`;
        }

        const addressClass = order.tipoEntrega === 'retirada' ? 'address-badge retirada' : 'address-badge';
        const addressText = order.tipoEntrega === 'retirada' ? 'Retirada no Balcão' : (order.endereco || 'Não informado');

        let zapHtml = '';
        if (order.clienteTelefone) {
            const phone = '55' + order.clienteTelefone.replace(/\D/g, '');
            const name = (order.clienteNome || '').split(' ')[0];
            const oid = order.id.substring(0, 5).toUpperCase();
            const makeZapLink = (text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

            zapHtml = `
                <div class="whatsapp-actions-container">
                    <div class="whatsapp-actions-title">📲 Notificar Cliente</div>
                    <div class="whatsapp-buttons-grid">
                        <a href="${makeZapLink(`Olá ${name}, recebemos seu pedido #${oid}. Já vamos preparar! 🍳`)}" target="_blank" class="btn-zap-action">✅ Confirmar</a>
                        <a href="${makeZapLink(`Olá ${name}, seu pedido #${oid} saiu para entrega! 🛵`)}" target="_blank" class="btn-zap-action">🛵 Saiu</a>
                        <a href="${makeZapLink(`Olá ${name}, seu pedido #${oid} está pronto para retirada! 🛍️`)}" target="_blank" class="btn-zap-action">🛍️ Pronto</a>
                        <a href="${makeZapLink(`Olá ${name}, pedido #${oid} finalizado. Obrigado! ⭐`)}" target="_blank" class="btn-zap-action">👍 Finalizar</a>
                    </div>
                </div>`;
        }

        body.innerHTML = `
            <div class="order-details-section">
                <h5 style="margin-bottom:10px;">Dados do Cliente</h5>
                <div class="order-details-item"><span>Nome:</span> <strong>${order.clienteNome}</strong></div>
                <div class="order-details-item"><span>Telefone:</span> <a href="tel:${order.clienteTelefone}" class="phone-link">${order.clienteTelefone || '-'}</a></div>
                <div class="order-details-item"><span>Endereço:</span> <span class="${addressClass}">${addressText}</span></div>
                <div class="order-details-item"><span>Pagamento:</span> <strong>${order.pagamento}</strong></div>
            </div>

            <div class="order-details-section" style="margin-top:15px;">
                <h5 style="margin-bottom:10px;">Itens do Pedido</h5>
                <ul class="order-items-list" style="list-style:none; padding:0;">${itemsHtml}</ul>
                <div style="text-align:right; font-size:1.2rem; margin-top:10px;">
                    Total: <strong style="color:var(--success-color)">${totalDisplay}</strong>
                </div>
            </div>
            ${motoboyHtml}
            ${zapHtml}
        `;

        actions.innerHTML = '';
        actions.dataset.id = order.id;

        if (['novo', 'preparando'].includes(order.status)) {
            actions.innerHTML += `<button class="btn btn-secondary btn-edit-order">✏️ Editar</button>`;
        }
        if (!['finalizado', 'cancelado'].includes(order.status)) { 
            actions.innerHTML += `<button class="btn btn-cancel" data-action="cancelado">❌ Cancelar</button>`; 
        }
        if (order.status === 'novo') actions.innerHTML += `<button class="btn btn-primary" data-action="preparando">🔥 Preparar</button>`; 
        else if (order.status === 'preparando') actions.innerHTML += `<button class="btn btn-primary" data-action="pronto">📦 Pronto</button>`; 
        else if (order.status === 'pronto') actions.innerHTML += `<button class="btn btn-primary" data-action="finalizado">✅ Entregue/Finalizar</button>`; 
        else actions.innerHTML += `<button class="btn btn-secondary" data-action="novo">↩️ Reabrir</button>`; 
        actions.innerHTML += `<button class="btn btn-secondary btn-print" title="Imprimir Cupom">🖨️</button>`;

        const btnEdit = actions.querySelector('.btn-edit-order');
        if(btnEdit) btnEdit.addEventListener('click', () => {
            currentEditingOrder = JSON.parse(JSON.stringify(order));
            isManualOrderMode = false; // MODO EDIÇÃO
            openEditModal();
        });
    }

    // --- 8. ATUALIZAR STATUS ---
    function updateOrderStatus(orderId, newStatus) {
        if (newStatus === 'cancelado' && !confirm("Tem certeza que deseja CANCELAR este pedido?")) return;
        if (newStatus === 'finalizado' && !confirm("Confirmar entrega/finalização do pedido?")) return;
        
        showLoader();
        const updateData = { status: newStatus };
        const sel = document.getElementById('motoboy-select');
        if (sel && sel.value) {
            updateData.motoboyId = sel.value;
            updateData.motoboyNome = sel.options[sel.selectedIndex].dataset.nome;
        }
        
        db.collection('pedidos').doc(orderId).update(updateData)
            .then(() => {
                if(newStatus === 'cancelado') logAction('Pedido Cancelado', `ID: ${orderId}`);
                if(newStatus === 'finalizado') logAction('Pedido Finalizado', `ID: ${orderId}`);
                closeModal('order-details-modal');
            })
            .catch(err => alert("Erro ao atualizar."))
            .finally(() => hideLoader());
    }

    // --- 9. IMPRESSÃO ---
    async function printOrder(orderId) {
        showLoader();
        try {
            const doc = await db.collection('pedidos').doc(orderId).get();
            const order = doc.data();
            let taxaEntrega = order.taxaEntrega || 0;
            const subtotal = (order.total || 0) - taxaEntrega;
            
            const itemsPrint = (order.itens || []).map(i => `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-weight:bold;">${i.quantidade||i.qty}x ${i.nome||i.prodName}</span>
                    <span>${((i.quantidade||i.qty)*(i.preco||0)).toFixed(2)}</span>
                </div>
            `).join('');

            const w = window.open('', '', 'width=300,height=600');
            w.document.write(`
                <html><body style="font-family:'Courier New', monospace; font-size:12px; width:280px; margin:0; padding:5px;">
                    <div style="text-align:center; font-weight:bold; margin-bottom:10px;">${lojaConfig.nome || 'LANCHONETE'}<br>----------------</div>
                    Data: ${new Date().toLocaleString()}<br><b>Pedido: #${orderId.substring(0,5).toUpperCase()}</b><br>
                    Cliente: ${order.clienteNome}<br>Tel: ${order.clienteTelefone || '-'}<br>
                    Tipo: <b>${order.tipoEntrega === 'retirada' ? 'RETIRADA' : 'ENTREGA'}</b><br>
                    ${order.tipoEntrega !== 'retirada' ? `End: ${order.endereco}<br>` : ''}
                    ----------------<br>${itemsPrint}----------------<br>
                    <div style="text-align:right;">Subtotal: R$ ${subtotal.toFixed(2)}<br>Taxa: R$ ${taxaEntrega.toFixed(2)}<br><b>TOTAL: R$ ${(order.total||0).toFixed(2)}</b></div>
                    <div style="margin-top:5px;">Pagamento: ${order.pagamento}</div>
                </body></html>
            `);
            w.document.close();
            setTimeout(() => { w.print(); w.close(); }, 500);
        } catch(e) { console.error(e); } finally { hideLoader(); }
    }

    // --- 10. CRIAR PEDIDO MANUAL (CORRIGIDO) ---
    const btnCreateManual = document.getElementById('create-manual-order-btn');
    const modalManual = document.getElementById('manual-order-modal');

    // Abre o Modal
    if(btnCreateManual) {
        btnCreateManual.addEventListener('click', () => {
            // Resetar formulário
            document.getElementById('manual-client-name').value = '';
            document.getElementById('manual-client-phone').value = '';
            document.getElementById('manual-address').value = '';
            manualOrderData = { itens: [], total: 0 };
            renderManualItems();
            openModal('manual-order-modal');
        });
    }

    // Listener para FECHAR o modal manual (X e Cancelar)
    if (modalManual) {
        modalManual.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('manual-order-modal'));
        });
    }

    // Botão Adicionar Produto no Modal Manual
    const btnAddProdManual = document.getElementById('manual-add-product-btn');
    if(btnAddProdManual) {
        btnAddProdManual.addEventListener('click', async () => {
            isManualOrderMode = true; // Flag importante para saber onde adicionar o item
            showLoader();
            await fetchAllProducts();
            hideLoader();
            document.getElementById('search-add-product').value = '';
            renderProductList('');
            
            // Reutiliza o modal de busca
            openModal('add-product-modal'); 
        });
    }
    
    // Listener para fechar o modal de adicionar produto
    const modalAddProduct = document.getElementById('add-product-modal');
    if (modalAddProduct) {
        modalAddProduct.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('add-product-modal'));
        });
    }

    // Renderiza itens na tabela do modal manual
    // Renderiza itens na tabela do modal manual (COM BOTÕES + E -)
    function renderManualItems() {
        const tbody = document.getElementById('manual-items-tbody');
        tbody.innerHTML = '';
        let soma = 0;
        
        manualOrderData.itens.forEach((item, idx) => {
            const totalItem = (item.qty * item.preco);
            soma += totalItem;

            // Estilo básico para os botões de quantidade
            const btnStyle = 'padding: 2px 8px; margin: 0 5px; cursor: pointer; border-radius: 4px; border: 1px solid #555; background: #3a3a3a; color: white;';

            tbody.innerHTML += `
                <tr>
                    <td style="padding: 12px 8px;">${item.prodName}</td>
                    
                    <td style="padding: 12px 8px; white-space: nowrap;">
                        <button type="button" class="btn-manual-qty" data-idx="${idx}" data-op="-1" style="${btnStyle}">-</button>
                        <span style="font-weight:bold;">${item.qty}</span>
                        <button type="button" class="btn-manual-qty" data-idx="${idx}" data-op="1" style="${btnStyle}">+</button>
                    </td>

                    <td style="padding: 12px 8px;">R$ ${totalItem.toFixed(2)}</td>
                    <td style="padding: 12px 8px;">
                        <button class="btn-action btn-delete-manual" data-idx="${idx}" style="color:#ff6b6b; background:none; border:none; cursor:pointer; font-size:1.1rem;">🗑️</button>
                    </td>
                </tr>
            `;
        });
        
        manualOrderData.total = soma;
        document.getElementById('manual-total-display').innerText = `R$ ${soma.toFixed(2)}`;

        // 1. EVENTO DELETAR
        tbody.querySelectorAll('.btn-delete-manual').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                manualOrderData.itens.splice(idx, 1);
                renderManualItems();
            });
        });

        // 2. EVENTO ALTERAR QUANTIDADE (+ e -)
        tbody.querySelectorAll('.btn-manual-qty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const op = parseInt(e.target.dataset.op); // -1 ou +1
                
                const item = manualOrderData.itens[idx];
                let novaQtd = item.qty + op;

                if(novaQtd < 1) novaQtd = 1; // Não deixa ficar zero

                item.qty = novaQtd;
                item.quantidade = novaQtd; // Garante consistência

                renderManualItems(); // Redesenha a tabela com novos valores
            });
        });
    }

    // Salvar Pedido Manual
    const btnSaveManual = document.getElementById('save-manual-order-btn');
    if(btnSaveManual) {
        btnSaveManual.addEventListener('click', async () => {
            const nome = document.getElementById('manual-client-name').value;
            const phone = document.getElementById('manual-client-phone').value;
            const tipoEntrega = document.querySelector('input[name="manual-delivery-type"]:checked').value;
            const address = document.getElementById('manual-address').value;
            const pagamento = document.getElementById('manual-payment').value;

            if(!nome) return alert("Digite o nome do cliente.");
            if(manualOrderData.itens.length === 0) return alert("Adicione pelo menos um item.");
            if(tipoEntrega === 'entrega' && !address) return alert("Digite o endereço para entrega.");

            showLoader();
            try {
                const newOrder = {
                    lojaId: LOJA_ATUAL,
                    clienteNome: nome,
                    clienteTelefone: phone,
                    tipoEntrega: tipoEntrega,
                    endereco: tipoEntrega === 'retirada' ? 'Retirada no Balcão' : address,
                    itens: manualOrderData.itens,
                    total: manualOrderData.total,
                    subtotal: manualOrderData.total, // Em manual, simplificamos taxa
                    taxaEntrega: 0, 
                    pagamento: pagamento,
                    status: 'novo',
                    data: firebase.firestore.FieldValue.serverTimestamp(),
                    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                    origem: 'painel_manual'
                };

                await db.collection('pedidos').add(newOrder);
                logAction('Pedido Manual', `Criado pedido para ${nome}`);
                closeModal('manual-order-modal');
                alert("Pedido criado com sucesso!");
            } catch(e) {
                console.error(e);
                alert("Erro ao criar pedido.");
            } finally {
                hideLoader();
            }
        });
    }

    // --- 11. LÓGICA DE PRODUTOS (REUTILIZÁVEL) ---
    const fetchAllProducts = async () => {
        if (allProducts.length > 0) return;
        try {
            const snap = await db.collection('produtos').where('lojaId', '==', LOJA_ATUAL).where('disponivel', '==', true).get();
            allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { console.error(e); }
    };

    function renderProductList(term) {
        const div = document.getElementById('product-list-container');
        const lower = term.toLowerCase();
        const filtered = allProducts.filter(p => p.nome.toLowerCase().includes(lower));
        
        if(filtered.length === 0) {
            div.innerHTML = '<p style="padding:10px; text-align:center;">Nenhum produto encontrado.</p>';
            return;
        }

        div.innerHTML = filtered.map(p => {
            const preco = p.variacoes && p.variacoes.length > 0 ? p.variacoes[0].preco : 0;
            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border-color)">
                <span>${p.nome}</span>
                <div>
                    <strong style="margin-right:10px;">R$ ${preco.toFixed(2)}</strong>
                    <button class="btn btn-sm btn-primary btn-add-prod" data-id="${p.id}">+</button>
                </div>
            </div>`;
        }).join('');
    }

    const searchInput = document.getElementById('search-add-product');
    if(searchInput) searchInput.addEventListener('input', e => renderProductList(e.target.value));
    
    const prodListContainer = document.getElementById('product-list-container');
    if(prodListContainer) {
        prodListContainer.addEventListener('click', e => {
            if(e.target.classList.contains('btn-add-prod')) {
                const prod = allProducts.find(p => p.id === e.target.dataset.id);
                if(prod) {
                    const v = prod.variacoes ? prod.variacoes[0] : { preco: 0, tamanho: '' };
                    const newItem = {
                        nome: prod.nome + (v.tamanho ? ` (${v.tamanho})` : ''),
                        prodName: prod.nome,
                        preco: v.preco,
                        quantidade: 1, qty: 1
                    };

                    // --- DECISÃO: ONDE ADICIONAR O ITEM? ---
                    if (isManualOrderMode) {
                        // Modo Criação Manual
                        manualOrderData.itens.push(newItem);
                        renderManualItems();
                        closeModal('add-product-modal');
                    } else {
                        // Modo Edição de Pedido Existente
                        if(currentEditingOrder) {
                            currentEditingOrder.itens.push(newItem);
                            renderEditableItems();
                            closeModal('add-product-modal');
                        }
                    }
                }
            }
        });
    }

    // --- 12. EDIÇÃO DE PEDIDO (Lógica existente mantida) ---
    function openEditModal() {
        closeModal('order-details-modal');
        renderEditableItems();
        openModal('edit-order-modal');
    }

    function renderEditableItems() {
        const tbody = document.getElementById('editable-items-tbody');
        tbody.innerHTML = '';
        currentEditingOrder.itens.forEach((item, idx) => {
            const total = (item.quantidade || item.qty) * (item.preco || 0);
            tbody.innerHTML += `
                <tr>
                    <td>${item.nome || item.prodName}</td>
                    <td style="display:flex; gap:5px; align-items:center;">
                        <button type="button" class="btn-qty" data-idx="${idx}" data-op="-1">-</button>
                        <span>${item.quantidade || item.qty}</span>
                        <button type="button" class="btn-qty" data-idx="${idx}" data-op="1">+</button>
                    </td>
                    <td>R$ ${(item.preco||0).toFixed(2)}</td>
                    <td>R$ ${total.toFixed(2)}</td>
                    <td><button type="button" class="btn-action btn-delete" data-idx="${idx}" style="color:red;">🗑️</button></td>
                </tr>`;
        });
        const finalTotal = currentEditingOrder.itens.reduce((acc, i) => acc + ((i.quantidade||i.qty)*(i.preco||0)), 0) + (currentEditingOrder.taxaEntrega||0);
        document.getElementById('edit-modal-total').innerText = `Total: R$ ${finalTotal.toFixed(2)}`;
        currentEditingOrder.total = finalTotal;
    }

    const editContainer = document.getElementById('editable-items-container');
    if(editContainer) {
        editContainer.addEventListener('click', e => {
            const idx = e.target.dataset.idx;
            if (idx === undefined) return;
            if (e.target.classList.contains('btn-qty')) {
                const op = parseInt(e.target.dataset.op);
                const item = currentEditingOrder.itens[idx];
                let qtd = (item.quantidade || item.qty) + op;
                if(qtd < 1) qtd = 1;
                item.quantidade = qtd; item.qty = qtd;
                renderEditableItems();
            }
            if (e.target.classList.contains('btn-delete')) {
                currentEditingOrder.itens.splice(idx, 1);
                renderEditableItems();
            }
        });
    }

    const btnSaveEdit = document.getElementById('save-order-changes-btn');
    if(btnSaveEdit) {
        btnSaveEdit.addEventListener('click', async () => {
            showLoader();
            try {
                await db.collection('pedidos').doc(currentEditingOrder.id).update({
                    itens: currentEditingOrder.itens,
                    total: currentEditingOrder.total
                });
                logAction('Edição de Pedido', `Pedido ${currentEditingOrder.id} alterado manualmente.`);
                closeModal('edit-order-modal');
                alert('Pedido atualizado!');
            } catch(e) { console.error(e); } finally { hideLoader(); }
        });
    }

    // Botão Adicionar Produto (no modal de edição)
    const btnAddProdModal = document.getElementById('add-product-to-order-btn');
    if(btnAddProdModal) {
        btnAddProdModal.addEventListener('click', async () => {
            isManualOrderMode = false; // MODO EDIÇÃO
            showLoader();
            await fetchAllProducts();
            hideLoader();
            document.getElementById('search-add-product').value = '';
            renderProductList('');
            openModal('add-product-modal');
        });
    }
    
    // Listener para FECHAR o modal de edição (X e Cancelar)
    const modalEditOrder = document.getElementById('edit-order-modal');
    if (modalEditOrder) {
        modalEditOrder.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('edit-order-modal'));
        });
    }

    // --- 13. OUTROS (Status Loja, Limpeza) ---
    if(statusToggleButton) {
        statusToggleButton.addEventListener('click', () => {
            if(isStoreOpen) openModal('close-store-modal');
            else if(confirm("Deseja abrir a loja?")) changeStoreState(true);
        });
    }
    const btnConfirmClose = document.getElementById('confirm-close-store-btn');
    if(btnConfirmClose) {
        btnConfirmClose.addEventListener('click', () => { changeStoreState(false); closeModal('close-store-modal'); });
    }
    
    // Listener para fechar modal de fechar loja
    const modalCloseStore = document.getElementById('close-store-modal');
    if (modalCloseStore) {
        modalCloseStore.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('close-store-modal'));
        });
    }

    function changeStoreState(isOpen) {
        showLoader();
        db.collection('configuracoes').doc(LOJA_ATUAL).set({ aberta: isOpen }, { merge: true })
        .finally(() => hideLoader());
    }

    const btnArchive = document.getElementById('btn-archive-orders');
    if(btnArchive) {
        btnArchive.addEventListener('click', async () => {
            if(!confirm("Isso limpará da tela os pedidos Finalizados e Cancelados. Confirmar?")) return;
            showLoader();
            try {
                const batch = db.batch();
                const snap = await db.collection('pedidos').where('lojaId', '==', LOJA_ATUAL).where('status', 'in', ['finalizado', 'cancelado']).get();
                snap.forEach(doc => { if (doc.data().arquivado !== true) batch.update(doc.ref, { arquivado: true }); });
                await batch.commit();
                alert("Limpeza concluída.");
            } catch (e) { console.error(e); } finally { hideLoader(); }
        });
    }

    if(modalDetails) {
        modalDetails.querySelector('.close-modal-btn').addEventListener('click', () => closeModal('order-details-modal'));
        modalDetails.querySelector('#modal-order-actions').addEventListener('click', e => {
            const id = e.currentTarget.dataset.id;
            if (e.target.dataset.action) updateOrderStatus(id, e.target.dataset.action);
            if (e.target.classList.contains('btn-print')) printOrder(id);
        });
    }

    // Toggle de endereço manual
    const radiosEntrega = document.getElementsByName('manual-delivery-type');
    const divEndereco = document.getElementById('manual-address-group');
    if(radiosEntrega && divEndereco) {
        radiosEntrega.forEach(r => {
            r.addEventListener('change', e => {
                if(e.target.value === 'retirada') divEndereco.style.display = 'none';
                else divEndereco.style.display = 'block';
            });
        });
    }

    // Init
    fetchDeliveryTaxes();
});