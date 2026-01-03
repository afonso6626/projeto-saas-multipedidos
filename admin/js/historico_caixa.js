import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) return;
    // ----------------------

    const tbody = document.getElementById('historico-tbody');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const btnFiltrar = document.getElementById('btn-filtrar');

    // Elementos do Modal de Detalhes
    const modal = document.getElementById('detalhe-caixa-modal');
    const detalheId = document.getElementById('detalhe-id');
    const detalheOperador = document.getElementById('detalhe-operador');
    const detalheMovimentos = document.getElementById('detalhe-movimentos-tbody');
    const detalheQuebra = document.getElementById('detalhe-quebra');

    const formatMoney = (val) => `R$ ${parseFloat(val || 0).toFixed(2).replace('.', ',')}`;
    const formatDate = (timestamp) => timestamp ? new Date(timestamp.seconds * 1000).toLocaleString('pt-BR') : '-';

    // --- CARREGAR HISTÓRICO ---
    const loadHistory = async () => {
        showLoader();
        tbody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';

        try {
            // QUERY BLINDADA: Busca caixas da LOJA_ATUAL
            let query = db.collection('fluxo_caixa')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .orderBy('abertura', 'desc');

            // Filtro de Data
            if (startDateInput.value && endDateInput.value) {
                const start = new Date(startDateInput.value + 'T00:00:00');
                const end = new Date(endDateInput.value + 'T23:59:59');
                query = query.where('abertura', '>=', start).where('abertura', '<=', end);
            }

            const snapshot = await query.get();
            
            tbody.innerHTML = '';
            if (snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="7">Nenhum registro encontrado.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                // Só exibe caixas que já foram fechados
                if (!data.fechamento) return; 

                const diferenca = data.diferenca || 0;
                const corDiferenca = diferenca < 0 ? 'red' : (diferenca > 0 ? 'green' : 'inherit');

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDate(data.abertura)}</td>
                    <td>${formatDate(data.fechamento)}</td>
                    <td>${data.usuario || 'Anonimo'}</td>
                    <td>${formatMoney(data.saldoInicial)}</td>
                    <td>${formatMoney(data.saldoFinalInformado)}</td>
                    <td style="color: ${corDiferenca}; font-weight: bold;">${formatMoney(diferenca)}</td>
                    <td><button class="btn-action btn-view" style="color: var(--primary-color)">Ver Detalhes</button></td>
                `;
                
                tr.querySelector('.btn-view').addEventListener('click', () => openDetails(doc.id, data));
                tbody.appendChild(tr);
            });

        } catch (error) {
            console.error(error);
            if(error.code === 'failed-precondition') alert("Falta índice no Firebase. Veja o console.");
            else tbody.innerHTML = '<tr><td colspan="7">Erro ao carregar.</td></tr>';
        } finally {
            hideLoader();
        }
    };

    const openDetails = (id, data) => {
        detalheId.innerText = id;
        detalheOperador.innerText = data.usuario || 'Desconhecido';
        
        // Preenche a tabelinha de movimentos dentro do modal
        detalheMovimentos.innerHTML = '';
        if (data.movimentacoes && data.movimentacoes.length > 0) {
            data.movimentacoes.forEach(m => {
                const hora = new Date(m.data.seconds * 1000).toLocaleTimeString('pt-BR');
                const cor = m.tipo === 'sangria' ? 'red' : 'green';
                detalheMovimentos.innerHTML += `
                    <tr>
                        <td>${hora}</td>
                        <td style="color:${cor}">${m.tipo}</td>
                        <td>${m.descricao}</td>
                        <td>${formatMoney(m.valor)}</td>
                    </tr>
                `;
            });
        } else {
            detalheMovimentos.innerHTML = '<tr><td colspan="4">Sem movimentações extras.</td></tr>';
        }

        const dif = data.diferenca || 0;
        detalheQuebra.innerText = formatMoney(dif);
        detalheQuebra.style.color = dif < 0 ? 'red' : (dif > 0 ? 'green' : 'inherit');

        openModal('detalhe-caixa-modal');
    };

    btnFiltrar.addEventListener('click', loadHistory);
    
    if(modal) {
        modal.querySelector('.close-modal-btn').addEventListener('click', () => closeModal('detalhe-caixa-modal'));
    }

    // Inicializa com filtro padrão (últimos 30 dias)
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);
    
    endDateInput.value = today.toISOString().split('T')[0];
    startDateInput.value = lastMonth.toISOString().split('T')[0];

    loadHistory();
});