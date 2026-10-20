// Gerenciamento da Janela de Chat com IA
const GAS_CHAT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz8H7VvZyOgjBnNCcOqj3Vc86Xoc5SxotA8IrysKcU2hhp2EXOfAfyWnTwRf0u7aQoF8g/exec";

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

        // Feedback visual de carregamento com o GIF animado como avatar
        const loadingId = appendMessage('assistant', 'Pensando...', true);

        try {
            // Envio para o Apps Script dedicado ao chat
            const response = await fetch(GAS_CHAT_WEB_APP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    type: 'chat',
                    message: messageText
                })
            });

            const result = await response.json();
            const loadingElement = document.getElementById(loadingId);

            if (loadingElement) {
                // Atualiza o avatar para o círculo laranja estático
                const avatarDiv = loadingElement.querySelector('.chat-avatar');
                if (avatarDiv) {
                    avatarDiv.innerHTML = `<span class="orange-dot"></span>`;
                }

                const contentDiv = loadingElement.querySelector('.msg-content');

                if (response.ok && result.success) {
                    const replyText = result.reply || "Resposta recebida com sucesso.";
                    // Renderiza com Markdown se a biblioteca marked estiver disponível
                    if (typeof marked !== 'undefined') {
                        contentDiv.innerHTML = marked.parse(replyText);
                    } else {
                        contentDiv.innerText = replyText;
                    }
                } else {
                    contentDiv.innerText = "Erro: " + (result.error || "Não foi possível obter resposta da IA.");
                }
            }
        } catch (err) {
            console.error("Erro no chat:", err);
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) {
                const avatarDiv = loadingElement.querySelector('.chat-avatar');
                if (avatarDiv) {
                    avatarDiv.innerHTML = `<span class="orange-dot"></span>`;
                }
                loadingElement.querySelector('.msg-content').innerText = "Erro ao conectar com o servidor da IA.";
            }
        }
    }

    function appendMessage(sender, text, isLoading = false) {
        const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
        const msgDiv = document.createElement('div');
        msgDiv.id = msgId;
        msgDiv.className = `chat-msg ${sender}`;

        // Se for assistente, adiciona o avatar (GIF animado se estiver carregando, círculo laranja se for mensagem estática)
        if (sender === 'assistant') {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'chat-avatar';
            if (isLoading) {
                avatarDiv.innerHTML = `<img src="https://mir-s3-cdn-cf.behance.net/project_modules/source/04de2e31234507.564a1d23645bf.gif" alt="Pensando..." class="loading-gif">`;
            } else {
                avatarDiv.innerHTML = `<span class="orange-dot"></span>`;
            }
            msgDiv.appendChild(avatarDiv);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'msg-content';
        
        if (isLoading) {
            contentDiv.innerText = text;
        } else {
            if (sender === 'assistant' && typeof marked !== 'undefined') {
                contentDiv.innerHTML = marked.parse(text);
            } else {
                contentDiv.innerText = text;
            }
        }

        msgDiv.appendChild(contentDiv);
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return msgId;
    }
});
