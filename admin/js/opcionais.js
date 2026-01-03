import { db } from './firebase-config.js';
import { showLoader, hideLoader, openModal, closeModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) {
        console.error("Sessão inválida.");
        return;
    }
    // ------------------------

    if (!document.querySelector('.opcionais-container')) return;

    // SELETORES
    const addGroupBtn = document.getElementById('add-group-btn');
    const groupModal = document.getElementById('group-modal');
    const groupForm = document.getElementById('group-form');
    const groupModalTitle = document.getElementById('group-modal-title');
    const groupIdInput = document.getElementById('group-id');
    const groupNameInput = document.getElementById('group-name');
    const groupSelectionType = document.getElementById('group-selection-type');
    const groupRequiredCheckbox = document.getElementById('group-required');
    
    const gruposList = document.getElementById('grupos-list');
    const itensManager = document.getElementById('itens-manager');
    const noGroupSelected = document.getElementById('no-group-selected');
    const itensGroupTitle = document.getElementById('itens-group-title');
    const addItemForm = document.getElementById('add-item-form');
    const itemNameInput = document.getElementById('item-name');
    const itemPriceInput = document.getElementById('item-price');
    const itensTableBody = document.getElementById('itens-table-body');
    
    let selectedGroupId = null;

    // --- 2. BUSCAR GRUPOS (DA LOJA ATUAL) ---
    const fetchGrupos = async () => {
        showLoader();
        gruposList.innerHTML = '<li style="padding:10px;">Carregando...</li>';
        try {
            // FILTRO SAAS
            const snapshot = await db.collection('gruposOpcionais')
                .where('lojaId', '==', LOJA_ATUAL)
                .orderBy('nome')
                .get();
            
            gruposList.innerHTML = snapshot.empty ? '<li style="padding:10px;">Nenhum grupo criado.</li>' : '';
            
            snapshot.forEach(doc => {
                const group = doc.data();
                const li = document.createElement('li');
                li.className = 'list-group-item';
                li.dataset.id = doc.id;
                li.innerHTML = `
                    <span>${group.nome}</span>
                    <div>
                        <button class="btn-action btn-edit-group" style="margin-right:5px;">✏️</button>
                        <button class="btn-action btn-delete-group" style="color:red;">🗑️</button>
                    </div>`;
                gruposList.appendChild(li);
            });
        } catch (error) { 
            console.error("Erro grupos:", error);
            if(error.code === 'failed-precondition') alert("Falta criar índice no Firebase. Veja o Console.");
        } finally { 
            hideLoader(); 
        }
    };

    // --- 3. SALVAR GRUPO (COM ID DA LOJA) ---
    const saveGrupo = async (data, id) => {
        showLoader();
        
        // VINCULA À LOJA
        data.lojaId = LOJA_ATUAL;

        try {
            if (id) await db.collection('gruposOpcionais').doc(id).update(data);
            else await db.collection('gruposOpcionais').add(data);
            
            closeModal('group-modal');
            fetchGrupos();
        } catch (error) { 
            console.error("Erro salvar grupo:", error); 
            alert("Erro ao salvar.");
        } finally { 
            hideLoader(); 
        }
    };
    
    const deleteGrupo = async (id) => {
        if (!confirm("ATENÇÃO: Isso excluirá o grupo e TODOS os itens dentro dele. Continuar?")) return;
        showLoader();
        try {
            // Deletar subcoleção de itens (Importante limpar para não deixar lixo)
            const itensSnapshot = await db.collection('gruposOpcionais').doc(id).collection('itens').get();
            const batch = db.batch();
            itensSnapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            // Deletar o grupo pai
            await db.collection('gruposOpcionais').doc(id).delete();
            
            // Reseta tela da direita se o grupo deletado estava selecionado
            if (selectedGroupId === id) {
                selectedGroupId = null;
                itensManager.classList.add('hidden');
                noGroupSelected.classList.remove('hidden');
            }
            fetchGrupos();
        } catch(error) { console.error(error); }
        finally { hideLoader(); }
    };

    // --- 4. GERENCIAR ITENS (SUBCOLEÇÃO) ---
    // Os itens ficam DENTRO do grupo, então não precisam de 'lojaId' explícito,
    // pois o grupo pai já pertence à loja.
    const fetchItens = async (groupId) => {
        showLoader();
        itensTableBody.innerHTML = '<tr><td colspan="3">Carregando itens...</td></tr>';
        try {
            const snapshot = await db.collection('gruposOpcionais').doc(groupId).collection('itens').orderBy('nome').get();
            itensTableBody.innerHTML = snapshot.empty ? '<tr><td colspan="3">Nenhum item neste grupo.</td></tr>' : '';
            
            snapshot.forEach(doc => {
                const item = doc.data();
                const preco = typeof item.preco === 'number' ? item.preco.toFixed(2).replace('.', ',') : '0,00';
                itensTableBody.innerHTML += `
                    <tr>
                        <td>${item.nome}</td>
                        <td>R$ ${preco}</td>
                        <td><button class="btn-action btn-delete-item" data-id="${doc.id}" style="color:red;">Excluir</button></td>
                    </tr>`;
            });
        } catch(error) { console.error(error); } 
        finally { hideLoader(); }
    };
    
    const saveItem = async (data) => {
        if (!selectedGroupId) return;
        showLoader();
        try {
            await db.collection('gruposOpcionais').doc(selectedGroupId).collection('itens').add(data);
            addItemForm.reset();
            fetchItens(selectedGroupId);
        } catch (error) { console.error(error); } 
        finally { hideLoader(); }
    };
    
    const deleteItem = async (itemId) => {
        if (!selectedGroupId || !confirm("Excluir este item?")) return;
        showLoader();
        try {
            await db.collection('gruposOpcionais').doc(selectedGroupId).collection('itens').doc(itemId).delete();
            fetchItens(selectedGroupId);
        } catch(error) { console.error(error); } 
        finally { hideLoader(); }
    };

    // --- LISTENERS ---
    addGroupBtn.addEventListener('click', () => {
        groupModalTitle.textContent = 'Novo Grupo';
        groupForm.reset();
        groupIdInput.value = '';
        openModal('group-modal');
    });

    groupForm.addEventListener('submit', e => {
        e.preventDefault();
        saveGrupo({
            nome: groupNameInput.value,
            tipoSelecao: groupSelectionType.value,
            obrigatorio: groupRequiredCheckbox.checked
        }, groupIdInput.value);
    });

    gruposList.addEventListener('click', async e => {
        // Lógica para clicar no botão ou no item da lista
        const targetBtn = e.target.closest('button');
        const li = e.target.closest('.list-group-item');
        if (!li) return;
        const id = li.dataset.id;

        if (targetBtn && targetBtn.classList.contains('btn-edit-group')) {
            showLoader();
            const doc = await db.collection('gruposOpcionais').doc(id).get();
            const group = doc.data();
            groupModalTitle.textContent = 'Editar Grupo';
            groupIdInput.value = id;
            groupNameInput.value = group.nome;
            groupSelectionType.value = group.tipoSelecao;
            groupRequiredCheckbox.checked = group.obrigatorio;
            hideLoader();
            openModal('group-modal');
        } 
        else if (targetBtn && targetBtn.classList.contains('btn-delete-group')) {
            deleteGrupo(id);
        } 
        else {
            // Selecionar grupo para ver itens
            selectedGroupId = id;
            document.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            
            const groupName = li.querySelector('span').textContent;
            itensGroupTitle.textContent = `Itens de: ${groupName}`;
            noGroupSelected.classList.add('hidden');
            itensManager.classList.remove('hidden');
            
            fetchItens(selectedGroupId);
        }
    });
    
    addItemForm.addEventListener('submit', e => {
        e.preventDefault();
        saveItem({ 
            nome: itemNameInput.value, 
            preco: parseFloat(itemPriceInput.value) || 0 
        });
    });
    
    itensTableBody.addEventListener('click', e => {
        if (e.target.classList.contains('btn-delete-item')) deleteItem(e.target.dataset.id);
    });

    // Fechar Modal
    const modalEl = document.getElementById('group-modal');
    if(modalEl) {
        modalEl.querySelectorAll('.close-modal-btn, .cancel-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal('group-modal'));
        });
    }
    
    // Inicia
    fetchGrupos();
});