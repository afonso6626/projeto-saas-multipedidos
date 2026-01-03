import { db } from './firebase-config.js';
import { showLoader, hideLoader } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) return;
    // ----------------------

    const tableBody = document.getElementById('historico-table-body');
    if (!tableBody) return;

    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const searchTermInput = document.getElementById('search-term');
    
    let allOrders = []; // Cache local para filtrar rápido

    // --- BUSCAR PEDIDOS ---
    const fetchAllOrders = async () => {
        showLoader();
        try {
            // QUERY BLINDADA: where('lojaId', '==', LOJA_ATUAL)
            const snapshot = await db.collection('pedidos')
                .where('lojaId', '==', LOJA_ATUAL) 
                .orderBy('data', 'desc')
                .get();
            
            allOrders = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Garante que temos um objeto Date válido
                    dataObj: data.data ? data.data.toDate() : (data.criadoEm ? data.criadoEm.toDate() : new Date())
                };
            });
            renderTable(allOrders);
        } catch (error) {
            console.error("Erro histórico:", error);
            if(error.code === 'failed-precondition') alert("Falta índice no Firebase (Pedidos). Veja o console.");
            tableBody.innerHTML = '<tr><td colspan="6">Erro ao carregar histórico.</td></tr>';
        } finally {
            hideLoader();
        }
    };

    const renderTable = (orders) => {
        tableBody.innerHTML = '';
        if (orders.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6">Nenhum pedido encontrado.</td></tr>';
            return;
        }

        orders.forEach(order => {
            const dateStr = order.dataObj.toLocaleDateString('pt-BR') + ' ' + order.dataObj.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
            const totalStr = `R$ ${(order.total||0).toFixed(2).replace('.', ',')}`;
            
            // Estilo do badge de status
            const statusMap = {
                novo: { text: 'Novo', class: 'inactive' },
                preparando: { text: 'Em Preparo', class: 'inactive' },
                pronto: { text: 'Pronto', class: 'active' },
                finalizado: { text: 'Finalizado', class: 'active' },
                cancelado: { text: 'Cancelado', class: 'inactive' }
            };
            const statusInfo = statusMap[order.status] || { text: order.status, class: 'inactive' };
            const statusBadge = `<span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>`;
            
            tableBody.innerHTML += `
                <tr>
                    <td>#${order.id.substring(0, 5).toUpperCase()}</td>
                    <td>${dateStr}</td>
                    <td>${order.clienteNome || ''}</td>
                    <td>${totalStr}</td>
                    <td>${statusBadge}</td>
                    <td>${order.motoboyNome || '-'}</td>
                </tr>
            `;
        });
    };

    // --- FILTRO LOCAL (Nome, Telefone, Data) ---
    const applyFilters = () => {
        const searchTerm = searchTermInput.value.toLowerCase();
        const startDate = startDateInput.value ? new Date(startDateInput.value + 'T00:00:00') : null;
        const endDate = endDateInput.value ? new Date(endDateInput.value + 'T23:59:59') : null;

        const filteredOrders = allOrders.filter(order => {
            // Filtro de Texto
            const matchesSearch = searchTerm === '' ||
                (order.clienteNome && order.clienteNome.toLowerCase().includes(searchTerm)) ||
                (order.clienteTelefone && order.clienteTelefone.includes(searchTerm)) ||
                order.id.toLowerCase().includes(searchTerm);

            // Filtro de Data
            const matchesDate = (!startDate || order.dataObj >= startDate) && 
                                (!endDate || order.dataObj <= endDate);

            return matchesSearch && matchesDate;
        });

        renderTable(filteredOrders);
    };

    // Listeners
    startDateInput.addEventListener('change', applyFilters);
    endDateInput.addEventListener('change', applyFilters);
    searchTermInput.addEventListener('input', applyFilters);
    
    // Inicia
    fetchAllOrders();
});