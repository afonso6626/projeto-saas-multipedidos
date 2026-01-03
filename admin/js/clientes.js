import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) return;
    // ----------------------

    const tableBody = document.getElementById('clientes-table-body');
    if (!tableBody) return;

    const searchInput = document.getElementById('search-clientes');
    let allClientsData = []; 

    const fetchAndProcessClients = async () => {
        showLoader();
        tableBody.innerHTML = '<tr><td colspan="6">Carregando clientes...</td></tr>';
        try {
            // SAAS: Busca apenas pedidos desta loja para identificar os clientes
            const pedidosSnapshot = await db.collection('pedidos')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .orderBy('data', 'desc')
                .get();

            const clientsMap = new Map();

            pedidosSnapshot.forEach(doc => {
                const pedido = doc.data();
                const phone = pedido.clienteTelefone;
                
                if (!phone) return;
                
                // Se o cliente ainda não está no mapa, adiciona
                if (!clientsMap.has(phone)) {
                    clientsMap.set(phone, {
                        nome: pedido.clienteNome,
                        telefone: phone,
                        numPedidos: 0,
                        totalGasto: 0,
                        ultimoPedido: new Date(0) // Data antiga inicial
                    });
                }

                // Atualiza dados do cliente
                const clientData = clientsMap.get(phone);
                clientData.numPedidos++;
                clientData.totalGasto += pedido.total;
                
                // Verifica data (compatibilidade com timestamp do firebase ou date js)
                let pedidoDate;
                if (pedido.data && pedido.data.toDate) {
                    pedidoDate = pedido.data.toDate();
                } else if (pedido.criadoEm && pedido.criadoEm.toDate) {
                    pedidoDate = pedido.criadoEm.toDate();
                } else {
                    pedidoDate = new Date();
                }

                if (pedidoDate > clientData.ultimoPedido) {
                    clientData.ultimoPedido = pedidoDate;
                }
            });
            
            allClientsData = Array.from(clientsMap.values());
            renderClients(allClientsData);

        } catch (error) {
            console.error("Erro clientes:", error);
            if(error.code === 'failed-precondition') alert("Falta criar índice no Firebase. Veja o Console.");
            tableBody.innerHTML = '<tr><td colspan="6">Erro ao carregar.</td></tr>';
        } finally {
            hideLoader();
        }
    };

    const renderClients = (clients) => {
        tableBody.innerHTML = '';
        if (clients.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6">Nenhum cliente encontrado.</td></tr>';
            return;
        }
        
        // Ordena por quem gastou mais
        clients.sort((a, b) => b.totalGasto - a.totalGasto);

        clients.forEach(client => {
            const ultimoPedidoStr = client.ultimoPedido.toLocaleDateString('pt-BR');
            const totalGastoStr = `R$ ${client.totalGasto.toFixed(2).replace('.', ',')}`;
            
            const whatsappNumber = (client.telefone || '').replace(/\D/g, '');
            // Adiciona 55 se não tiver
            const fullPhone = whatsappNumber.length <= 11 ? '55' + whatsappNumber : whatsappNumber;
            
            const whatsappMessage = `Olá ${client.nome}, tudo bem? Somos da Lanchonete e temos ofertas para você!`;
            const encodedMessage = encodeURIComponent(whatsappMessage);

            tableBody.innerHTML += `
                <tr>
                    <td>${client.nome}</td>
                    <td>
                        ${client.telefone}
                        <a href="https://wa.me/${fullPhone}?text=${encodedMessage}" target="_blank" class="whatsapp-link" title="Enviar mensagem" style="margin-left:5px; text-decoration:none;">
                           💬
                        </a>
                    </td>
                    <td>${ultimoPedidoStr}</td>
                    <td>${client.numPedidos}</td>
                    <td>${totalGastoStr}</td>
                    <td>
                        <button class="btn-action btn-view-client" data-telefone="${client.telefone}" data-nome="${client.nome}">Ver Pedidos</button>
                    </td>
                </tr>
            `;
        });
    };

    const filterClients = () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const filteredData = allClientsData.filter(client => 
            client.nome.toLowerCase().includes(searchTerm) || client.telefone.includes(searchTerm)
        );
        renderClients(filteredData);
    };

    // --- MODAL DE HISTÓRICO DO CLIENTE ---
    const clientOrdersModal = document.getElementById('client-orders-modal');
    const modalClientName = document.getElementById('modal-client-name');
    const clientOrdersList = document.getElementById('client-orders-list');

    const showClientOrdersModal = async (clientPhone, clientName) => {
        showLoader();
        modalClientName.textContent = `Pedidos de: ${clientName}`;
        clientOrdersList.innerHTML = '<p>Buscando...</p>';
        openModal('client-orders-modal');

        try {
            const snapshot = await db.collection('pedidos')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .where('clienteTelefone', '==', clientPhone)
                .orderBy('data', 'desc')
                .get();

            if (snapshot.empty) {
                clientOrdersList.innerHTML = '<p>Nenhum pedido encontrado.</p>';
                return;
            }

            let ordersHtml = '';
            snapshot.forEach(doc => {
                const order = doc.data();
                let dateStr = '-';
                if(order.data && order.data.toDate) dateStr = order.data.toDate().toLocaleDateString('pt-BR');
                
                const orderTotal = `R$ ${(order.total||0).toFixed(2).replace('.', ',')}`;
                
                ordersHtml += `
                    <div class="order-history-item" style="border-bottom:1px solid #eee; padding:10px 0; display:flex; justify-content:space-between;">
                        <span>#${doc.id.substring(0, 5).toUpperCase()} - ${dateStr} (${order.status})</span>
                        <strong>${orderTotal}</strong>
                    </div>
                `;
            });
            clientOrdersList.innerHTML = ordersHtml;

        } catch (error) {
            console.error("Erro histórico cliente:", error);
            clientOrdersList.innerHTML = '<p>Erro ao carregar.</p>';
        } finally {
            hideLoader();
        }
    };

    // Listeners
    searchInput.addEventListener('input', filterClients);
    
    tableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-view-client')) {
            const phone = e.target.dataset.telefone;
            const name = e.target.dataset.nome;
            showClientOrdersModal(phone, name);
        }
    });

    if(clientOrdersModal) {
        clientOrdersModal.querySelector('.close-modal-btn').addEventListener('click', () => closeModal('client-orders-modal'));
        clientOrdersModal.querySelector('.cancel-modal-btn').addEventListener('click', () => closeModal('client-orders-modal'));
    }

    fetchAndProcessClients();
});