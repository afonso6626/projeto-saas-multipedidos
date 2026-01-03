import { db, auth, googleProvider } from './firebase-config.js';
import { closeModal, openModal } from './ui.js'; 

// ============================================================
// 1. VARIÁVEIS GLOBAIS E UTILITÁRIOS
// ============================================================

const formatMoney = (val) => `R$ ${parseFloat(val || 0).toFixed(2).replace('.', ',')}`;
const cleanPhone = (phone) => phone ? phone.replace(/\D/g, '') : '';

// Variáveis de Controle de Estado
let currentProd = null;       
let selectedVarIndex = 0;
let map = null; 
let marker = null; 
let mapInitialized = false;

// Elementos do DOM (Cache)
const els = {
    loader: document.getElementById('loader'),
    menuSection: document.getElementById('menu-section'),
    nav: document.getElementById('category-nav'),
    cartCountBadge: document.getElementById('cart-count-badge'),
    cartList: document.getElementById('cart-items-container'),
    deliverySelect: document.getElementById('delivery-neighborhood'),
    totalPriceModal: document.getElementById('modal-total-price'),
    addressInput: document.getElementById('delivery-address')
};

// Estado Global da Aplicação
const state = {
    store: { 
        open: true, 
        name: 'Carregando...', 
        phone: '', 
        pointsRate: 1, 
        minOrder: 0 
    },
    cart: [],
    products: [],
    categories: [],
    optionals: [], // Cache dos grupos de opcionais
    delivery: { fee: 0, type: 'delivery' },
    user: null,
    coupon: null,
    lojaId: null 
};

// ============================================================
// 2. INICIALIZAÇÃO (Busca Loja pelo Link)
// ============================================================

async function descobrirIdDaLoja(identificador) {
    if (identificador.length > 20) return identificador;
    try {
        let snapshot = await db.collection('lojas').where('slug', '==', identificador).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].id;
        snapshot = await db.collection('lojas').where('nomeLoja', '==', identificador).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].id;
    } catch (error) { 
        console.error(error); 
    }
    return null;
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const lojaParam = urlParams.get('loja');
    
    if (lojaParam) {
        const idReal = await descobrirIdDaLoja(lojaParam);
        if (idReal) {
            state.lojaId = idReal;
            console.log("Loja ID:", state.lojaId);
            
            setupEventListeners();
            
            // MONITORAMENTO DE AUTH DO FIREBASE
            auth.onAuthStateChanged(async (firebaseUser) => {
                if (firebaseUser) {
                    // Usuário Logado
                    state.user = {
                        uid: firebaseUser.uid,
                        name: firebaseUser.displayName || 'Cliente',
                        email: firebaseUser.email,
                        phone: firebaseUser.phoneNumber || '' 
                    };
                    
                    // Tenta recuperar telefone do localStorage se não vier do Auth
                    const localUser = JSON.parse(localStorage.getItem('client_user') || '{}');
                    if (!state.user.phone && localUser.phone) {
                        state.user.phone = localUser.phone;
                    }
                    
                    renderProfileUI();
                } else {
                    // Usuário Deslogado
                    state.user = null;
                    renderProfileUI();
                }
            });
            
            try {
                await loadStoreConfig(); 
                // CARREGA TUDO: Menu, Taxas e OS OPCIONAIS
                await Promise.all([
                    fetchMenu(),         
                    fetchDeliverySettings(),
                    fetchOptionals() 
                ]);
            } catch(e) { 
                console.error(e); 
            } finally { 
                if(els.loader) els.loader.classList.add('hidden'); 
            }

            renderCategories();
            renderProducts();
            window.updateCartUI(); 
        } else {
            alert("Loja não encontrada!");
            if(els.loader) els.loader.classList.add('hidden');
        }
    }
});

// ============================================================
// 3. BUSCAS NO BANCO DE DADOS
// ============================================================

async function loadStoreConfig() {
    try {
        const doc = await db.collection('configuracoes').doc(state.lojaId).get();
        
        if (doc.exists) {
            const d = doc.data();
            state.store = { ...state.store, ...d };
            
            const nomeExibicao = d.nome || "Lanchonete";
            if(document.getElementById('store-name')) document.getElementById('store-name').textContent = nomeExibicao;
            
            const logoImg = document.getElementById('store-logo');
            if(d.logoUrl && logoImg) logoImg.src = d.logoUrl;
            
            const coverDiv = document.getElementById('header-cover-img');
            if(d.coverUrl && coverDiv) coverDiv.style.backgroundImage = `url('${d.coverUrl}')`;
            
            window.updateStoreStatus(d.aberta);

            if(d.pedidoMinimo) {
                state.store.minOrder = parseFloat(d.pedidoMinimo);
                const minDisplay = document.getElementById('min-order-display');
                if(minDisplay) minDisplay.textContent = formatMoney(state.store.minOrder);
            }
            if (d.fidelidade) state.store.pointsRate = d.fidelidade.pontosPorReal;
            if(d.pixelId) initFacebookPixel(d.pixelId);
        }
    } catch (err) { 
        console.error("Erro config:", err); 
    }
}

