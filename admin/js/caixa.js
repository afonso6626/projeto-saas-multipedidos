import { db, auth } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) {
        console.error("Sessão inválida.");
        return;
    }
    // ------------------------

    const viewFechado = document.getElementById('caixa-fechado-view');
    const viewAberto = document.getElementById('caixa-aberto-view');
    
    // Elementos de Valor
    const elValInicial = document.getElementById('val-inicial');
    const elValVendas = document.getElementById('val-vendas');
    const elValSaidas = document.getElementById('val-saidas');
    const elSaldoAtual = document.getElementById('val-saldo-atual');
    
    const tbodyMovimentos = document.getElementById('movimentacoes-tbody');
    const tbodyPagamentos = document.getElementById('resumo-pagamentos-tbody');

    let caixaAtualId = null;
    let dadosCaixa = null;

    const formatMoney = (val) => `R$ ${parseFloat(val || 0).toFixed(2).replace('.', ',')}`;

    // --- 2. VERIFICAR STATUS DO CAIXA (DA LOJA ATUAL) ---
    const checkStatusCaixa = async () => {
        showLoader();
        try {
            // BUSCA BLINDADA: Apenas caixas desta loja que estão abertos (fechamento == null)
            const snapshot = await db.collection('fluxo_caixa')
                .where('lojaId', '==', LOJA_ATUAL) 
                .where('fechamento', '==', null)
                .limit(1)
                .get();

            if (snapshot.empty) {
                // Nenhum caixa aberto
                viewFechado.classList.remove('hidden');
                viewAberto.classList.add('hidden');
                caixaAtualId = null;
            } else {
                // Caixa encontrado
                const doc = snapshot.docs[0];
                caixaAtualId = doc.id;
                dadosCaixa = doc.data();
                viewFechado.classList.add('hidden');
                viewAberto.classList.remove('hidden');
                await carregarDadosCaixa(dadosCaixa);
            }
        } catch (error) {
            console.error("Erro caixa:", error);
            if(error.code === 'failed-precondition') alert("Falta criar índice no Firebase (Fluxo Caixa). Veja o console.");
        } finally {
            hideLoader();
        }
    };

    // --- 3. CARREGAR DADOS FINANCEIROS ---
    const carregarDadosCaixa = async (caixa) => {
        const inicio = caixa.abertura.toDate();
        
        // Busca pedidos DESTA LOJA feitos após a abertura do caixa
        const pedidosSnap = await db.collection('pedidos')
            .where('lojaId', '==', LOJA_ATUAL) // <--- FILTRO IMPORTANTE
            .where('data', '>=', inicio)
            .get();

        let totalVendasDinheiro = 0;
        let totalVendasGeral = 0;
        const resumoPagamentos = {};

        pedidosSnap.forEach(doc => {
            const p = doc.data();
            if (p.status === 'cancelado') return; // Ignora cancelados

            const metodoPagamento = p.pagamento || 'Outros';
            resumoPagamentos[metodoPagamento] = (resumoPagamentos[metodoPagamento] || 0) + p.total;
            
            totalVendasGeral += p.total;
            
            // Se for dinheiro, soma no saldo da gaveta
            if (metodoPagamento.toLowerCase().includes('dinheiro')) {
                totalVendasDinheiro += p.total;
            }
        });

        // Processa Movimentações (Sangrias/Suprimentos)
        let totalSuprimentos = 0;
        let totalSangrias = 0;
        let htmlMov = '';

        const movimentos = caixa.movimentacoes || [];
        movimentos.forEach(m => {
            const val = parseFloat(m.valor);
            if (m.tipo === 'suprimento') totalSuprimentos += val;
            if (m.tipo === 'sangria') totalSangrias += val;
            
            // Tratamento de data seguro
            let dataMov;
            if (m.data && m.data.seconds) dataMov = new Date(m.data.seconds * 1000);
            else dataMov = new Date(m.data);

            const hora = dataMov.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
            const cor = m.tipo === 'sangria' ? 'var(--danger-color)' : 'var(--success-color)';
            
            htmlMov += `<tr>
                <td>${hora}</td>
                <td style="color:${cor}; font-weight:bold; text-transform:capitalize;">${m.tipo}</td>
                <td>${m.descricao}</td>
                <td>${formatMoney(val)}</td>
            </tr>`;
        });

        // Cálculo Final da Gaveta
        const saldoInicial = caixa.saldoInicial;
        const saldoDinheiroAtual = saldoInicial + totalVendasDinheiro + totalSuprimentos - totalSangrias;

        // Atualiza Tela
        elValInicial.innerText = formatMoney(saldoInicial);
        elValVendas.innerText = `+ ${formatMoney(totalVendasGeral)}`;
        elValSaidas.innerText = `- ${formatMoney(totalSangrias)}`;
        elSaldoAtual.innerText = formatMoney(saldoDinheiroAtual);
        
        tbodyMovimentos.innerHTML = htmlMov || '<tr><td colspan="4" style="text-align:center;">Nenhuma movimentação.</td></tr>';

        let htmlPag = '';
        for (const [metodo, valor] of Object.entries(resumoPagamentos)) {
            htmlPag += `<tr><td>${metodo}</td><td><strong>${formatMoney(valor)}</strong></td></tr>`;
        }
        tbodyPagamentos.innerHTML = htmlPag || '<tr><td colspan="2" style="text-align:center;">Nenhuma venda ainda.</td></tr>';

        // Atualiza input escondido no modal de fechar
        const elEsperado = document.getElementById('valor-esperado-fechamento');
        if(elEsperado) {
            elEsperado.innerText = formatMoney(saldoDinheiroAtual);
            elEsperado.dataset.val = saldoDinheiroAtual;
        }
    };

    // --- 4. AÇÕES ---

    // Botão Abrir
    const btnAbrir = document.getElementById('btn-abrir-caixa-modal');
    if(btnAbrir) {
        btnAbrir.addEventListener('click', () => {
            document.getElementById('form-abrir-caixa').reset();
            openModal('abrir-caixa-modal');
        });
    }

    // Confirmar Abertura
    const formAbrir = document.getElementById('form-abrir-caixa');
    if(formAbrir) {
        formAbrir.addEventListener('submit', async (e) => {
            e.preventDefault();
            const valorIni = parseFloat(document.getElementById('valor-abertura').value);
            
            showLoader();
            try {
                // CRIA O CAIXA VINCULADO À LOJA
                await db.collection('fluxo_caixa').add({
                    lojaId: LOJA_ATUAL, // <--- VINCULAÇÃO
                    abertura: firebase.firestore.FieldValue.serverTimestamp(),
                    fechamento: null,
                    saldoInicial: valorIni,
                    usuario: auth.currentUser ? auth.currentUser.email : 'anonimo',
                    movimentacoes: []
                });
                closeModal('abrir-caixa-modal');
                checkStatusCaixa();
            } catch (err) {
                console.error(err);
                alert("Erro ao abrir caixa.");
            } finally { hideLoader(); }
        });
    }

    // Sangria / Suprimento
    const openMovModal = (tipo) => {
        document.getElementById('form-movimento').reset();
        document.getElementById('movimento-tipo').value = tipo;
        document.getElementById('movimento-title').innerText = tipo === 'sangria' ? 'Registrar Sangria (Retirada)' : 'Registrar Suprimento (Entrada)';
        openModal('movimento-modal');
    };

    const btnSangria = document.getElementById('btn-sangria');
    const btnSuprimento = document.getElementById('btn-suprimento');
    
    if(btnSangria) btnSangria.addEventListener('click', () => openMovModal('sangria'));
    if(btnSuprimento) btnSuprimento.addEventListener('click', () => openMovModal('suprimento'));

    const formMovimento = document.getElementById('form-movimento');
    if(formMovimento) {
        formMovimento.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!caixaAtualId) return;

            const tipo = document.getElementById('movimento-tipo').value;
            const valor = parseFloat(document.getElementById('movimento-valor').value);
            const desc = document.getElementById('movimento-desc').value;

            const novaMov = {
                tipo: tipo,
                valor: valor,
                descricao: desc,
                data: new Date()
            };

            showLoader();
            try {
                await db.collection('fluxo_caixa').doc(caixaAtualId).update({
                    movimentacoes: firebase.firestore.FieldValue.arrayUnion(novaMov)
                });
                closeModal('movimento-modal');
                // Recarrega os dados para atualizar o saldo na tela
                const doc = await db.collection('fluxo_caixa').doc(caixaAtualId).get();
                carregarDadosCaixa(doc.data());
            } catch (err) { console.error(err); alert("Erro ao salvar."); }
            finally { hideLoader(); }
        });
    }

    // Fechar Caixa
    const btnFechar = document.getElementById('btn-fechar-caixa-modal');
    if(btnFechar) {
        btnFechar.addEventListener('click', () => openModal('fechar-caixa-modal'));
    }

    const formFechar = document.getElementById('form-fechar-caixa');
    if(formFechar) {
        formFechar.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!caixaAtualId) return;

            const valorConferido = parseFloat(document.getElementById('valor-fechamento').value);
            const valorEsperado = parseFloat(document.getElementById('valor-esperado-fechamento').dataset.val || 0);
            const diferenca = valorConferido - valorEsperado;

            if (diferenca !== 0) {
                if (!confirm(`Diferença de ${formatMoney(diferenca)}. Confirmar fechamento?`)) return;
            }

            showLoader();
            try {
                await db.collection('fluxo_caixa').doc(caixaAtualId).update({
                    fechamento: firebase.firestore.FieldValue.serverTimestamp(),
                    saldoFinalInformado: valorConferido,
                    diferenca: diferenca
                });
                closeModal('fechar-caixa-modal');
                alert("Caixa fechado com sucesso!");
                checkStatusCaixa();
            } catch (err) {
                console.error(err);
                alert("Erro ao fechar caixa.");
            } finally { hideLoader(); }
        });
    }

    // Inicia a verificação
    checkStatusCaixa();
});