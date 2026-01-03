import { db } from './firebase-config.js';
import { showLoader, hideLoader } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS: PEGAR ID DA LOJA ---
    // A variável LOJA_ATUAL é definida AQUI e só existe dentro deste bloco
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');

    if (!LOJA_ATUAL) {
        console.error("Loja não identificada. Redirecionando...");
        // window.location.href = 'index.html'; // Comentado para não travar seu teste se der erro
        return;
    }

    console.log("🔧 Configurações carregadas para a loja:", LOJA_ATUAL);

    // --- 2. LÓGICA DAS ABAS (TABS) ---
    if (document.querySelector('.tabs-container')) {
        const tabs = document.querySelectorAll('.tab-link');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(item => item.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
            });
        });
    }

    // --- 3. ELEMENTOS DA TELA (Mapeando tudo) ---
    
    // Aba 1: Informações
    const infoLojaForm = document.getElementById('info-loja-form');
    const inputsInfo = {
        nome: document.getElementById('loja-nome'),
        endereco: document.getElementById('loja-endereco'),
        telefone: document.getElementById('loja-telefone'),
        logoUrl: document.getElementById('loja-logo-url'),
        coverUrl: document.getElementById('loja-cover-url'),
        pixelId: document.getElementById('loja-pixel-id'),
        lat: document.getElementById('loja-lat'),
        lng: document.getElementById('loja-lng')
    };
    const btnGetCoords = document.getElementById('btn-get-coords');

    // Aba 2: Horários
    const horariosForm = document.getElementById('horarios-form');
    const horariosGrid = document.querySelector('.horarios-grid');
    const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    // Aba 3: Outros
    const outrosConfigForm = document.getElementById('outros-config-form');
    const minPedidoInput = document.getElementById('loja-min-pedido');
    const autoApproveCheck = document.getElementById('auto-approve');

    // --- 4. GERAR HTML DOS HORÁRIOS (Automático) ---
    if (horariosGrid) {
        horariosGrid.innerHTML = ''; // Limpa antes de criar
        diasSemana.forEach((dia, index) => {
            horariosGrid.innerHTML += `
                <div class="horario-dia" style="display:flex; align-items:center; gap:10px; margin-bottom:10px; padding:10px; background:var(--bg-body); border-radius:8px;">
                    <label class="checkbox-label" style="width:100px; font-weight:bold;">
                        <input type="checkbox" data-dia="${index}" name="aberto"> ${dia}
                    </label>
                    <input type="time" data-dia="${index}" name="inicio" class="form-control" disabled>
                    <span>até</span>
                    <input type="time" data-dia="${index}" name="fim" class="form-control" disabled>
                </div>`;
        });
        
        // Ativar/Desativar inputs ao clicar no checkbox
        horariosGrid.addEventListener('change', e => {
            if (e.target.name === 'aberto') {
                const idx = e.target.dataset.dia;
                const inputs = horariosGrid.querySelectorAll(`input[type="time"][data-dia="${idx}"]`);
                inputs.forEach(i => i.disabled = !e.target.checked);
            }
        });
    }

    // --- 5. FUNÇÃO PARA CARREGAR TUDO DO BANCO ---
    const loadAllConfigs = async () => {
        showLoader();
        try {
            // BUSCA INTELIGENTE: Pega tudo de uma vez no documento da loja
            const doc = await db.collection('configuracoes').doc(LOJA_ATUAL).get();
            
            if (doc.exists) {
                const data = doc.data();

                // > Preencher Aba 1 (Info)
                if(inputsInfo.nome) inputsInfo.nome.value = data.nome || '';
                if(inputsInfo.endereco) inputsInfo.endereco.value = data.endereco || '';
                if(inputsInfo.telefone) inputsInfo.telefone.value = data.telefone || '';
                if(inputsInfo.logoUrl) inputsInfo.logoUrl.value = data.logoUrl || '';
                if(inputsInfo.coverUrl) inputsInfo.coverUrl.value = data.coverUrl || '';
                if(inputsInfo.pixelId) inputsInfo.pixelId.value = data.pixelId || '';
                if(inputsInfo.lat) inputsInfo.lat.value = data.lat || '';
                if(inputsInfo.lng) inputsInfo.lng.value = data.lng || '';

                // Atualiza Título do Menu Lateral
                const tituloSite = document.querySelector('.sidebar-header h3');
                if(tituloSite && data.nome) tituloSite.textContent = data.nome;

                // > Preencher Aba 2 (Horários)
                if (data.horarios) {
                    diasSemana.forEach((_, index) => {
                        const diaData = data.horarios[index];
                        if (diaData) {
                            const chk = horariosGrid.querySelector(`input[type="checkbox"][data-dia="${index}"]`);
                            const inputs = horariosGrid.querySelectorAll(`input[type="time"][data-dia="${index}"]`);
                            
                            if(chk) {
                                chk.checked = diaData.aberto;
                                inputs.forEach(i => i.disabled = !diaData.aberto);
                            }
                            if(inputs[0]) inputs[0].value = diaData.inicio;
                            if(inputs[1]) inputs[1].value = diaData.fim;
                        }
                    });
                }

                // > Preencher Aba 3 (Outros)
                if(minPedidoInput) minPedidoInput.value = data.pedidoMinimo || '';
                if(autoApproveCheck) autoApproveCheck.checked = data.aprovacaoAutomatica === true;
                
                // Tema e Estoque (Radio Buttons)
                const themeRadio = document.querySelector(`input[name="theme-choice"][value="${data.temaPadrao || 'light'}"]`);
                if (themeRadio) themeRadio.checked = true;
                
                const estoqueRadio = document.querySelector(`input[name="estoque-behavior"][value="${data.comportamentoEstoque || 'mostrar'}"]`);
                if (estoqueRadio) estoqueRadio.checked = true;

                // Aplica o tema na hora
                if(data.temaPadrao === 'dark') document.body.classList.add('dark-mode');
                else document.body.classList.remove('dark-mode');
            }

        } catch (e) {
            console.error("Erro ao carregar configurações:", e);
        } finally {
            hideLoader();
        }
    };

    // --- 6. SALVAR ABA 1 (INFORMAÇÕES) ---
    if (infoLojaForm) {
        infoLojaForm.addEventListener('submit', async e => {
            e.preventDefault();
            showLoader();
            try {
                await db.collection('configuracoes').doc(LOJA_ATUAL).set({
                    nome: inputsInfo.nome.value,
                    endereco: inputsInfo.endereco.value,
                    telefone: inputsInfo.telefone.value,
                    logoUrl: inputsInfo.logoUrl ? inputsInfo.logoUrl.value : '',
                    coverUrl: inputsInfo.coverUrl ? inputsInfo.coverUrl.value : '',
                    pixelId: inputsInfo.pixelId ? inputsInfo.pixelId.value : '',
                    lat: inputsInfo.lat.value,
                    lng: inputsInfo.lng.value,
                    lojaId: LOJA_ATUAL // Segurança extra
                }, { merge: true }); // 'merge: true' não apaga os horários/outros
                
                alert('Informações salvas com sucesso!');
                // Atualiza visualmente o nome
                const tituloSite = document.querySelector('.sidebar-header h3');
                if(tituloSite) tituloSite.textContent = inputsInfo.nome.value;

            } catch (error) { console.error(error); alert('Erro ao salvar.'); } 
            finally { hideLoader(); }
        });
    }

    // --- 7. SALVAR ABA 2 (HORÁRIOS) ---
    if (horariosForm) {
        horariosForm.addEventListener('submit', async e => {
            e.preventDefault();
            showLoader();
            try {
                const hData = {};
                horariosGrid.querySelectorAll('.horario-dia').forEach(el => {
                    const idx = el.querySelector('input[type="checkbox"]').dataset.dia;
                    hData[idx] = {
                        aberto: el.querySelector('input[name="aberto"]').checked,
                        inicio: el.querySelector('input[name="inicio"]').value,
                        fim: el.querySelector('input[name="fim"]').value
                    };
                });

                await db.collection('configuracoes').doc(LOJA_ATUAL).set({
                    horarios: hData
                }, { merge: true });

                alert('Horários salvos com sucesso!');
            } catch (error) { console.error(error); alert('Erro ao salvar horários.'); }
            finally { hideLoader(); }
        });
    }

    // --- 8. SALVAR ABA 3 (OUTROS) ---
    if (outrosConfigForm) {
        outrosConfigForm.addEventListener('submit', async e => {
            e.preventDefault();
            showLoader();
            try {
                const estoque = document.querySelector('input[name="estoque-behavior"]:checked')?.value || 'mostrar';
                const theme = document.querySelector('input[name="theme-choice"]:checked')?.value || 'light';
                const minVal = parseFloat(minPedidoInput.value) || 0;
                const autoApprove = autoApproveCheck.checked;

                await db.collection('configuracoes').doc(LOJA_ATUAL).set({
                    comportamentoEstoque: estoque,
                    temaPadrao: theme,
                    pedidoMinimo: minVal,
                    aprovacaoAutomatica: autoApprove
                }, { merge: true });

                // Aplica tema na hora para ver o efeito
                if(theme === 'dark') document.body.classList.add('dark-mode');
                else document.body.classList.remove('dark-mode');
                localStorage.setItem('theme', theme);

                alert('Configurações de sistema salvas!');
            } catch (error) { console.error(error); alert('Erro ao salvar.'); }
            finally { hideLoader(); }
        });
    }

    // --- 9. BOTÃO DE GPS ---
    if(btnGetCoords) {
        btnGetCoords.addEventListener('click', () => {
            if (!navigator.geolocation) return alert('Seu navegador não suporta GPS.');
            btnGetCoords.textContent = 'Buscando...';
            navigator.geolocation.getCurrentPosition((pos) => {
                inputsInfo.lat.value = pos.coords.latitude;
                inputsInfo.lng.value = pos.coords.longitude;
                btnGetCoords.textContent = '📍 Posição Atualizada!';
            }, () => { 
                alert('Erro ao obter localização. Permita o acesso ao GPS.'); 
                btnGetCoords.textContent = '📍 Pegar Minha Posição';
            });
        });
    }

    // --- 10. GERAR LINK DE COMPARTILHAMENTO ---
    // Esta função agora está dentro do evento DOMContentLoaded, onde LOJA_ATUAL existe.
    const setupShareLink = () => {
        const linkInput = document.getElementById('link-loja-input');
        const btnCopy = document.getElementById('btn-copy-link');
        const btnOpen = document.getElementById('btn-open-link');

        if (!linkInput) return;

        // Monta o link: Dominio do site + /menu.html?loja=ID_DA_LOJA
        const baseUrl = window.location.origin; 
        const fullLink = `${baseUrl}/menu.html?loja=${LOJA_ATUAL}`;

        // Preenche os campos
        linkInput.value = fullLink;
        btnOpen.href = fullLink;

        // Função de Copiar
        btnCopy.addEventListener('click', () => {
            linkInput.select();
            linkInput.setSelectionRange(0, 99999); // Para celular

            navigator.clipboard.writeText(fullLink).then(() => {
                const originalText = btnCopy.innerText;
                btnCopy.innerText = "✅ Copiado!";
                btnCopy.style.backgroundColor = "#28a745";
                btnCopy.style.color = "#fff";
                
                setTimeout(() => {
                    btnCopy.innerText = originalText;
                    btnCopy.style.backgroundColor = ""; // Volta a cor original (CSS)
                    btnCopy.style.color = "";
                }, 2000);
            }).catch(err => {
                // Fallback antigo se navigator falhar (alguns browsers bloqueiam sem HTTPS)
                try {
                    document.execCommand('copy');
                    alert("Link copiado!");
                } catch (e) {
                    alert("Erro ao copiar link. Copie manualmente: " + fullLink);
                }
            });
        });
    };

    // Chama as funções iniciais
    setupShareLink();
    loadAllConfigs();
});