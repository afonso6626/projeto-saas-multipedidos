import { db } from './firebase-config.js';
import { showLoader, hideLoader } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. SEGURANÇA SAAS: PEGAR ID DA LOJA ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');

    if (!LOJA_ATUAL) {
        // Se não tem loja, o auth.js vai cuidar do redirect, mas por segurança paramos aqui.
        return;
    }

    // Verifica se estamos na página certa
    if (!document.getElementById('faturamento-chart')) return;

    // --- 2. SELETORES ---
    const periodSelect = document.getElementById('period-select');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');

    // KPIs (Indicadores)
    const kpiFaturamentoEl = document.getElementById('kpi-faturamento');
    const kpiPedidosEl = document.getElementById('kpi-pedidos');
    const kpiTicketMedioEl = document.getElementById('kpi-ticket-medio');
    const kpiNovosClientesEl = document.getElementById('kpi-novos-clientes');
    const kpiNovosPedidosEl = document.getElementById('kpi-novos-pedidos');

    // Tabelas
    const topProdutosTable = document.getElementById('top-produtos-table');
    const topClientesTable = document.getElementById('top-clientes-table');

    // Variáveis dos Gráficos
    let faturamentoChart = null;
    let vendasHoraChart = null;
    let pagamentosChart = null;
    let categoriasChart = null;

    // --- 3. FUNÇÃO DE DATAS ---
    const setDateRange = () => {
        const period = periodSelect.value;
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);
        
        let start = new Date();
        start.setHours(0, 0, 0, 0);
        
        if (period === 'today') {
            // Hoje (já definido)
        } else if (period === '7days') {
            start.setDate(start.getDate() - 6);
        } else if (period === 'this_month') {
            start.setDate(1);
        } else if (period === 'last_month') {
            const lastMonth = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
            start = lastMonth;
            hoje.setDate(0); // Último dia do mês anterior
        }

        startDateInput.value = start.toISOString().split('T')[0];
        endDateInput.value = hoje.toISOString().split('T')[0];
        loadDashboardData(); // Carrega os dados
    };

    // --- 4. CARREGAR DADOS (BLINDADO) ---
    const loadDashboardData = async () => {
        showLoader();

        try {
            // Ajusta fuso horário básico para busca
            const startDate = new Date(startDateInput.value + 'T00:00:00');
            const endDate = new Date(endDateInput.value + 'T23:59:59');

            // A. Buscar Pedidos do Período (DA MINHA LOJA)
            // ATENÇÃO: O .where('lojaId') TEM QUE VIR ANTES
            const pedidosSnapshot = await db.collection('pedidos')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .where('data', '>=', startDate)
                .where('data', '<=', endDate)
                .get();
            
            // B. Buscar Pedidos "Novos" em tempo real (KPI)
            const novosPedidosSnapshot = await db.collection('pedidos')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .where('status', '==', 'novo')
                .get();
            
            // C. Buscar Histórico para contar Clientes Novos (Pesado, idealmente otimizar no futuro)
            // Aqui buscamos TUDO dessa loja para saber se o cliente é novo
            const clientesSnapshot = await db.collection('pedidos')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .get();

            // D. Buscar Produtos e Categorias para referência (DA MINHA LOJA)
            const [produtosSnap, categoriasSnap] = await Promise.all([
                db.collection('produtos').where('lojaId', '==', LOJA_ATUAL).get(),
                db.collection('categorias').where('lojaId', '==', LOJA_ATUAL).get()
            ]);

            // --- PROCESSAMENTO ---
            let faturamentoTotal = 0;
            let totalPedidos = 0;
            const vendasPorDia = {};
            const vendasPorHora = Array(24).fill(0);
            const metodosPagamento = {};
            const produtosVendidos = {};
            const clientesNoPeriodo = new Set();
            const clientesAntigos = new Set();

            // Mapas auxiliares
            const mapaProdutos = new Map();
            produtosSnap.docs.forEach(doc => mapaProdutos.set(doc.data().nome, doc.data().categoriaId));
            
            const mapaCategorias = new Map();
            categoriasSnap.docs.forEach(doc => mapaCategorias.set(doc.id, doc.data().nome));
            
            const faturamentoPorCategoria = {};

            // Identifica quem já era cliente antes dessa data
            clientesSnapshot.forEach(doc => {
                const p = doc.data();
                const dataP = p.data ? p.data.toDate() : (p.criadoEm ? p.criadoEm.toDate() : new Date());
                
                if (dataP < startDate && p.clienteTelefone) {
                    clientesAntigos.add(p.clienteTelefone);
                }
            });

            // Processa os pedidos do período selecionado
            pedidosSnapshot.forEach(doc => {
                const pedido = doc.data();
                if(!pedido.data && !pedido.criadoEm) return; 
                
                const dataPedido = pedido.data ? pedido.data.toDate() : pedido.criadoEm.toDate();
                
                // Só conta se não foi cancelado
                if (pedido.status !== 'cancelado') {
                    faturamentoTotal += pedido.total;
                    
                    // Gráfico Dia
                    const diaMes = dataPedido.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    vendasPorDia[diaMes] = (vendasPorDia[diaMes] || 0) + pedido.total;
                    
                    // Gráfico Hora
                    vendasPorHora[dataPedido.getHours()] += pedido.total;
                    
                    // Gráfico Pagamento
                    const pag = pedido.pagamento || 'Outros';
                    metodosPagamento[pag] = (metodosPagamento[pag] || 0) + 1;

                    // Gráfico Categorias e Tabela Produtos
                    if(pedido.itens) {
                        pedido.itens.forEach(item => {
                            const nome = item.nome || item.prodName;
                            const qtd = parseInt(item.quantidade || item.qty || 1);
                            
                            // Top Produtos
                            produtosVendidos[nome] = (produtosVendidos[nome] || 0) + qtd;

                            // Faturamento Categoria
                            const nomeLimpo = nome.split('(')[0].trim();
                            // Tenta achar a categoria pelo nome do produto
                            // (Isso pode falhar se o nome mudou, mas é uma estimativa)
                            let catId = null;
                            for (let [pName, cId] of mapaProdutos) {
                                if(nomeLimpo.includes(pName)) { catId = cId; break; }
                            }

                            if(catId) {
                                const nomeCat = mapaCategorias.get(catId) || 'Outros';
                                faturamentoPorCategoria[nomeCat] = (faturamentoPorCategoria[nomeCat] || 0) + ((item.preco||0) * qtd);
                            }
                        });
                    }
                }

                totalPedidos++; // Conta cancelados no volume total, mas não no faturamento

                if (pedido.clienteTelefone) {
                    clientesNoPeriodo.add(pedido.clienteTelefone);
                }
            });
            
            // Processa Top Clientes
            const clientesCount = {};
            pedidosSnapshot.docs.forEach(doc => {
                const p = doc.data();
                if (p.status === 'cancelado') return;
                if (!p.clienteTelefone) return;
                
                if (!clientesCount[p.clienteTelefone]) {
                    clientesCount[p.clienteTelefone] = { nome: p.clienteNome, pedidos: 0, total: 0 };
                }
                clientesCount[p.clienteTelefone].pedidos++;
                clientesCount[p.clienteTelefone].total += p.total;
            });

            // --- ATUALIZAÇÃO DA TELA (UI) ---
            
            // KPIs
            if(kpiNovosPedidosEl) kpiNovosPedidosEl.textContent = novosPedidosSnapshot.size;
            kpiFaturamentoEl.textContent = `R$ ${faturamentoTotal.toFixed(2).replace('.', ',')}`;
            kpiPedidosEl.textContent = totalPedidos;
            
            const ticketMedio = totalPedidos > 0 ? faturamentoTotal / totalPedidos : 0;
            kpiTicketMedioEl.textContent = `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`;
            
            const novosClientes = [...clientesNoPeriodo].filter(tel => !clientesAntigos.has(tel)).length;
            kpiNovosClientesEl.textContent = novosClientes;

            // 1. Gráfico Faturamento Diário
            const labelsDias = Object.keys(vendasPorDia).sort();
            const dataDias = labelsDias.map(label => vendasPorDia[label]);
            faturamentoChart = renderChart(faturamentoChart, 'faturamento-chart', 'bar', labelsDias, dataDias, 'Faturamento (R$)');

            // 2. Gráfico Vendas por Hora
            const labelsHoras = Array.from({ length: 24 }, (_, i) => `${i}:00`);
            vendasHoraChart = renderChart(vendasHoraChart, 'vendas-hora-chart', 'line', labelsHoras, vendasPorHora, 'Vendas (R$)');

            // 3. Gráfico Pagamentos
            const labelsPagamentos = Object.keys(metodosPagamento);
            const dataPagamentos = Object.values(metodosPagamento);
            pagamentosChart = renderChart(pagamentosChart, 'pagamentos-chart', 'doughnut', labelsPagamentos, dataPagamentos, 'Pedidos');

            // 4. Gráfico Categorias (Novo)
            if(document.getElementById('categorias-chart')) {
                categoriasChart = renderChart(categoriasChart, 'categorias-chart', 'doughnut', Object.keys(faturamentoPorCategoria), Object.values(faturamentoPorCategoria), 'Faturamento (R$)');
            }

            // Tabela Top Produtos
            const sortedProdutos = Object.entries(produtosVendidos).sort(([, a], [, b]) => b - a).slice(0, 10);
            topProdutosTable.innerHTML = sortedProdutos.length ? '' : '<tr><td colspan="2">Nenhuma venda no período.</td></tr>';
            sortedProdutos.forEach(([nome, qtd]) => {
                topProdutosTable.innerHTML += `<tr><td>${nome}</td><td>${qtd}</td></tr>`;
            });

            // Tabela Top Clientes
            const sortedClientes = Object.values(clientesCount).sort((a, b) => b.total - a.total).slice(0, 10);
            topClientesTable.innerHTML = sortedClientes.length ? '' : '<tr><td colspan="3">Nenhum cliente.</td></tr>';
            sortedClientes.forEach(c => {
                topClientesTable.innerHTML += `<tr><td>${c.nome}</td><td>${c.pedidos}</td><td>R$ ${c.total.toFixed(2).replace('.',',')}</td></tr>`;
            });

        } catch (error) {
            console.error("Erro no dashboard:", error);
            // ERRO COMUM DE ÍNDICE:
            if(error.code === 'failed-precondition') {
                alert("ATENÇÃO: O Dashboard precisa de um Índice no Firebase. \n\nAbra o console (F12), procure o link azul no erro em vermelho e clique nele para criar o índice automaticamente.");
            }
        } finally {
            hideLoader();
        }
    };
    
    // Função genérica para criar gráficos
    function renderChart(chartInstance, canvasId, type, labels, data, label) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        
        if (chartInstance) {
            chartInstance.destroy();
        }

        return new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: [
                        'rgba(106, 90, 249, 0.6)', 
                        'rgba(255, 99, 132, 0.6)',
                        'rgba(54, 162, 235, 0.6)', 
                        'rgba(255, 206, 86, 0.6)',
                        'rgba(75, 192, 192, 0.6)', 
                        'rgba(153, 102, 255, 0.6)'
                    ],
                    borderColor: 'rgba(106, 90, 249, 1)',
                    borderWidth: 1,
                    tension: 0.3, // Suaviza linhas
                    fill: type === 'line' // Preenche área abaixo da linha
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: type === 'doughnut' }
                },
                scales: {
                    y: { beginAtZero: true, display: type !== 'doughnut' }
                }
            }
        });
    }

    // Listeners de Filtro
    periodSelect.addEventListener('change', setDateRange);
    startDateInput.addEventListener('change', loadDashboardData);
    endDateInput.addEventListener('change', loadDashboardData);

    // Inicia
    setDateRange();
});