const fetchMenu = async () => {
    const cS = await db.collection('categorias').where('lojaId', '==', state.lojaId).orderBy('ordem').get();
    state.categories = cS.docs.map(d => ({id: d.id, ...d.data()}));

    const pS = await db.collection('produtos').where('lojaId', '==', state.lojaId).where('disponivel', '==', true).get();
    const prods = pS.docs.map(d => ({id: d.id, ...d.data()}));
    prods.sort((a,b)=>(a.ordem||0) - (b.ordem||0));
    state.products = prods;
};

// --- BUSCAR GRUPOS DE OPCIONAIS ---
const fetchOptionals = async () => {
    try {
        const snap = await db.collection('gruposOpcionais').where('lojaId', '==', state.lojaId).get();
        const groups = [];
        
        for (const doc of snap.docs) {
            const groupData = { id: doc.id, ...doc.data(), itens: [] };
            const itensSnap = await db.collection('gruposOpcionais').doc(doc.id).collection('itens').get();
            groupData.itens = itensSnap.docs.map(i => ({ id: i.id, ...i.data() }));
            groups.push(groupData);
        }
        state.optionals = groups;
    } catch(e) { 
        console.error("Erro opcionais:", e); 
    }
};

const fetchDeliverySettings = async () => {
    try {
        const s = await db.collection('taxasEntrega')
            .where('lojaId', '==', state.lojaId)
            .orderBy('taxa') // Ordena pelo valor para pegar o menor
            .get();
            
        const elDisplay = document.getElementById('min-delivery-fee');
        
        if(s.empty) {
            if(elDisplay) elDisplay.textContent = "A combinar";
            if(els.deliverySelect) els.deliverySelect.innerHTML = '<option value="">Sem taxas cadastradas</option>';
            return;
        }

        // Mostra "A partir de X" usando a menor taxa encontrada
        const minTaxa = s.docs[0].data().taxa;
        if(elDisplay) elDisplay.textContent = `A partir de ${formatMoney(minTaxa)}`;

        if(els.deliverySelect) {
            let html = '<option value="">Selecione seu Bairro...</option>';
            // Reordena alfabeticamente para o select
            const bairros = s.docs.map(d => d.data()).sort((a,b) => a.bairro.localeCompare(b.bairro));
            
            bairros.forEach(d => {
                html += `<option value="${d.taxa}">${d.bairro} (+ ${formatMoney(d.taxa)})</option>`;
            });
            els.deliverySelect.innerHTML = html;
        }
    } catch(e){ 
        console.error("Erro taxas:", e); 
        const elDisplay = document.getElementById('min-delivery-fee');
        if(elDisplay) elDisplay.textContent = "Sob consulta";
    }
};

// ============================================================
// 4. MAPA (LEAFLET)
// ============================================================

window.openMapModal = () => {
    openModal('map-modal');
    
    if (!mapInitialized) {
        map = L.map('leaflet-map').setView([-23.5505, -46.6333], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
        
        map.on('click', async (e) => {
            updateMarker(e.latlng.lat, e.latlng.lng);
        });
        
        mapInitialized = true;
    }
    
    if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            map.setView([latitude, longitude], 16);
            updateMarker(latitude, longitude);
        });
    }
    
    // Timeout para corrigir renderização do Leaflet quando o modal abre
    setTimeout(() => { 
        if(map) map.invalidateSize(); 
    }, 300);
};

async function updateMarker(lat, lng) {
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);
    
    const inputEnd = document.getElementById('map-search-input');
    inputEnd.value = "Buscando endereço...";

    try {
        // Adiciona headers para tentar evitar bloqueio de CORS
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
            headers: { 'Accept-Language': 'pt-BR' }
        });
        
        if(!res.ok) throw new Error("Erro API");
        
        const data = await res.json();
        if(data.address) {
            const road = data.address.road || data.address.pedestrian || '';
            const number = data.address.house_number || '';
            const suburb = data.address.suburb || data.address.neighbourhood || '';
            inputEnd.value = `${road}, ${number} - ${suburb}`;
        } else {
            inputEnd.value = "Local marcado (digite o número se necessário)";
        }
    } catch(e) { 
        console.log("Erro mapa (CORS ou API):", e);
        // Se der erro, deixa o usuário digitar sem travar
        inputEnd.value = ""; 
        inputEnd.placeholder = "Não foi possível preencher auto. Digite aqui...";
        inputEnd.focus();
    }
}

