const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwau-jxEfWW8pQ72NXNc9oef9UBysU8qu2hel_DyJSJSnlmipjCkmaJSe0PpulGQ5Q4/exec";

let tasks = [];
let isProcessing = false;
let isPaused = false;
let isAborted = false;

document.addEventListener('DOMContentLoaded', () => {
    const btnParse = document.getElementById('btn-parse-preview');
    const btnStart = document.getElementById('btn-start-processing');
    const btnReset = document.getElementById('btn-reset');

    btnParse.addEventListener('click', () => {
        parseInputToTasks();
    });

    btnStart.addEventListener('click', () => {
        startSequentialProcessing();
    });

    btnReset.addEventListener('click', () => {
        resetApp();
    });
});

function parseInputToTasks() {
    const text = document.getElementById('raw-planner-text').value;
    
    // Separa o texto por 2 ou mais quebras de linha
    const blocks = text.split(/\n\s*\r?\n/).map(b => b.trim()).filter(b => b.length > 0);

    if (blocks.length === 0) {
        alert('Nenhum texto foi identificado. Digite ou cole algo na caixa.');
        return;
    }

    if (blocks.length === 1) {
        console.warn("Atenção: Apenas 1 bloco identificado. Certifique-se de deixar uma linha em branco entre cada aula.");
    }

    tasks = blocks.map((block, index) => ({
        id: index + 1,
        text: block,
        status: 'pending'
    }));

    renderSidebarTasks();
    renderPreviewCards();

    document.getElementById('btn-start-processing').disabled = false;
    document.getElementById('preview-section').classList.remove('hidden');
}

function renderSidebarTasks() {
    const container = document.getElementById('task-list');
    container.innerHTML = '';

    tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = `task-item ${task.status}`;
        item.id = `sidebar-task-${task.id}`;

        let statusText = 'Pendente';
        if (task.status === 'processing') statusText = 'Processando...';
        if (task.status === 'success') statusText = 'Concluído';
        if (task.status === 'error') statusText = 'Erro';

        item.innerHTML = `
            <div class="task-item-header">
                <span>Tarefa ${task.id}</span>
                <span style="font-weight: normal;">${statusText}</span>
            </div>
            <div class="task-item-body">${task.text}</div>
        `;
        container.appendChild(item);
    });
}

function renderPreviewCards() {
    const container = document.getElementById('cards-preview-container');
    container.innerHTML = '';

    tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'preview-card';
        card.innerHTML = `
            <h4>Tarefa ${task.id}</h4>
            <p>${task.text}</p>
        `;
        container.appendChild(card);
    });
}

async function startSequentialProcessing() {
    if (isProcessing || tasks.length === 0) return;

    isProcessing = true;
    isPaused = false;
    isAborted = false;

    document.getElementById('btn-start-processing').disabled = true;
    document.getElementById('btn-parse-preview').disabled = true;
    document.getElementById('raw-planner-text').disabled = true;
    
    // Exibe os botões de Pausa e Interromper
    document.getElementById('btn-pause-processing').classList.remove('hidden');
    document.getElementById('btn-abort-processing').classList.remove('hidden');
    document.getElementById('btn-pause-processing').textContent = 'Pausar';

    const overallBadge = document.getElementById('overall-status');
    overallBadge.textContent = 'Processando...';
    overallBadge.className = 'status-badge processing';

    for (let i = 0; i < tasks.length; i++) {
        // Verifica se o usuário clicou em Interromper
        if (isAborted) break;

        // Verifica se o usuário clicou em Pausar
        while (isPaused) {
            if (isAborted) break;
            await new Promise(resolve => setTimeout(resolve, 500)); // Aguarda checando o estado
        }
        if (isAborted) break;

        const task = tasks[i];
        if (task.status === 'success') continue; // Pula as que já deram certo se retomar

        task.status = 'processing';
        renderSidebarTasks();

        let tentativa = 0;
        let sucesso = false;

        while (!sucesso && !isAborted) {
            try {
                const response = await fetch(GAS_WEB_APP_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ taskText: task.text })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    task.status = 'success';
                    sucesso = true;
                } else {
                    throw new Error(result.error || "Erro desconhecido no servidor.");
                }
            } catch (err) {
                tentativa++;
                console.warn(`Tentativa ${tentativa} falhou na Tarefa ${task.id}:`, err);

                // Se for erro de rate limit ou falha de rede, aguarda 1 minuto na primeira falha antes de desistir/pausar
                if (tentativa === 1) {
                    overallBadge.textContent = 'Aguardando rate limite...';
                    
                    // Atualiza visualmente o item para indicar espera
                    const sidebarItem = document.getElementById(`sidebar-task-${task.id}`);
                    if(sidebarItem) {
                        sidebarItem.querySelector('.task-item-header span:last-child').textContent = 'Aguardando rate limite (1 min)...';
                    }

                    // Aguarda 60 segundos (1 minuto) para o TPM da Groq resetar
                    for (let s = 60; s > 0; s--) {
                        if (isAborted) break;
                        overallBadge.textContent = `Aguardando rate limite (${s}s)...`;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } else {
                    // Se falhar na segunda tentativa consecutiva, pausa o fluxo e avisa o usuário
                    task.status = 'error';
                    isPaused = true;
                    document.getElementById('btn-pause-processing').textContent = 'Retomar';
                    overallBadge.textContent = 'Pausado por Erro';
                    alert(`Ação pausada devido a um erro na Tarefa ${task.id}:\n${err.message}`);
                    renderSidebarTasks();
                    break;
                }
            }
        }

        renderSidebarTasks();
        
        // Pausa pequena de 1.5 segundo entre tarefas normais para evitar disparar o limite de requisições por minuto (RPM)
        if (!isAborted && !isPaused) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }

    if (!isAborted && !isPaused) {
        isProcessing = false;
        overallBadge.textContent = 'Concluído';
        overallBadge.className = 'status-badge completed';
        document.getElementById('btn-pause-processing').classList.add('hidden');
        document.getElementById('btn-abort-processing').classList.add('hidden');
        document.getElementById('completion-footer').classList.remove('hidden');
    }
}

function resetApp() {
    tasks = [];
    isProcessing = false;

    document.getElementById('raw-planner-text').value = '';
    document.getElementById('raw-planner-text').disabled = false;
    document.getElementById('btn-parse-preview').disabled = false; // Removida a trava aqui também
    document.getElementById('btn-start-processing').disabled = true;

    document.getElementById('completion-footer').classList.add('hidden');
    document.getElementById('preview-section').classList.add('hidden');

    const overallBadge = document.getElementById('overall-status');
    overallBadge.textContent = 'Aguardando';
    overallBadge.className = 'status-badge';

    document.getElementById('task-list').innerHTML = `
        <div class="empty-state">Cole o plano de aula no campo de texto para fragmentar as tarefas.</div>
    `;
}
function pauseProcessing() {
    isPaused = true;
    document.getElementById('btn-pause-processing').textContent = 'Retomando...';
    document.getElementById('overall-status').textContent = 'Pausado';
}

function abortProcessing() {
    isAborted = true;
    isProcessing = false;
    document.getElementById('overall-status').textContent = 'Interrompido';
    document.getElementById('btn-pause-processing').classList.add('hidden');
    document.getElementById('btn-abort-processing').classList.add('hidden');
    document.getElementById('completion-footer').classList.remove('hidden');
}
