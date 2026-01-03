import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. SEGURANÇA: PEGAR A LOJA E A FUNÇÃO ATUAL ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    const MINHA_FUNCAO = sessionStorage.getItem('USER_ROLE'); 

    if (!document.getElementById('users-table-body')) return;

    // Apenas Dono pode ver essa tela
    if (MINHA_FUNCAO !== 'dono') {
        alert("Acesso negado: Apenas o dono pode gerenciar usuários.");
        window.location.href = 'dashboard.html';
        return;
    }

    // --- SELETORES ---
    const tableBody = document.getElementById('users-table-body');
    const addBtn = document.getElementById('add-user-btn');
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');
    const modalTitle = document.getElementById('modal-title');
    const idInput = document.getElementById('user-id'); // Usado para edição
    const nameInput = document.getElementById('user-name');
    const emailInput = document.getElementById('user-email-input');
    const passwordInput = document.getElementById('user-password');
    const roleSelect = document.getElementById('user-role');

    // --- LISTAR USUÁRIOS ---
    const fetchUsers = async () => {
        showLoader();
        try {
            const snapshot = await db.collection('funcionarios')
                .where('lojaId', '==', LOJA_ATUAL)
                .get();
            
            tableBody.innerHTML = '';
            
            if (snapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="4">Nenhum funcionário cadastrado.</td></tr>';
            }

            snapshot.forEach(doc => {
                const user = doc.data();
                const role = (user.funcao || 'atendente').toLowerCase();
                
                let badgeClass = 'badge-atendente';
                if (role === 'dono') badgeClass = 'badge-dono';
                
                // Só permite editar/excluir se não for o próprio dono logado (opcional)
                let buttonsHtml = `
                    <button class="btn-action btn-delete" data-id="${doc.id}" data-role="${role}" style="color:red">🗑️</button>
                `;

                tableBody.innerHTML += `
                    <tr>
                        <td>${user.nome}</td>
                        <td>${user.email}</td>
                        <td><span class="status-badge ${badgeClass}" style="background-color:${role==='dono'?'#dc3545':'#17a2b8'}">${role.toUpperCase()}</span></td>
                        <td>${buttonsHtml}</td>
                    </tr>
                `;
            });
        } catch (error) { console.error(error); } finally { hideLoader(); }
    };

    // --- SALVAR USUÁRIO (CHAMANDO O SERVIDOR) ---
    const saveUser = async () => {
        const userData = {
            nome: nameInput.value,
            email: emailInput.value,
            senha: passwordInput.value,
            funcao: roleSelect.value,
            lojaId: LOJA_ATUAL // Envia o ID da loja para o servidor saber de quem é
        };

        if (userData.senha.length < 6) {
            alert("A senha deve ter no mínimo 6 caracteres.");
            return;
        }

        showLoader();
        try {
            // Chama o seu Backend (Server.js)
            const response = await fetch('http://localhost:3000/api/admin/criar-funcionario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            const result = await response.json();

            if (result.sucesso) {
                alert("Funcionário criado com sucesso!");
                closeModal('user-modal');
                fetchUsers();
            } else {
                alert("Erro: " + result.erro);
            }

        } catch (error) { 
            console.error(error);
            alert("Erro de conexão com o servidor.");
        } finally { hideLoader(); }
    };

    // --- LISTENERS ---
    addBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Novo Funcionário';
        form.reset();
        idInput.value = '';
        roleSelect.value = 'atendente'; 
        openModal('user-modal');
    });

    form.addEventListener('submit', e => {
        e.preventDefault();
        // Se tiver ID, seria edição (não implementado no backend ainda para simplificar)
        // Por enquanto, focamos em criar novos corretamente
        if(!idInput.value) {
            saveUser();
        } else {
            alert("Edição de email/senha não permitida por segurança. Exclua e crie novamente.");
        }
    });

    tableBody.addEventListener('click', async e => {
        if (e.target.classList.contains('btn-delete')) {
            const id = e.target.dataset.id;
            const role = e.target.dataset.role;
            
            if (role === 'dono') return alert("Não é possível excluir o dono.");
            if (!confirm("Tem certeza? O funcionário perderá o acesso imediatamente.")) return;

            // Para excluir, podemos fazer direto no banco, mas o login dele continuará existindo no Auth
            // O ideal seria uma rota no backend para excluir do Auth também.
            // Mas como deletamos do banco, o 'fallback' de segurança falha e ele não entra mais.
            showLoader();
            await db.collection('funcionarios').doc(id).delete();
            fetchUsers();
            hideLoader();
        }
    });

    // Fechar Modal
    const closeBtns = document.querySelectorAll('.close-modal-btn, .cancel-modal-btn');
    closeBtns.forEach(btn => btn.addEventListener('click', () => closeModal('user-modal')));

    fetchUsers();
});