window.confirmMapLocation = () => {
    const addr = document.getElementById('map-search-input').value;
    if(addr && addr !== "Buscando endereço..." && els.addressInput) {
        els.addressInput.value = addr;
        closeModal('map-modal');
    } else {
        alert("Selecione um local no mapa.");
    }
};

// ============================================================
// 5. RENDERIZAÇÃO E LÓGICA DE PRODUTOS
// ============================================================

const renderCategories = () => {
    if(!els.nav) return;
    els.nav.innerHTML = '';
    state.categories.forEach((c, i) => {
        els.nav.innerHTML += `<button class="cat-btn ${i===0?'active':''}" onclick="scrollToCat('${c.id}', this)">${c.nome}</button>`;
    });
};

const renderProducts = () => {
    if(!els.menuSection) return;
    els.menuSection.innerHTML = '';
    state.categories.forEach(c => {
        const prods = state.products.filter(p => p.categoriaId === c.id);
        if(prods.length === 0) return; 
        
        let html = `<h3 id="cat-${c.id}" class="category-title">${c.nome}</h3>`;
        prods.forEach(p => {
            const minP = p.variacoes && p.variacoes.length > 0 ? Math.min(...p.variacoes.map(v => parseFloat(v.preco))) : 0;
            const img = p.imagemUrl || 'https://via.placeholder.com/150?text=Sem+Imagem';
            
            html += `
            <div class="product-card" onclick="openProduct('${p.id}')">
                <div class="prod-info">
                    <div class="prod-title">${p.nome}</div>
                    <div class="prod-desc">${p.descricao || ''}</div>
                    <div class="prod-price">A partir de ${formatMoney(minP)}</div>
                </div>
                <div class="prod-img-box">
                    <img src="${img}" loading="lazy" alt="${p.nome}">
                </div>
            </div>`;
        });
        els.menuSection.innerHTML += html;
    });
};

window.openProduct = (id) => {
    if(!state.store.open) return alert('A loja está fechada no momento!');
    
    const prod = state.products.find(p => p.id === id);
    if(!prod) return;

    currentProd = prod; 

    document.getElementById('modal-product-name').innerText = prod.nome;
    document.getElementById('modal-product-description').innerText = prod.descricao || '';
    document.getElementById('modal-product-image').src = prod.imagemUrl || 'https://via.placeholder.com/400x300?text=Sem+Imagem';
    
    const varContainer = document.getElementById('modal-variations-section');
    varContainer.innerHTML = '<h4 class="label-title" style="margin:10px 0 5px">Escolha o tamanho</h4>';
    
    if(prod.variacoes && prod.variacoes.length > 0) {
        prod.variacoes.forEach((v, i) => {
            varContainer.innerHTML += `
            <div class="option-item ${i===0?'selected':''}" onclick="selectVar(this, ${i})">
                <span>${v.tamanho}</span> 
                <strong>${formatMoney(v.preco)}</strong>
            </div>`;
        });
        selectedVarIndex = 0;
    }
    
    let optContainer = document.getElementById('modal-optionals-injection');
    if (!optContainer) {
        optContainer = document.createElement('div');
        optContainer.id = 'modal-optionals-injection';
        varContainer.after(optContainer);
    }
    optContainer.innerHTML = '';

    if (prod.gruposOpcionaisIds && prod.gruposOpcionaisIds.length > 0) {
        prod.gruposOpcionaisIds.forEach(groupId => {
            const group = state.optionals.find(g => g.id === groupId);
            if (group) {
                renderOptionalGroup(group, optContainer);
            }
        });
    }
    
    document.getElementById('quantity').value = 1;
    document.getElementById('product-obs').value = ''; 
    window.calcProductTotal(); 
    openModal('product-modal');
};

function renderOptionalGroup(group, container) {
    const inputType = group.tipoSelecao === 'unica' ? 'radio' : 'checkbox';
    const requiredBadge = group.obrigatorio ? '<span style="color:red;font-size:0.8rem;float:right">*Obrigatório</span>' : '';
    
    let html = `
    <div class="optional-group-wrapper" data-id="${group.id}" data-min="${group.obrigatorio ? 1 : 0}" data-max="${group.maximo || 999}" data-name="${group.nome}">
        <div style="margin-top:15px; margin-bottom:5px; border-top:1px solid #eee; padding-top:10px;">
            <h4 class="label-title" style="margin:0">${group.nome} ${requiredBadge}</h4>
        </div>`;
    
    group.itens.forEach(item => {
        const priceHtml = item.preco > 0 ? `+ ${formatMoney(item.preco)}` : 'Grátis';
        const inputName = `opt_group_${group.id}`; 
        
        html += `
        <label class="option-item optional-row" style="padding:10px; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px; width:100%">
                <input type="${inputType}" name="${inputName}" value="${item.id}" data-price="${item.preco}" data-name="${item.nome}" onchange="window.calcProductTotal()">
                <div style="display:flex; justify-content:space-between; width:100%">
                    <span>${item.nome}</span>
                    <span style="font-weight:600; color:var(--green)">${priceHtml}</span>
                </div>
            </div>
        </label>`;
    });
    html += `</div>`;
    container.insertAdjacentHTML('beforeend', html);
}

