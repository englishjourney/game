// firewall.js

// COLOQUE O IP DA ESCOLA AQUI DENTRO DAS ASPAS
// Você pode colocar mais de um se a escola tiver duas redes, separando por vírgula no array.
const IPS_DA_ESCOLA = ['170.81.82.222']; 

/**
 * Verifica tudo: Rede e Sistema Operacional logo que abre o site
 */
export async function runSecurityChecks() {
    // 1. CHECAGEM DO SISTEMA (Chromebook)
    const isChromeOS = navigator.userAgent.indexOf("CrOS") !== -1;
    
    if (!isChromeOS) {
        bloquearTela("ACESSO RECUSADO", "Você precisa acessar pelo Chromebook da escola.");
        return false; // Para a execução aqui
    }

    // 2. CHECAGEM DE REDE (IP Público)
    try {
        // Chama uma API gratuita e super rápida que devolve o IP de quem está acessando
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const userIp = data.ip;
        
        console.log("IP Público detectado:", userIp); // Deixei aqui pra te ajudar a testar

        // Se o IP detectado não estiver na nossa lista permitida, bloqueia!
        if (!IPS_DA_ESCOLA.includes(userIp)) {
            bloquearTela("REDE NÃO AUTORIZADA", "Você precisa estar conectado no Wi-Fi da escola.");
            return false;
        }
        
        return true; // Se passou pelos dois testes, libera o site!
        
    } catch (error) {
        console.error("Erro ao verificar IP:", error);
        // Se a internet cair bem na hora, ou o firewall da escola bloquear a API de IP, 
        // deixamos bloquear por segurança, ou você pode alterar para liberar.
        bloquearTela("ERRO DE CONEXÃO", "Não foi possível verificar a segurança da rede.");
        return false;
    }
}

/**
 * Função para destruir a tela de login e exibir o erro
 */
function bloquearTela(titulo, mensagem) {
    document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background-color:#05050a; color:#ff0055; font-family: 'Courier New', monospace; text-align:center; padding: 20px;">
            <h1 style="font-size: 3rem; text-shadow: 0 0 20px #ff0055; margin-bottom: 20px;">${titulo}</h1>
            <p style="font-size: 1.5rem; color: #00e1ff;">${mensagem}</p>
        </div>
    `;
}
