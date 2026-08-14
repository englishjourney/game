// firewall.js

/**
 * 1. Verifica se o usuário está na rede da escola (IP 172.16.x.x)
 * Essa função deve ser chamada logo ao carregar a página inicial.
 */
export function checkSchoolNetwork() {
    // Cria uma conexão fantasma para tentar "pescar" o IP local do dispositivo
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');
    pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(console.error);
    
    let ipFound = false;

    pc.onicecandidate = (event) => {
        if (!event || !event.candidate) return;
        
        // Pega o IP que está dentro dos dados de rede da máquina
        const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
        const match = ipRegex.exec(event.candidate.candidate);
        
        if (match && !ipFound) {
            ipFound = true;
            const ip = match[1];
            
            // Se encontrou um IP real e NÃO começa com 172.16, bloqueia a tela!
            if (!ip.startsWith('172.16.')) {
                bloquearTela("Você precisa estar na escola.");
            }
            pc.close();
        }
    };

    // Obs: Se o navegador proteger o IP local (retornando um .local), 
    // a função falha silenciosamente e permite o acesso para não travar o sistema.
}

/**
 * 2. Verifica se o sistema operacional é o ChromeOS (Chromebook).
 * Retorna true se for, false se não for.
 */
export function isChromebook() {
    // Lê as informações do navegador. O Chromebook sempre contém "CrOS" na string.
    return navigator.userAgent.indexOf("CrOS") !== -1;
}

/**
 * Função auxiliar para destruir a interface e exibir a tela de erro
 */
function bloquearTela(mensagem) {
    document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background-color:#05050a; color:#ff0055; font-family: 'Courier New', monospace; text-align:center; padding: 20px;">
            <h1 style="font-size: 3rem; text-shadow: 0 0 20px #ff0055; margin-bottom: 20px;">ACESSO NEGADO</h1>
            <p style="font-size: 1.5rem; color: #00e1ff;">${mensagem}</p>
        </div>
    `;
}