window.selectVar = (el, idx) => {
    document.querySelectorAll('#modal-variations-section .option-item').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    selectedVarIndex = idx;
    window.calcProductTotal();
};

// --- FUNÇÃO DE CÁLCULO DO PREÇO (CORRIGIDA) ---
window.calcProductTotal = () => {
    if (!currentProd) return;

    let unitPrice = 0;
    
    // 1. Preço da variação selecionada
    if (currentProd.variacoes && currentProd.variacoes[selectedVarIndex]) {
        unitPrice = parseFloat(currentProd.variacoes[selectedVarIndex].preco);
    }

    // 2. Soma os opcionais marcados
    const checkedOpcionais = document.querySelectorAll('#modal-optionals-injection input:checked');
    checkedOpcionais.forEach(input => {
        unitPrice += parseFloat(input.dataset.price || 0);
    });

    // 3. Multiplica pela quantidade
    const qty = parseInt(document.getElementById('quantity').value || 1);
    const total = unitPrice * qty;

    // 4. Atualiza na tela
    const priceEl = document.getElementById('modal-total-price');
    if (priceEl) {
        priceEl.textContent = formatMoney(total);
        priceEl.dataset.total = total; // Guarda o valor numérico para usar no add
    }
};

// --- FUNÇÃO ADICIONAR AO CARRINHO (CORRIGIDA) ---
window.addToCart = () => {
    if (!currentProd) return;

    // Validações de Opcionais
    const groups = document.querySelectorAll('.optional-group-wrapper');
    for (const g of groups) {
        const min = parseInt(g.dataset.min);
        const max = parseInt(g.dataset.max);
        const checked = g.querySelectorAll('input:checked').length;

        if (checked < min) {
            return alert(`Selecione pelo menos ${min} item(s) em: ${g.dataset.name}`);
        }
        if (max > 0 && checked > max) {
            return alert(`Você selecionou itens demais em: ${g.dataset.name}`);
        }
    }

    const v = currentProd.variacoes[selectedVarIndex];
    const qty = parseInt(document.getElementById('quantity').value);
    const obs = document.getElementById('product-obs').value;
    
    const optNames = [];
    document.querySelectorAll('#modal-optionals-injection input:checked').forEach(input => {
        optNames.push(input.dataset.name);
    });

    // Pega o preço calculado
    const totalEl = document.getElementById('modal-total-price');
    const totalValue = parseFloat(totalEl.dataset.total);

    const item = {
        id: Date.now(),
        prodId: currentProd.id,
        prodName: currentProd.nome,
        varName: v.tamanho,
        price: totalValue / qty,
        qty: qty,
        total: totalValue,
        obs: obs,
        optionals: optNames
    };

    state.cart.push(item);
    
    if(typeof fbq === 'function') fbq('track', 'AddToCart');

    window.updateCartUI();
    closeModal('product-modal');
    alert("Item adicionado com sucesso!");
};

// ============================================================
// 6. GESTÃO DE USUÁRIO (LOGIN / CADASTRO / GOOGLE)
// ============================================================

