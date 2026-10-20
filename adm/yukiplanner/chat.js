// Gerenciamento da Janela de Chat com IA

document.addEventListener('DOMContentLoaded', () => {
    const chatToggleBtn = document.getElementById('ai-chat-toggle');
    const chatWindow = document.getElementById('ai-chat-window');
    const chatCloseBtn = document.getElementById('ai-chat-close');
    const chatSendBtn = document.getElementById('ai-chat-send');
    const chatInput = document.getElementById('ai-chat-input');
    const chatMessages = document.getElementById('ai-chat-messages');

    if (!chatToggleBtn || !chatWindow) return;

    // Abrir/Fechar janela de chat
    chatToggleBtn.addEventListener('click', () => {
        chatWindow.classList.toggle('hidden');
        if (!chatWindow.classList.contains('hidden')) {
            chatInput.focus();
        }
    });

    chatCloseBtn.addEventListener('click', () => {
        chatWindow.classList.add('hidden');
    });

    // Envio de mensagem
    chatSendBtn.addEventListener('click', () => {
        sendChatMessage();
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    async function sendChatMessage() {
        const messageText = chatInput.value.trim();
        if (!messageText) return;

        // Adicionar mensagem do usuário
        appendMessage('user', messageText);
        chatInput.value = '';

        // Feedback visual de carregamento
        const loadingId = appendMessage('assistant', 'Pensando...');

        try {
            // Envio para a Edge Function / Apps Script
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    type: 'chat',
                    message: messageText
                })
            });

            const result = await response.json();
            const loadingElement = document.getElementById(loadingId);

            if (response.ok && result.success) {
                if (loadingElement) {
                    loadingElement.querySelector('.msg-content').innerText = result.reply || result.response || "Resposta recebida com sucesso.";
                }
            } else {
                if (loadingElement) {
                    loadingElement.querySelector('.msg-content').innerText = "Erro: " + (result.error || "Não foi possível obter resposta da IA.");
                }
            }
        } catch (err) {
            console.error("Erro no chat:", err);
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) {
                loadingElement.querySelector('.msg-content').innerText = "Erro ao conectar com o servidor da IA.";
            }
        }
    }

    function appendMessage(sender, text) {
        const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
        const msgDiv = document.createElement('div');
        msgDiv.id = msgId;
        msgDiv.className = `chat-msg ${sender}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'msg-content';
        contentDiv.innerText = text;

        msgDiv.appendChild(contentDiv);
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return msgId;
    }
});
