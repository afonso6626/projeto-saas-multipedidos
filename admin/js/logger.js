import { db, auth } from './firebase-config.js';

/**
 * Registra uma ação no histórico de auditoria.
 * @param {string} acao - O título da ação (Ex: "Pedido Cancelado")
 * @param {string} detalhes - Detalhes extras (Ex: "Pedido #12345 valor R$ 50,00")
 */
export const logAction = async (acao, detalhes) => {
    try {
        // Tenta pegar o usuário logado
        const usuario = auth.currentUser ? auth.currentUser.email : 'Sistema/Cliente';
        
        // --- SEGURANÇA SAAS ---
        // Tenta pegar a loja da memória (Painel Admin) 
        // Se não tiver (ex: é o cliente no cardápio), tenta pegar da URL
        let lojaId = sessionStorage.getItem('SAAS_LOJA_ID');
        
        if (!lojaId) {
             const urlParams = new URLSearchParams(window.location.search);
             lojaId = urlParams.get('loja');
        }

        // Só salva o log se soubermos de qual loja é
        if (lojaId) {
            await db.collection('logs_auditoria').add({
                data: firebase.firestore.FieldValue.serverTimestamp(),
                usuario: usuario,
                acao: acao,
                detalhes: detalhes,
                lojaId: lojaId // <--- OBRIGATÓRIO
            });
            // console.log(`[LOG SALVO] ${acao}`);
        }
    } catch (error) {
        console.error("Falha ao salvar log de auditoria:", error);
    }
};