window.showView = (viewId) => {
    // Esconde todas as telas do perfil
    ['login-view', 'signup-view', 'forgot-view', 'user-dashboard-view'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    
    // Mostra a tela desejada
    // Verifica se o ID já tem o sufixo "-view" ou não
    const targetId = viewId.endsWith('-view') ? viewId : viewId + '-view';
    const targetEl = document.getElementById(targetId);
    
    if(targetEl) {
        targetEl.classList.remove('hidden');
    }
    
    // Atualiza título do modal
    const titles = { 
        'login': 'Acesse sua conta', 
        'signup': 'Crie sua conta', 
        'forgot': 'Recuperar Senha', 
        'user-dashboard': 'Meu Perfil' 
    };
    
    const key = viewId.replace('-view','').replace('user-dashboard','user-dashboard');
    const t = titles[key] || titles['user-dashboard'];
    if(t) document.getElementById('profile-title').textContent = t;
};

function renderProfileUI() {
    if (state.user) {
        // LOGADO
        window.showView('user-dashboard');
        document.getElementById('profile-name').textContent = state.user.name;
        document.getElementById('profile-email').textContent = state.user.email;
        
        // Preenche checkout automaticamente
        const nameIn = document.getElementById('customer-name');
        const phoneIn = document.getElementById('customer-phone');
        
        if(nameIn && !nameIn.value) nameIn.value = state.user.name;
        // Se tiver telefone salvo no state (vindo do cadastro ou localStorage), preenche
        if(phoneIn && !phoneIn.value && state.user.phone) phoneIn.value = state.user.phone;
        
        loadOrderHistory(); 
    } else {
        // DESLOGADO (VISITANTE)
        window.showView('login');
    }
}

// CONFIGURAÇÃO DOS BOTÕES DE LOGIN/CADASTRO
const btnGoogle = document.getElementById('btn-google-login');
if(btnGoogle) {
    btnGoogle.addEventListener('click', () => {
        auth.signInWithPopup(googleProvider)
            .then((result) => {
                console.log("Logado com Google:", result.user);
            }).catch((error) => {
                console.error(error);
                alert("Erro ao entrar com Google: " + error.message);
            });
    });
}

const logForm = document.getElementById('client-login-form');
if(logForm) {
    logForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        
        auth.signInWithEmailAndPassword(email, pass)
            .catch(err => {
                alert("Erro no login: " + err.message);
            });
    });
}

const sigForm = document.getElementById('client-signup-form');
if(sigForm) {
    sigForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const pass = document.getElementById('signup-password').value;
        const phone = document.getElementById('signup-phone').value;

        auth.createUserWithEmailAndPassword(email, pass)
            .then((userCredential) => {
                // Atualiza o nome do usuário no Firebase
                userCredential.user.updateProfile({
                    displayName: name
                }).then(() => {
                    // Salva o telefone no localStorage para persistência local
                    if(phone) {
                        localStorage.setItem('client_user', JSON.stringify({ phone: phone }));
                        state.user.phone = phone;
                    }
                });
            })
            .catch((error) => {
                alert("Erro no cadastro: " + error.message);
            });
    });
}

const forgotForm = document.getElementById('forgot-form');
if(forgotForm) {
    forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        
        auth.sendPasswordResetEmail(email)
            .then(() => {
                alert("E-mail de redefinição enviado! Verifique sua caixa de entrada.");
                window.showView('login');
            })
            .catch((error) => {
                alert("Erro: " + error.message);
            });
    });
}

window.clientLogout = () => { 
    auth.signOut(); 
    state.user = null;
    // Limpa dados locais sensíveis, mas pode manter telefone se quiser
    localStorage.removeItem('client_user');
};

// ============================================================
// 7. CHECKOUT E SACOLA
// ============================================================

window.openCart = () => {
    window.updateCartUI();
    const modal = document.getElementById('cart-modal');
    if(modal) modal.classList.remove('hidden');

    // Tenta preencher dados se tiver usuário
    if(state.user) {
        const nameIn = document.getElementById('customer-name');
        const phoneIn = document.getElementById('customer-phone');
        if(nameIn && !nameIn.value) nameIn.value = state.user.name;
        if(phoneIn && !phoneIn.value && state.user.phone) phoneIn.value = state.user.phone;
    }
};

window.updateCartUI = function() {
    let subtotal = state.cart.reduce((a,b) => a + b.total, 0);
    let fee = 0;
    
    const deliveryOption = document.querySelector('input[name="delivery-type"]:checked');
    const isDelivery = deliveryOption ? deliveryOption.value === 'delivery' : true;
    
    if (isDelivery) {
        document.getElementById('address-section').classList.remove('hidden');
        fee = parseFloat(els.deliverySelect?.value || 0);
        if(document.getElementById('cart-delivery-fee')) document.getElementById('cart-delivery-fee').textContent = formatMoney(fee);
    } else {
        document.getElementById('address-section').classList.add('hidden');
        if(document.getElementById('cart-delivery-fee')) document.getElementById('cart-delivery-fee').textContent = 'Grátis';
    }

    let discount = state.coupon ? (state.coupon.tipo === 'percentual' ? subtotal*(state.coupon.valor/100) : state.coupon.valor) : 0;
    const final = subtotal + fee - discount;

    if (els.cartList) {
        els.cartList.innerHTML = state.cart.length ? '' : '<p class="text-center" style="padding:20px;color:#888">Sacola vazia.</p>';
        state.cart.forEach((item, i) => {
            let optHtml = item.optionals && item.optionals.length ? `<br><small style="color:#555">+ ${item.optionals.join(', ')}</small>` : '';
            els.cartList.innerHTML += `
            <div class="cart-item">
                <div>
                    <div style="font-weight:600">${item.qty}x ${item.prodName}</div>
                    <small style="color:#777">${item.varName}</small>
                    ${optHtml}
                    ${item.obs ? `<br><small style="color:#d63384;">Obs: ${item.obs}</small>` : ''}
                </div>
                <div style="text-align:right">
                    <div>${formatMoney(item.total)}</div>
                    <small style="color:red;cursor:pointer;font-weight:bold;" onclick="removeCart(${i})">Remover</small>
                </div>
            </div>`;
        });
    }
    
    if(els.cartCountBadge) {
        const q = state.cart.reduce((a,b)=>a+b.qty, 0);
        els.cartCountBadge.textContent = q;
        els.cartCountBadge.classList.toggle('hidden', q===0);
    }

    if(document.getElementById('cart-subtotal')) document.getElementById('cart-subtotal').textContent = formatMoney(subtotal);
    if(document.getElementById('cart-total-final')) document.getElementById('cart-total-final').textContent = formatMoney(final < 0 ? 0 : final);
};

