import { db } from './firebase-config.js';
import { showLoader, hideLoader } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) return;
    // ----------------------

    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    const fetchLogs = async () => {
        showLoader();
        tbody.innerHTML = '<tr><td colspan="4">Carregando logs...</td></tr>';
        
        try {
            // QUERY BLINDADA: where('lojaId', '==', LOJA_ATUAL)
            const snapshot = await db.collection('logs_auditoria')
                .where('lojaId', '==', LOJA_ATUAL)
                .orderBy('data', 'desc')
                .limit(50)
                .get();

            tbody.innerHTML = '';
            if (snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="4">Nenhuma atividade recente.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const log = doc.data();
                const date = log.data ? new Date(log.data.seconds * 1000).toLocaleString('pt-BR') : '-';
                
                // Cores para facilitar leitura
                let colorClass = '';
                if(log.acao.includes('Cancelado')) colorClass = 'color:red; font-weight:bold;';
                if(log.acao.includes('Finalizado')) colorClass = 'color:green;';

                tbody.innerHTML += `
                    <tr>
                        <td style="font-size:0.85rem">${date}</td>
                        <td><strong>${log.usuario}</strong></td>
                        <td style="${colorClass}">${log.acao}</td>
                        <td style="color: var(--text-light)">${log.detalhes}</td>
                    </tr>
                `;
            });

        } catch (error) {
            console.error("Erro logs:", error);
            if(error.code === 'failed-precondition') alert("Falta índice no Firebase (Logs). Veja o console.");
            tbody.innerHTML = '<tr><td colspan="4">Erro ao carregar.</td></tr>';
        } finally {
            hideLoader();
        }
    };

    fetchLogs();
});