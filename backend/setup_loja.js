// setup_loja.js - Robô para configurar Donos de Loja

// --- CONFIGURE AQUI ---
// setup_loja.js

// --- CONFIGURE AQUI ---
const EMAIL_DO_DONO = "jorge3@gmail.com";  // O email que você criou
const ID_DA_LOJA = "lanchonete_jorge";     // O ID da loja dele (pode ser qualquer nome sem espaços)
const NOME_DO_DONO = "Jorge Silva";
// ---------------------

// ... resto do código continua igual ...
// ---------------------

const admin = require('firebase-admin');

// Tenta conectar usando sua chave
try {
    const serviceAccount = require('./chave-firebase.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    console.error("❌ Erro: Não achei o arquivo 'chave-firebase.json'.");
    process.exit(1);
}

const db = admin.firestore();

async function configurarUsuario() {
    console.log(`🔍 Buscando usuário: ${EMAIL_DO_DONO}...`);

    try {
        // 1. Procura se o usuário já existe na tabela 'funcionarios'
        const snapshot = await db.collection('funcionarios')
            .where('email', '==', EMAIL_DO_DONO)
            .get();

        if (snapshot.empty) {
            // CENÁRIO A: Usuário não existe -> CRIA NOVO
            console.log("⚠️ Usuário não encontrado. Criando novo registro...");
            
            await db.collection('funcionarios').add({
                nome: NOME_DO_DONO,
                email: EMAIL_DO_DONO,
                funcao: 'dono',
                lojaId: ID_DA_LOJA, // O Pulo do Gato!
                criadoEm: new Date()
            });

            console.log(`✅ SUCESSO! Usuário criado e vinculado à loja: ${ID_DA_LOJA}`);

        } else {
            // CENÁRIO B: Usuário já existe -> ATUALIZA
            console.log("🔄 Usuário encontrado! Atualizando dados...");

            const docId = snapshot.docs[0].id; // Pega o ID do documento
            
            await db.collection('funcionarios').doc(docId).update({
                lojaId: ID_DA_LOJA, // Atualiza a loja
                funcao: 'dono'      // Garante que é dono
            });

            console.log(`✅ SUCESSO! Usuário atualizado para gerenciar a loja: ${ID_DA_LOJA}`);
        }

    } catch (error) {
        console.error("❌ Deu erro:", error);
    } finally {
        process.exit(); // Desliga o robô
    }
}

// Roda a função
configurarUsuario();