async function handleCheckout(e) {
    e.preventDefault();
    
    if(!state.store.open) return alert("A loja está fechada no momento.");
    if(state.cart.length === 0) return alert("Sua sacola está vazia.");

    // Validação de Telefone (Segurança)
    const rawPhone = document.getElementById('customer-phone').value.replace(/\D/g, '');
    if (rawPhone.length < 10 || rawPhone.length > 11) {
        return alert("Por favor, digite um número de WhatsApp válido com DDD.");
    }

    const subtotal = state.cart.reduce((a,b) => a + b.total, 0);
    if(subtotal < state.store.minOrder) return alert(`O pedido mínimo é ${formatMoney(state.store.minOrder)}`);

    const btn = e.submitter;
    btn.innerText = "Enviando..."; btn.disabled = true;

    const name = document.getElementById('customer-name').value;
    const phone = rawPhone; // Usa o número limpo
    const pay = document.getElementById('payment-method').value;
    const type = document.querySelector('input[name="delivery-type"]:checked').value;
    
    let fee = 0, address = "Retirada no Balcão";
    if (type === 'delivery') {
        const bairroEl = document.getElementById('delivery-neighborhood');
        const rua = document.getElementById('delivery-address').value;
        if(!rua || bairroEl.value === "") { 
            btn.disabled=false; btn.innerText="Fazer Pedido"; 
            return alert("Por favor, preencha o endereço corretamente."); 
        }
        fee = parseFloat(bairroEl.value);
        const bairroTxt = bairroEl.options[bairroEl.selectedIndex].text;
        address = `${rua} - ${bairroTxt}`;
    }

    let discount = state.coupon ? (state.coupon.tipo === 'percentual' ? subtotal*(state.coupon.valor/100) : state.coupon.valor) : 0;
    const total = subtotal + fee - discount;

    const orderData = {
        clienteNome: name, 
        clienteTelefone: phone, 
        endereco: address,
        pagamento: pay, 
        tipoEntrega: type, 
        subtotal, 
        taxaEntrega: fee, 
        total,
        itens: state.cart, 
        couponCode: state.coupon?.codigo,
        clienteUid: state.user ? state.user.uid : null // Vincula ao usuário
    };

    try {
        const res = await fetch('http://localhost:3000/api/criar-pedido', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ lojaId: state.lojaId, pedido: orderData })
        });
        const json = await res.json();
        
        if (json.sucesso) {
            state.cart = []; 
            window.updateCartUI(); 
            closeModal('cart-modal');
            
            const orderId = json.id.substring(0, 5).toUpperCase();

            // Se o usuário não estiver logado, salvamos os dados no local para facilitar
            if (!state.user) {
                localStorage.setItem('client_user', JSON.stringify({ phone: phone, name: name }));
            }

            if(typeof fbq === 'function') fbq('track', 'Purchase', { value: total, currency: 'BRL' });

            // Mensagem WhatsApp
            let msg = `*NOVO PEDIDO #${orderId}* 😋\n\n`;
            orderData.itens.forEach(i => {
                msg += `▪ ${i.qty}x ${i.prodName} (${i.varName})\n`;
                if(i.optionals && i.optionals.length) msg += `   + ${i.optionals.join(', ')}\n`;
                if(i.obs) msg += `   Obs: ${i.obs}\n`;
            });
            msg += `\n💰 *Total: ${formatMoney(total)}*\n`;
            msg += `📍 *${type==='delivery'?'Entrega':'Retirada'}*\n`;
            if(type==='delivery') msg += `${address}\n`;
            msg += `💳 Pagamento: ${pay}\n👤 Cliente: ${name}`;
            
            const phoneLoja = state.store.phone ? cleanPhone(state.store.phone) : '';
            
            if(phoneLoja) {
                window.location.href = `https://wa.me/55${phoneLoja}?text=${encodeURIComponent(msg)}`;
            } else { 
                alert(`Pedido #${orderId} realizado com sucesso!\nAcompanhe no seu Perfil.`); 
                window.location.reload(); 
            }
        } else {
            alert("Erro: " + json.erro);
            btn.disabled = false; 
            btn.innerText = "Fazer Pedido";
        }
    } catch(err) { 
        console.error(err); 
        alert("Erro de conexão."); 
        btn.disabled=false; 
        btn.innerText="Fazer Pedido"; 
    }
}

