import { db } from './firebase-config.js';
import { showLoader, hideLoader } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SEGURANÇA SAAS ---
    const LOJA_ATUAL = sessionStorage.getItem('SAAS_LOJA_ID');
    if (!LOJA_ATUAL) {
        console.error("Sessão inválida.");
        return;
    }
    // ------------------------

    if (!document.getElementById('map-container')) return;

    let map, drawnItems;
    // Posição padrão (São Paulo) caso a loja não tenha configurado GPS
    let lojaLat = -23.5505;
    let lojaLng = -46.6333;

    // --- 2. INICIALIZAR MAPA (COM COORDENADAS DA LOJA) ---
    const initMap = async () => {
        try {
            // Busca configurações DA LOJA ATUAL para centrar o mapa
            const docLoja = await db.collection('configuracoes').doc(LOJA_ATUAL).get();
            if(docLoja.exists) {
                const data = docLoja.data();
                if(data.lat && data.lng) {
                    lojaLat = parseFloat(data.lat);
                    lojaLng = parseFloat(data.lng);
                }
            }
        } catch(e) { console.error(e); }

        // Cria o mapa
        map = L.map('map-container').setView([lojaLat, lojaLng], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        // Marcador da Loja
        L.marker([lojaLat, lojaLng]).addTo(map).bindPopup("<b>Minha Loja</b>").openPopup();

        // Camada de Desenho
        drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        const drawControl = new L.Control.Draw({
            draw: { 
                polygon: { allowIntersection: false, showArea: true }, 
                marker: false, 
                circlemarker: false, 
                circle: false, 
                polyline: false, 
                rectangle: true 
            },
            edit: { featureGroup: drawnItems, remove: true }
        });
        map.addControl(drawControl);

        // Carrega áreas salvas
        loadSavedAreas();

        // --- SALVAR NOVA ÁREA ---
        map.on(L.Draw.Event.CREATED, async (event) => {
            const layer = event.layer;
            
            const nome = prompt("Nome desta área de entrega (Ex: Centro):");
            if (!nome) return;
            
            const precoStr = prompt(`Taxa de entrega para ${nome} (R$):`);
            if (precoStr === null) return;
            
            const preco = parseFloat(precoStr.replace(',', '.'));
            if (isNaN(preco)) { alert("Preço inválido"); return; }

            const geojson = layer.toGeoJSON();
            
            const areaData = {
                lojaId: LOJA_ATUAL, // <--- VINCULA À LOJA
                nome: nome,
                preco: preco,
                // Converte geometria complexa para texto para o Firebase aceitar fácil
                geometry: JSON.stringify(geojson.geometry) 
            };

            showLoader();
            try {
                const docRef = await db.collection('areasEntrega').add(areaData);
                
                // Adiciona propriedades ao desenho visual para podermos editar depois
                layer.feature = layer.feature || {};
                layer.feature.type = "Feature";
                layer.feature.properties = { id: docRef.id, nome: nome, preco: preco };
                
                drawnItems.addLayer(layer);
                layer.bindPopup(`<b>${nome}</b><br>Taxa: R$ ${preco.toFixed(2)}`).openPopup();
            } catch(err) { 
                console.error(err); 
                alert("Erro ao salvar área."); 
            } finally { hideLoader(); }
        });

        // --- EXCLUIR ÁREA ---
        map.on(L.Draw.Event.DELETED, async (event) => {
            event.layers.eachLayer(async (layer) => {
                const props = layer.feature?.properties;
                if (props && props.id) {
                    try {
                        await db.collection('areasEntrega').doc(props.id).delete();
                        console.log("Área removida:", props.nome);
                    } catch (e) { console.error("Erro ao deletar área", e); }
                }
            });
        });
    };

    // --- CARREGAR ÁREAS SALVAS (DA LOJA ATUAL) ---
    const loadSavedAreas = async () => {
        try {
            const snapshot = await db.collection('areasEntrega')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if(data.geometry) {
                    const geometry = JSON.parse(data.geometry); 
                    const layer = L.geoJSON(geometry, {
                        style: { color: "#3388ff", weight: 2 }
                    }).getLayers()[0];
                    
                    if (layer) {
                        layer.feature = { 
                            type: "Feature", 
                            properties: { id: doc.id, nome: data.nome, preco: data.preco } 
                        };
                        layer.bindPopup(`<b>${data.nome}</b><br>Taxa: R$ ${data.preco.toFixed(2)}`);
                        drawnItems.addLayer(layer);
                    }
                }
            });
        } catch(e) { 
            console.error("Erro ao carregar áreas", e);
            if(e.code === 'failed-precondition') alert("Falta índice (Áreas Entrega) no Firebase.");
        }
    };
    
    // Inicia o mapa
    initMap();

    // --- 3. TABELA DE TAXAS POR KM ---
    const kmRangeForm = document.getElementById('km-range-form');
    const kmRangesTableBody = document.getElementById('km-ranges-table-body');
    
    const fetchKmRanges = async () => {
        if(!kmRangesTableBody) return;
        kmRangesTableBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
        try {
            const s = await db.collection('taxasEntregaKm')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .orderBy('minKm')
                .get();
            
            kmRangesTableBody.innerHTML = '';
            if(s.empty) kmRangesTableBody.innerHTML = '<tr><td colspan="4">Nenhuma taxa por KM configurada.</td></tr>';

            s.forEach(d => {
                const r = d.data();
                kmRangesTableBody.innerHTML += `<tr><td>${r.minKm} km</td><td>${r.maxKm} km</td><td>R$ ${r.valor.toFixed(2)}</td><td><button class="btn-action del-range" data-id="${d.id}" style="color:red">X</button></td></tr>`;
            });
        } catch(e) { 
            console.error(e);
            if(e.code === 'failed-precondition') alert("Falta índice (Taxas KM) no Firebase.");
        }
    };

    if(kmRangeForm) {
        kmRangeForm.addEventListener('submit', async e => {
            e.preventDefault();
            const min = parseFloat(document.getElementById('km-min').value);
            const max = parseFloat(document.getElementById('km-max').value);
            const val = parseFloat(document.getElementById('km-value').value);
            
            await db.collection('taxasEntregaKm').add({
                lojaId: LOJA_ATUAL, // <--- VINCULA À LOJA
                minKm: min, 
                maxKm: max, 
                valor: val
            });
            
            kmRangeForm.reset(); 
            fetchKmRanges();
        });
    }
    if(kmRangesTableBody) {
        kmRangesTableBody.addEventListener('click', async e => {
            if(e.target.classList.contains('del-range')) {
                if(confirm("Excluir?")) {
                    await db.collection('taxasEntregaKm').doc(e.target.dataset.id).delete();
                    fetchKmRanges();
                }
            }
        });
    }
    fetchKmRanges();

    // --- 4. TABELA DE TAXAS POR BAIRRO (MANUAL) ---
    const deliveryTaxForm = document.getElementById('delivery-tax-form');
    const deliveryBody = document.getElementById('delivery-taxes-table-body');
    
    const fetchBairros = async () => {
        try {
            const s = await db.collection('taxasEntrega')
                .where('lojaId', '==', LOJA_ATUAL) // <--- BLINDAGEM
                .orderBy('bairro')
                .get();
            
            deliveryBody.innerHTML = '';
            if(s.empty) deliveryBody.innerHTML = '<tr><td colspan="3">Nenhum bairro configurado.</td></tr>';

            s.forEach(d => deliveryBody.innerHTML += `<tr><td>${d.data().bairro}</td><td>R$ ${d.data().taxa}</td><td><button class="btn-action del-bairro" data-id="${d.id}" style="color:red;">Excluir</button></td></tr>`);
        } catch(e) { 
            console.error(e);
            if(e.code === 'failed-precondition') alert("Falta índice (Taxas Bairro) no Firebase.");
        }
    };

    if(deliveryTaxForm) deliveryTaxForm.addEventListener('submit', async e => {
        e.preventDefault();
        await db.collection('taxasEntrega').add({
            lojaId: LOJA_ATUAL, // <--- VINCULA À LOJA
            bairro: document.getElementById('bairro-name').value,
            taxa: parseFloat(document.getElementById('bairro-tax').value)
        });
        deliveryTaxForm.reset(); 
        fetchBairros();
    });

    if(deliveryBody) deliveryBody.addEventListener('click', async e => {
        if(e.target.classList.contains('del-bairro')) {
            if(confirm("Excluir?")) {
                await db.collection('taxasEntrega').doc(e.target.dataset.id).delete();
                fetchBairros();
            }
        }
    });
    
    fetchBairros();
});