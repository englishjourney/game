import { supabase } from '../supabaseClient.js';

let taskRecords = new Map();
let selectedTaskFilter = 'all';

export function initTasks() {
    const form = document.getElementById('task-form');
    const addButton = document.getElementById('btn-add-task');
    const cancelButton = document.getElementById('btn-cancel-task');
    const list = document.getElementById('tasks-list');
    if (!form || !addButton || !cancelButton || !list) return;

    addButton.addEventListener('click', () => openTaskForm());
    cancelButton.addEventListener('click', () => document.getElementById('task-modal').close());
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const id = document.getElementById('task-id').value;
        const localDeadline = document.getElementById('task-deadline').value;
        if (!localDeadline) { alert('Informe o prazo final do trabalho.'); return; }
        const taskData = {
            title: document.getElementById('task-title').value.trim(),
            description: document.getElementById('task-description').value.trim(),
            serie: document.getElementById('task-serie').value || null,
            team: document.getElementById('task-team').value || null,
            deadline: new Date(localDeadline).toISOString()
        };
        if (!taskData.title) { alert('Informe o título do trabalho.'); return; }

        const result = id
            ? await supabase.from('tasks').update(taskData).eq('id', id)
            : await supabase.from('tasks').insert([taskData]);
        if (result.error) { alert('Erro ao salvar o trabalho: ' + result.error.message); return; }

        document.getElementById('task-modal').close();
        await loadTasks();
        await window.refreshAdminNotifications?.();
    });

    list.addEventListener('click', event => {
        const editButton = event.target.closest('[data-task-edit]');
        const deleteButton = event.target.closest('[data-task-delete]');
        if (editButton) window.editTask(editButton.dataset.taskEdit);
        if (deleteButton) window.deleteTask(deleteButton.dataset.taskDelete);
    });

    const filters = document.getElementById('tasks-filters');
    filters?.addEventListener('click', event => {
        const filterButton = event.target.closest('[data-task-filter]');
        if (!filterButton) return;
        selectedTaskFilter = filterButton.dataset.taskFilter || 'all';
        const currentTasks = Array.from(taskRecords.values());
        renderTaskFilters(currentTasks);
        renderTaskCards(currentTasks);
    });

    // Carrega e verifica os prazos uma vez ao abrir a seção.
    loadTasks();
}

function escapeTaskHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function toLocalDateTimeInput(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatDeadline(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Prazo não definido';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function openTaskForm(task = null) {
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = task ? task.id : '';
    document.getElementById('task-title').value = task ? task.title : '';
    document.getElementById('task-description').value = task ? task.description || '' : '';
    document.getElementById('task-serie').value = task ? task.serie || '' : '';
    document.getElementById('task-team').value = task ? task.team || '' : '';
    document.getElementById('task-deadline').value = task ? toLocalDateTimeInput(task.deadline) : '';
    document.getElementById('task-modal-title').textContent = task ? 'Editar trabalho pendente' : 'Novo trabalho pendente';
    document.getElementById('task-modal').showModal();
}

async function loadTasks() {
    const container = document.getElementById('tasks-list');
    if (!container) return;
    container.innerHTML = '<p class="task-empty-state">Carregando trabalhos...</p>';
    const { data, error } = await supabase.from('tasks').select('*').order('deadline', { ascending: true });
    if (error) {
        const filters = document.getElementById('tasks-filters');
        if (filters) filters.innerHTML = '';
        container.innerHTML = '<p class="task-empty-state">Erro ao carregar trabalhos: ' + escapeTaskHtml(error.message) + '</p>';
        return;
    }

    const tasks = data || [];
    taskRecords = new Map(tasks.map(task => [String(task.id), task]));
    renderTaskFilters(tasks);
    renderTaskCards(tasks);
}

function buildTaskFilterOptions(tasks) {
    const options = new Map();

    tasks.forEach(task => {
        const serie = String(task.serie || '').trim();
        const team = String(task.team || '').trim();

        if (serie && team) {
            const key = 'class|' + serie + '|' + team;
            options.set(key, { key, label: serie + 'º ' + team });
        } else if (serie) {
            const key = 'serie|' + serie;
            options.set(key, { key, label: serie + 'º ano · todas as turmas' });
        } else if (team) {
            const key = 'team|' + team;
            options.set(key, { key, label: 'Turma ' + team + ' · todas as séries' });
        }
    });

    return Array.from(options.values()).sort((a, b) =>
        a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
    );
}

function getTasksForFilter(tasks, filterKey) {
    if (!filterKey || filterKey === 'all') return tasks;

    const [type, serie, team] = filterKey.split('|');
    return tasks.filter(task => {
        const taskSerie = String(task.serie || '').trim();
        const taskTeam = String(task.team || '').trim();

        if (type === 'class') {
            return (!taskSerie || taskSerie === serie) && (!taskTeam || taskTeam === team);
        }
        if (type === 'serie') return !taskSerie || taskSerie === serie;
        if (type === 'team') return !taskTeam || taskTeam === team;
        return true;
    });
}

function renderTaskFilters(tasks) {
    const container = document.getElementById('tasks-filters');
    if (!container) return;

    const options = buildTaskFilterOptions(tasks);
    if (selectedTaskFilter !== 'all' && !options.some(option => option.key === selectedTaskFilter)) {
        selectedTaskFilter = 'all';
    }

    const allOptions = [{
        key: 'all',
        label: 'Todas',
        count: tasks.length
    }, ...options.map(option => ({
        ...option,
        count: getTasksForFilter(tasks, option.key).length
    }))];

    container.innerHTML = allOptions.map(option =>
        '<button type="button" class="tasks-filter-button' +
        (selectedTaskFilter === option.key ? ' active' : '') +
        '" data-task-filter="' + escapeTaskHtml(option.key) +
        '" aria-pressed="' + (selectedTaskFilter === option.key ? 'true' : 'false') + '">' +
        '<span>' + escapeTaskHtml(option.label) + '</span>' +
        '<span class="tasks-filter-count">' + option.count + '</span>' +
        '</button>'
    ).join('');
}

function renderTaskCards(tasks) {
    const container = document.getElementById('tasks-list');
    if (!container) return;

    if (!tasks.length) {
        container.innerHTML = '<p class="task-empty-state">Nenhum trabalho pendente cadastrado.</p>';
        return;
    }

    const visibleTasks = getTasksForFilter(tasks, selectedTaskFilter);
    if (!visibleTasks.length) {
        container.innerHTML = '<p class="task-empty-state">Nenhum trabalho encontrado para este filtro.</p>';
        return;
    }

    const now = Date.now();
    container.innerHTML = visibleTasks.map(task => {
        const expired = new Date(task.deadline).getTime() <= now;
        const target = [task.serie ? 'Série ' + task.serie : '', task.team ? 'Turma ' + task.team : ''].filter(Boolean).join(' · ') || 'Todas as turmas';
        const description = task.description ? '<p class="task-description">' + escapeTaskHtml(task.description).replace(/\r?\n/g, '<br>') + '</p>' : '';
        return '<article class="data-card task-card' + (expired ? ' is-expired' : '') + '">' +
            '<div class="data-card-info"><p><strong>' + escapeTaskHtml(task.title) + '</strong></p>' +
            '<p>' + escapeTaskHtml(target) + '</p><p><strong>Prazo:</strong> ' + escapeTaskHtml(formatDeadline(task.deadline)) +
            (expired ? ' <span class="task-expired-label">PRAZO EXPIRADO</span>' : '') + '</p>' + description + '</div>' +
            '<div class="data-card-actions"><button type="button" class="btn-small btn-secondary" data-task-edit="' + escapeTaskHtml(task.id) + '">Editar</button>' +
            '<button type="button" class="btn-small btn-danger" data-task-delete="' + escapeTaskHtml(task.id) + '">Excluir</button></div></article>';
    }).join('');
}

window.editTask = id => {
    const task = taskRecords.get(String(id));
    if (task) openTaskForm(task);
};

window.deleteTask = async id => {
    const task = taskRecords.get(String(id));
    if (!task) return;
    if (!confirm('Excluir o trabalho "' + task.title + '"? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) { alert('Erro ao excluir o trabalho: ' + error.message); return; }
    await loadTasks();
    await window.refreshAdminNotifications?.();
};