// ============================================================
// 8. HISTÓRICO E EVENTOS GERAIS
// ============================================================

async function loadOrderHistory() {
    const container = document.getElementById('order-history-list');
    
    // Verificação: Só carrega se tiver usuário logado e telefone
    // Se não tiver telefone (ex: logou com Google e não fez pedido ainda), mostra aviso
    if(!container || !state.user) return;
    
    let phoneToSearch = state.user.phone;
    
    // Se não tiver telefone no objeto user, tenta pegar do localStorage antigo
    if(!phoneToSearch) {
        const localUser = JSON.parse(localStorage.getItem('client_user') || '{}');
        if(localUser.phone) phoneToSearch = localUser.phone;
    }

    if(!phoneToSearch) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">Faça seu primeiro pedido para ver o histórico aqui.</div>';
        if(document.getElementById('user-points')) document.getElementById('user-points').textContent = "0";
        return;
    }
    
    container.innerHTML = '<div style="text-align:center; padding:20px"><div class="spinner"></div> Buscando...</div>';

    try {
        const clean = phoneToSearch.replace(/\D/g, ''); 

        const snap = await db.collection('pedidos')
            .where('clienteTelefone', '==', clean)
            .orderBy('data', 'desc')
            .limit(20)
            .get();
            
        if(snap.empty) {
            container.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">Nenhum pedido encontrado.</div>';
            document.getElementById('user-points').textContent = "0";
            return;
        }

        let html = ''; 
        let totalGasto = 0;

        snap.forEach(doc => {
            const p = doc.data();
            // Filtra a loja
            if (p.lojaId === state.lojaId) {
                if(p.status === 'finalizado') totalGasto += parseFloat(p.total || 0);
                
                let dateStr = 'Data';
                if(p.data && p.data.toDate) dateStr = p.data.toDate().toLocaleDateString('pt-BR');
                else if(p.criadoEm && p.criadoEm.toDate) dateStr = p.criadoEm.toDate().toLocaleDateString('pt-BR');
                
                const statusMap = {
                    'novo': { color: '#ffc107', text: 'Aguardando' },
                    'preparando': { color: '#17a2b8', text: 'Preparando' },
                    'pronto': { color: '#28a745', text: 'Saiu p/ Entrega' },
                    'finalizado': { color: '#28a745', text: 'Concluído' },
                    'cancelado': { color: '#dc3545', text: 'Cancelado' }
                };
                const st = statusMap[p.status] || { color: '#666', text: p.status };

                html += `
                <div style="background:#fff; border:1px solid #eee; padding:12px; margin-bottom:10px; border-radius:8px; border-left:4px solid ${st.color}; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                        <b>#${doc.id.substring(0,5).toUpperCase()}</b>
                        <b>${formatMoney(p.total)}</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#666; margin-top:4px;">
                        <span>${dateStr}</span>
                        <span style="color:${st.color}; font-weight:600;">${st.text}</span>
                    </div>
                </div>`;
            }
        });
        
        if(html === '') {
             container.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">Nenhum pedido nesta loja.</div>';
        } else {
             container.innerHTML = html;
        }
        
        const points = Math.floor(totalGasto * (state.store.pointsRate || 1));
        document.getElementById('user-points').textContent = points;
        const bar = document.querySelector('.progress-fill');
        if(bar) bar.style.width = `${Math.min(100, points)}%`;

    } catch(err) { 
        console.error("Erro histórico:", err);
        // Se falhar a query composta, tenta mostrar erro legível
        if(err.code === 'failed-precondition') {
             container.innerHTML = '<div style="text-align:center; padding:20px; color:red">Configuração pendente (Índice).</div>';
        } else {
             container.innerHTML = '<div style="text-align:center; padding:20px; color:red">Erro ao carregar.</div>';
        }
    }
}

