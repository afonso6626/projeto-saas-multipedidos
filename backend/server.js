const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- 1. CONFIGURAÇÃO DA CHAVE (O PULO DO GATO PARA VERCEL) ---
let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS) {
    // SE ESTIVER NA VERCEL: Pega o código da Variável de Ambiente
    console.log("Rodando na Vercel: Usando credenciais de ambiente.");
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} else {
    // SE ESTIVER NO SEU PC: Pega do arquivo local
    try {
        console.log("Rodando Local: Usando arquivo chave-firebase.json");
        serviceAccount = require('./chave-firebase.json');
    } catch (e) {
        console.error("❌ ERRO: Chave não encontrada. Configure o arquivo ou a variável de ambiente.");
    }
}

// Inicializa o Firebase apenas se ainda não estiver inicializado
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

// --- SUAS ROTAS (MANTIDAS IGUAIS) ---

app.post('/api/admin/criar-loja', async (req, res) => {
    try {
        const { nomeDono, email, nomeLoja, senha } = req.body;

        const userRecord = await admin.auth().createUser({
            email: email,
            password: senha,
            displayName: nomeDono
        });

        const lojaId = userRecord.uid;

        await admin.auth().setCustomUserClaims(userRecord.uid, {
            dono: true,
            lojaId: lojaId
        });

        await db.collection('lojas').doc(lojaId).set({
            nomeLoja: nomeLoja,
            dono: nomeDono,
            email: email,
            status: 'ativo',
            vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            criadoEm: new Date()
        });

        await db.collection('funcionarios').add({
            nome: nomeDono,
            email: email,
            funcao: 'dono',
            lojaId: lojaId,
            uid: userRecord.uid
        });

        await db.collection('configuracoes').doc(lojaId).set({
            nome: nomeLoja,
            aberta: true,
            lojaId: lojaId
        });

        res.json({ sucesso: true, lojaId: lojaId, msg: "Loja SaaS criada com segurança!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

app.post('/api/criar-pedido', async (req, res) => {
    try {
        const { lojaId, pedido } = req.body;
        if (!lojaId) return res.status(400).json({ erro: "lojaId é obrigatório." });

        delete pedido.data;

        const docRef = await db.collection('pedidos').add({
            ...pedido,
            lojaId: lojaId,
            status: 'novo',
            data: admin.firestore.FieldValue.serverTimestamp(), 
            criadoEm: new Date()
        });

        res.json({ sucesso: true, id: docRef.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ sucesso: false, erro: "Erro no servidor" });
    }
});

app.get('/api/meus-pedidos/:lojaId', async (req, res) => {
    try {
        const lojaId = req.params.lojaId;
        const snapshot = await db.collection('pedidos')
            .where('lojaId', '==', lojaId)
            .orderBy('criadoEm', 'desc')
            .get();

        const pedidos = [];
        snapshot.forEach(doc => {
            pedidos.push({ id: doc.id, ...doc.data() });
        });

        res.json(pedidos);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.post('/api/admin/criar-funcionario', async (req, res) => {
    try {
        const { email, senha, nome, funcao, lojaId } = req.body;
        if (!lojaId) return res.status(400).json({ erro: "ID da loja é obrigatório." });

        const userRecord = await admin.auth().createUser({
            email: email,
            password: senha,
            displayName: nome
        });

        await admin.auth().setCustomUserClaims(userRecord.uid, {
            lojaId: lojaId,
            role: funcao
        });

        await db.collection('funcionarios').doc(userRecord.uid).set({
            uid: userRecord.uid,
            nome: nome,
            email: email,
            funcao: funcao,
            lojaId: lojaId,
            criadoEm: new Date()
        });

        res.json({ sucesso: true, msg: "Funcionário criado com sucesso!" });
    } catch (error) {
        console.error("Erro ao criar funcionário:", error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// --- 2. EXPORTA O APP (OBRIGATÓRIO PARA VERCEL) ---
// Não usamos mais app.listen aqui para produção
module.exports = app;