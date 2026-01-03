import { db } from './firebase-config.js';
import { showLoader, hideLoader } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) return;
    // ----------------------

    if (!document.getElementById('gerar-relatorio-btn')) return;

    const startDateInput = document.getElementById('start-date-relatorio');
    const endDateInput = document.getElementById('end-date-relatorio');
    const gerarBtn = document.getElementById('gerar-relatorio-btn');

    let produtosChart = null;
    let pagamentoChart = null;
    let categoriasChart = null;

    const generateReports = async () => {
        showLoader();
        try {
            const startDate = startDateInput.value ? new Date(startDateInput.value + 'T00:00:00') : null;
            const endDate = endDateInput.value ? new Date(endDateInput.value + 'T23:59:59') : null;

            if (!startDate || !endDate) {
                alert("Selecione o período.");
                hideLoader();
                return;
            }
            
            // --- BUSCAS BLINDADAS (SAAS) ---
            const [pedidosSnapshot, produtosSnapshot, categoriasSnapshot] = await Promise.all([
                // Busca Pedidos da Loja
                db.collection('pedidos')
                    .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                    .where('data', '>=', startDate)
                    .where('data', '<=', endDate)
                    .get(),
                
                // Busca Produtos (para pegar categoria)
                db.collection('produtos')
                    .where('lojaId', '==', LOJA_ATUAL) // <--- Opcional se produtos forem globais, mas ideal filtrar
                    .get(),
                
                // Busca Categorias
                db.collection('categorias')
                    .where('lojaId', '==', LOJA_ATUAL)
                    .get()
            ]);
            
            const pedidos = pedidosSnapshot.docs.map(doc => doc.data());
            
            processTopProdutos(pedidos);
            processPagamentos(pedidos);
            processTopClientes(pedidos);
            processCategorias(pedidos, produtosSnapshot, categoriasSnapshot);

        } catch (error) {
            console.error("Erro relatórios:", error);
            if(error.code === 'failed-precondition') alert("Falta índice no Firebase. Veja o console.");
        } finally {
            hideLoader();
        }
    };

    function processTopProdutos(pedidos) {
        const produtosCount = {};
        pedidos.forEach(p => {
            if(p.status === 'cancelado') return;
            if(p.itens) {
                p.itens.forEach(item => {
                    produtosCount[item.nome] = (produtosCount[item.nome] || 0) + (item.quantidade || item.qty);
                });
            }
        });
        // Top 10
        const sortedProdutos = Object.entries(produtosCount).sort(([,a],[,b]) => b - a).slice(0, 10);
        
        produtosChart = renderChart('produtos-chart', produtosChart, 'bar', 
            sortedProdutos.map(p => p[0]), 
            sortedProdutos.map(p => p[1]), 
            'Qtd Vendida'
        );
    }

    function processPagamentos(pedidos) {
        const pagamentosCount = {};
        pedidos.forEach(p => {
            if(p.status === 'cancelado') return;
            pagamentosCount[p.pagamento] = (pagamentosCount[p.pagamento] || 0) + p.total;
        });
        
        pagamentoChart = renderChart('pagamento-chart', pagamentoChart, 'doughnut', 
            Object.keys(pagamentosCount), 
            Object.values(pagamentosCount), 
            'Faturamento (R$)'
        );
    }

    function processTopClientes(pedidos) {
        const clientesCount = {};
        pedidos.forEach(p => {
            if(p.status === 'cancelado') return;
            if (!p.clienteTelefone) return;
            
            if (!clientesCount[p.clienteTelefone]) {
                clientesCount[p.clienteTelefone] = { nome: p.clienteNome, pedidos: 0, total: 0 };
            }
            clientesCount[p.clienteTelefone].pedidos++;
            clientesCount[p.clienteTelefone].total += p.total;
        });
        
        const sortedClientes = Object.values(clientesCount).sort((a,b) => b.total - a.total).slice(0, 10);
        const tableBody = document.getElementById('top-clientes-table');
        
        tableBody.innerHTML = '';
        if (sortedClientes.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="3">Nenhum dado.</td></tr>`;
            return;
        }
        sortedClientes.forEach(c => {
            tableBody.innerHTML += `<tr><td>${c.nome}</td><td>${c.pedidos}</td><td>R$ ${c.total.toFixed(2).replace('.',',')}</td></tr>`;
        });
    }

    function processCategorias(pedidos, produtosSnapshot, categoriasSnapshot) {
        // Cria mapas para acesso rápido
        const mapaProdutos = new Map();
        produtosSnapshot.docs.forEach(doc => {
            const p = doc.data();
            mapaProdutos.set(p.nome, p.categoriaId);
        });
        
        const mapaCategorias = new Map(categoriasSnapshot.docs.map(doc => [doc.id, doc.data().nome]));

        const faturamentoPorCategoria = {};

        pedidos.forEach(pedido => {
            if(pedido.status === 'cancelado') return;
            if(pedido.itens) {
                pedido.itens.forEach(item => {
                    const nomeLimpo = item.nome.split('(')[0].trim();
                    const categoriaId = mapaProdutos.get(nomeLimpo);
                    
                    if (categoriaId) {
                        const nomeCategoria = mapaCategorias.get(categoriaId) || 'Outros';
                        const valorItem = (item.preco || 0) * (item.quantidade || item.qty || 1);
                        faturamentoPorCategoria[nomeCategoria] = (faturamentoPorCategoria[nomeCategoria] || 0) + valorItem;
                    }
                });
            }
        });
        
        categoriasChart = renderChart('categorias-chart', categoriasChart, 'doughnut', 
            Object.keys(faturamentoPorCategoria), 
            Object.values(faturamentoPorCategoria), 
            'Por Categoria (R$)'
        );
    }
    
    function renderChart(canvasId, chartInstance, type, labels, data, label) {
        const canvas = document.getElementById(canvasId);
        if(!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        if (chartInstance) chartInstance.destroy();
        
        return new Chart(ctx, {
            type: type,
            data: { 
                labels, 
                datasets: [{ 
                    label, 
                    data, 
                    backgroundColor: ['#6a5af9', '#ff6384', '#36a2eb', '#ffcd56', '#4bc0c0'],
                    borderWidth: 1
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false 
            }
        });
    }

    gerarBtn.addEventListener('click', generateReports);
});