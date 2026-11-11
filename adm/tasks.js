import { supabase } from '../supabaseClient.js';

let taskRecords = new Map();
let selectedTaskFilter = 'all';
let availableTaskGrades = [];
let taskGradesLoadPromise = null;
let selectedTaskGrades = new Set();

export function initTasks() {
    const form = document.getElementById('task-form');
    const addButton = document.getElementById('btn-add-task');
    const cancelButton = document.getElementById('btn-cancel-task');
    const list = document.getElementById('tasks-list');
    if (!form || !addButton || !cancelButton || !list) return;

    addButton.addEventListener('click', async () => {
        await loadTaskGrades();
        openTaskForm();
    });
    cancelButton.addEventListener('click', () => document.getElementById('task-modal').close());

    const gradeOptions = document.getElementById('task-grades-options');
    gradeOptions?.addEventListener('click', event => {
        const button = event.target.closest('[data-task-grade]');
        if (!button) return;
        const grade = button.dataset.taskGrade;
        if (selectedTaskGrades.has(grade)) selectedTaskGrades.delete(grade);
        else selectedTaskGrades.add(grade);
        button.classList.toggle('selected', selectedTaskGrades.has(grade));
        button.setAttribute('aria-pressed', String(selectedTaskGrades.has(grade)));
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const id = document.getElementById('task-id').value;
        const localDeadline = document.getElementById('task-deadline').value;
        if (!localDeadline) { alert('Informe o prazo final do trabalho.'); return; }
        const selectedGrades = Array.from(selectedTaskGrades).sort((a, b) =>
            a.localeCompare(b, 'pt-BR', { numeric: true })
        );
        if (!selectedGrades.length) {
            alert('Selecione pelo menos um grade para este trabalho.');
            return;
        }

        const taskData = {
            title: document.getElementById('task-title').value.trim(),
            description: document.getElementById('task-description').value.trim(),
            grades: selectedGrades,
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

    // Carrega os grades disponíveis e os trabalhos uma vez ao abrir a seção.
    loadTaskGrades();
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

async function loadTaskGrades() {
    if (availableTaskGrades.length) return availableTaskGrades;
    if (taskGradesLoadPromise) return taskGradesLoadPromise;

    taskGradesLoadPromise = (async () => {
        const { data, error } = await supabase
            .from('users')
            .select('grade')
            .not('grade', 'is', null);

        if (error) {
            console.error('Erro ao carregar grades dos alunos:', error);
        }

        const gradesFromUsers = (data || [])
            .map(user => String(user.grade || '').trim().toUpperCase())
            .filter(Boolean);

        // Fallback para manter o formulário utilizável caso a consulta de usuários falhe.
        const fallbackGrades = [
            '1A', '2A', '3A',
            '6A', '6B', '6C',
            '7A', '7B', '7C',
            '8A', '8B', '8C',
            '9A', '9B', '9C'
        ];

        availableTaskGrades = Array.from(new Set(gradesFromUsers.length ? gradesFromUsers : fallbackGrades))
            .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

        return availableTaskGrades;
    })();

    try {
        return await taskGradesLoadPromise;
    } finally {
        taskGradesLoadPromise = null;
    }
}

function getTaskGrades(task) {
    if (Array.isArray(task?.grades)) {
        return Array.from(new Set(task.grades.map(grade => String(grade || '').trim().toUpperCase()).filter(Boolean)));
    }

    const serie = String(task?.serie || '').trim();
    const team = String(task?.team || '').trim().toUpperCase();
    return serie && team ? [serie + team] : [];
}

function renderTaskGradeOptions() {
    const container = document.getElementById('task-grades-options');
    if (!container) return;

    if (!availableTaskGrades.length) {
        container.innerHTML = '<p class="task-grade-empty">Nenhuma turma disponível.</p>';
        return;
    }

    container.innerHTML = availableTaskGrades.map(grade => {
        const selected = selectedTaskGrades.has(grade);
        return '<button type="button" class="task-grade-tag' + (selected ? ' selected' : '') +
            '" data-task-grade="' + escapeTaskHtml(grade) +
            '" aria-pressed="' + String(selected) + '">' + escapeTaskHtml(grade) + '</button>';
    }).join('');
}

function openTaskForm(task = null) {
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = task ? task.id : '';
    document.getElementById('task-title').value = task ? task.title : '';
    document.getElementById('task-description').value = task ? task.description || '' : '';
    selectedTaskGrades = new Set(task ? getTaskGrades(task) : []);
    renderTaskGradeOptions();
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
        getTaskGrades(task).forEach(grade => {
            const key = 'grade|' + grade;
            options.set(key, { key, label: grade });
        });
    });

    return Array.from(options.values()).sort((a, b) =>
        a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
    );
}

function getTasksForFilter(tasks, filterKey) {
    if (!filterKey || filterKey === 'all') return tasks;

    const [type, grade] = filterKey.split('|');
    if (type !== 'grade') return tasks;

    return tasks.filter(task => {
        const taskGrades = getTaskGrades(task);
        // Trabalhos sem alvo definido continuam aparecendo para todas as turmas.
        return !taskGrades.length || taskGrades.includes(grade);
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
        const grades = getTaskGrades(task);
        const target = grades.length
            ? '<div class="task-grade-badges" aria-label="Grades selecionados">' + grades.map(grade =>
                '<span class="task-grade-badge">' + escapeTaskHtml(grade) + '</span>'
            ).join('') + '</div>'
            : '<p>Todas as turmas</p>';
        const description = task.description ? '<p class="task-description">' + escapeTaskHtml(task.description).replace(/\r?\n/g, '<br>') + '</p>' : '';
        return '<article class="data-card task-card' + (expired ? ' is-expired' : '') + '">' +
            '<div class="data-card-info"><p><strong>' + escapeTaskHtml(task.title) + '</strong></p>' +
            target + '<p><strong>Prazo:</strong> ' + escapeTaskHtml(formatDeadline(task.deadline)) +
            (expired ? ' <span class="task-expired-label">PRAZO EXPIRADO</span>' : '') + '</p>' + description + '</div>' +
            '<div class="data-card-actions"><button type="button" class="btn-small btn-secondary" data-task-edit="' + escapeTaskHtml(task.id) + '">Editar</button>' +
            '<button type="button" class="btn-small btn-danger" data-task-delete="' + escapeTaskHtml(task.id) + '">Excluir</button></div></article>';
    }).join('');
}

window.editTask = async id => {
    const task = taskRecords.get(String(id));
    if (!task) return;
    await loadTaskGrades();
    openTaskForm(task);
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
