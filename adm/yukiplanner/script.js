const SUPABASE_URL = 'https://rmsmamzutvxugdbiqsrz.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hMNCps2v2Odflpq9zDt_dw_Cgb_Jcxx';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const btnSend = document.getElementById('btn-send');
const previewContainer = document.getElementById('preview-container');
const previewTableWrapper = document.getElementById('preview-table-wrapper');
const btnConfirmarSalvar = document.getElementById('btn-confirmar-salvar');
const splitTaskBalloon = document.getElementById('split-task-balloon');
const splitButtonsWrapper = document.getElementById('split-buttons-wrapper');

let aulasPendentes = [];
let totalPartsToComplete = 0;
let completedPartsCount = 0;

btnSend.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage(text, 'user-message');
    userInput.value = '';

    const loadingId = appendMessage('Processando com a IA...', 'ai-message');

    try {
        const { data, error } = await supabaseClient.functions.invoke('gerenciar-planner', {
            body: { textoBruto: text }
        });

        removeMessage(loadingId);

        if (error) throw new Error(error.message || 'Erro ao invocar Edge Function');

        // Verifica se o backend sinalizou limite de tokens excedido
        if (data.token_limit_exceeded) {
            triggerSplitTask(text);
            appendMessage('⚠️ A tarefa excedeu o limite de tokens. Utilize o balão flutuante para enviar em partes.', 'ai-message');
            return;
        }

        if (data.aulas && data.aulas.length > 0) {
            aulasPendentes = data.aulas;
            renderPreviewTable(aulasPendentes);
            appendMessage(`IA processou com sucesso! ${aulasPendentes.length} registro(s) identificado(s). Revise a prévia e clique em confirmar.`, 'ai-message');
        } else {
            appendMessage('Nenhuma aula foi identificada no texto enviado.', 'ai-message');
        }

    } catch (err) {
        removeMessage(loadingId);
        // Tratamento automático caso ocorra erro indicando limite de tamanho/tokens
        if (err.message.includes('token') || text.length > 1500) {
            triggerSplitTask(text);
            appendMessage('⚠️ Falha por limite de tokens. Use os botões do balão flutuante.', 'ai-message');
        } else {
            appendMessage(`Erro: ${err.message}`, 'ai-message');
        }
    }
}

function appendMessage(text, className) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${className}`;
    msgDiv.textContent = text;
    const id = 'msg-' + Date.now() + Math.random();
    msgDiv.id = id;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderPreviewTable(aulas) {
    previewContainer.classList.remove('hidden');
    let html = `
        <table class="preview-table">
            <thead>
                <tr>
                    <th>Dia</th>
                    <th>Data</th>
                    <th>Hora</th>
                    <th>Série/Turma</th>
                    <th>Habilidades</th>
                    <th>Atividades</th>
                    <th>Duração</th>
                    <th>Special</th>
                </tr>
            </thead>
            <tbody>
    `;
    aulas.forEach(a => {
        html += `
            <tr>
                <td>${a.day || ''}</td>
                <td>${a.date || ''}</td>
                <td>${a.time || ''}</td>
                <td>${a.serie}${a.team}</td>
                <td>${a.skills || ''}</td>
                <td>${a.activities || ''}</td>
                <td>${a.duration}m</td>
                <td>${a.special}</td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    previewTableWrapper.innerHTML = html;
}

btnConfirmarSalvar.addEventListener('click', async () => {
    if (aulasPendentes.length === 0) return;

    const { error } = await supabaseClient
        .from('planner')
        .insert(aulasPendentes);

    if (error) {
        alert('Erro ao salvar no Supabase: ' + error.message);
    } else {
        alert('Registros salvos com sucesso na tabela planner!');
        aulasPendentes = [];
        previewContainer.classList.add('hidden');
        appendMessage('Registros salvos com sucesso no banco de dados!', 'ai-message');
    }
});

// Sistema de divisão de tarefas
function triggerSplitTask(fullText) {
    splitTaskBalloon.classList.remove('hidden');
    splitButtonsWrapper.innerHTML = '';
    
    const chunkSize = 300;
    const parts = [];
    for (let i = 0; i < fullText.length; i += chunkSize) {
        parts.push(fullText.substring(i, i + chunkSize));
    }

    totalPartsToComplete = parts.length;
    completedPartsCount = 0;

    parts.forEach((partText, index) => {
        const btn = document.createElement('button');
        btn.className = 'btn-split-part';
        btn.textContent = `Enviar Parte ${index + 1} de ${parts.length}`;
        btn.onclick = async () => {
            btn.classList.add('done');
            btn.disabled = true;
            completedPartsCount++;

            appendMessage(`[Parte ${index + 1}] Enviando parte dividida...`, 'user-message');
            await processPartChunk(partText);

            if (completedPartsCount >= totalPartsToComplete) {
                splitTaskBalloon.classList.add('hidden');
                appendMessage('Todas as partes foram processadas com sucesso!', 'ai-message');
            }
        };
        splitButtonsWrapper.appendChild(btn);
    });
}

async function processPartChunk(chunkText) {
    try {
        const { data } = await supabaseClient.functions.invoke('gerenciar-planner', {
            body: { textoBruto: chunkText }
        });
        if (data && data.aulas) {
            aulasPendentes = [...aulasPendentes, ...data.aulas];
            renderPreviewTable(aulasPendentes);
        }
    } catch (e) {
        console.error('Erro ao processar parte:', e);
    }
}