function setupEventListeners() {
    document.querySelectorAll('.close-modal-btn').forEach(b => {
        b.onclick = (e) => {
            e.preventDefault();
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        };
    });
    
    const btnMap = document.getElementById('btn-open-map');
    if(btnMap) btnMap.addEventListener('click', window.openMapModal);
    
    const btnConfirmMap = document.getElementById('btn-confirm-location');
    if(btnConfirmMap) btnConfirmMap.addEventListener('click', window.confirmMapLocation);

    const btnAdd = document.getElementById('btn-add-to-cart');
    if(btnAdd) btnAdd.addEventListener('click', window.addToCart);

    document.getElementById('increase-quantity').onclick = () => { 
        const el = document.getElementById('quantity'); el.value++; window.calcProductTotal(); 
    };
    document.getElementById('decrease-quantity').onclick = () => { 
        const el = document.getElementById('quantity'); if(el.value>1) { el.value--; window.calcProductTotal(); } 
    };

    document.querySelectorAll('input[name="delivery-type"]').forEach(r => r.onchange = window.updateCartUI);
    if(els.deliverySelect) els.deliverySelect.onchange = window.updateCartUI;

    const btnCupom = document.getElementById('btn-apply-coupon');
    if(btnCupom) btnCupom.addEventListener('click', async () => {
        const code = document.getElementById('coupon-code').value.trim().toUpperCase();
        const msgEl = document.getElementById('coupon-message');
        if(!code) return;
        try {
            const snap = await db.collection('cupons').where('lojaId', '==', state.lojaId).where('codigo','==',code).where('ativo','==',true).get();
            if(!snap.empty) {
                state.coupon = snap.docs[0].data();
                msgEl.textContent = "Cupom aplicado!"; msgEl.className = "small-msg txt-green"; msgEl.classList.remove('hidden');
            } else {
                state.coupon = null;
                msgEl.textContent = "Inválido."; msgEl.className = "small-msg"; msgEl.classList.remove('hidden');
            }
            window.updateCartUI();
        } catch(e){ console.error(e); }
    });

    const chkForm = document.getElementById('checkout-form');
    if(chkForm) chkForm.addEventListener('submit', handleCheckout);

    // --- MÁSCARA DE TELEFONE AUTOMÁTICA ---
    const phoneInputs = document.querySelectorAll('.phone-mask, #customer-phone, #signup-phone');
    
    phoneInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    });
}

// --- UTILS EXTRAS ---

window.removeCart = (i) => { state.cart.splice(i,1); window.updateCartUI(); };
window.scrollToCat = (id) => { const el = document.getElementById('cat-'+id); if(el) window.scrollTo({top: el.offsetTop - 180, behavior: 'smooth'}); };

window.switchTab = (tab) => {
    els.menuSection.classList.add('hidden');
    document.querySelector('.search-section').classList.add('hidden');
    document.querySelector('.app-header').classList.add('hidden');
    
    closeModal('cart-modal'); 
    
    document.querySelectorAll('.bottom-nav .nav-item').forEach(b => b.classList.remove('active'));

    if(tab === 'home') {
        els.menuSection.classList.remove('hidden');
        document.querySelector('.search-section').classList.remove('hidden');
        document.querySelector('.app-header').classList.remove('hidden');
        document.querySelectorAll('.bottom-nav .nav-item')[0].classList.add('active');
        
        document.getElementById('profile-modal').classList.add('hidden');
    }
    
    if(tab === 'orders' || tab === 'profile') {
        openModal('profile-modal'); 
        
        if(tab === 'orders') {
            document.querySelectorAll('.bottom-nav .nav-item')[1].classList.add('active');
        }
        if(tab === 'profile') {
            document.querySelectorAll('.bottom-nav .nav-item')[3].classList.add('active');
        }

        renderProfileUI();
    }
};

window.updateStoreStatus = (isOpen) => {
    const elStatus = document.getElementById('store-status');
    const btnAdd = document.getElementById('btn-add-to-cart');

    if (elStatus) {
        if (isOpen) {
            elStatus.textContent = 'Aberto';
            elStatus.className = 'status-pill open';
        } else {
            elStatus.textContent = 'Fechado';
            elStatus.className = 'status-pill closed';
        }
    }
    
    if (btnAdd) {
        if(!isOpen) {
            btnAdd.disabled = true;
            btnAdd.innerHTML = '<span>Loja Fechada</span>';
            btnAdd.style.backgroundColor = "#ccc";
            btnAdd.style.cursor = "not-allowed";
        } else {
            btnAdd.disabled = false;
            btnAdd.innerHTML = '<span>Adicionar</span> <span id="modal-total-price">R$ 0,00</span>';
            btnAdd.style.backgroundColor = ""; 
            btnAdd.style.cursor = "pointer";
        }
    }
};