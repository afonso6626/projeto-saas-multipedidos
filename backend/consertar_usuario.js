// consertar_usuario.js
const admin = require('firebase-admin');
const serviceAccount = require('./chave-firebase.json'); // Sua chave

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// O ID do usuário que está dando erro (peguei do seu print)
const UID_DO_USUARIO = "9lGcT812YZaStnI1uN6459SjKjj2"; 

async function darPermissao() {
    try {
        console.log(`🔧 Consertando usuário ${UID_DO_USUARIO}...`);
        
        // Injeta o carimbo de segurança (Claim) manualmente
        await admin.auth().setCustomUserClaims(UID_DO_USUARIO, {
            dono: true,
            lojaId: UID_DO_USUARIO // No seu modelo, o ID da loja é igual ao UID
        });

        console.log("✅ Sucesso! O usuário agora tem permissão.");
        console.log("👉 IMPORTANTE: Faça Logout e Login novamente no site para atualizar o token.");
        process.exit();
    } catch (error) {
        console.error("Erro:", error);
    }
}

darPermissao();