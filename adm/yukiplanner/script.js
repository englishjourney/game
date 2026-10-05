const SUPABASE_URL = "https://rmsmamzutvxugdbiqsrz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hMNCps2v2Odflpq9zDt_dw_Cgb_Jcxx";

let tasks = [];
let isProcessing = false;

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
    document.getElementById('btn-start-processing').disabled = true;
    document.getElementById('btn-parse-preview').disabled = true;
    document.getElementById('raw-planner-text').disabled = true;

    const overallBadge = document.getElementById('overall-status');
    overallBadge.textContent = 'Processando...';
    overallBadge.className = 'status-badge processing';

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        task.status = 'processing';
        renderSidebarTasks();

        try {
            const response = await fetch(EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'apikey': SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ taskText: task.text })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                task.status = 'success';
            } else {
                task.status = 'error';
                console.error(`Erro na Tarefa ${task.id}:`, result.error);
            }
        } catch (err) {
            task.status = 'error';
            console.error(`Falha ao conectar com a API na Tarefa ${task.id}:`, err);
        }

        renderSidebarTasks();
    }

    isProcessing = false;
    overallBadge.textContent = 'Concluído';
    overallBadge.className = 'status-badge completed';

    document.getElementById('completion-footer').classList.remove('hidden');
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
