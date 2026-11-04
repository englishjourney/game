import { supabase } from '../supabaseClient.js';

let taskRecords = new Map();
const notifiedTaskIds = new Set();
let notificationAudioContext = null;
let pendingNotificationSound = false;
let taskCheckInterval = null;

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

        if (id) notifiedTaskIds.delete(String(id));
        document.getElementById('task-modal').close();
        await loadTasks();
    });

    list.addEventListener('click', event => {
        const editButton = event.target.closest('[data-task-edit]');
        const deleteButton = event.target.closest('[data-task-delete]');
        if (editButton) window.editTask(editButton.dataset.taskEdit);
        if (deleteButton) window.deleteTask(deleteButton.dataset.taskDelete);
    });

    document.addEventListener('pointerdown', primeNotificationAudio, { once: true });
    loadTasks();
    if (taskCheckInterval) clearInterval(taskCheckInterval);
    taskCheckInterval = setInterval(checkTaskDeadlines, 30000);
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
        container.innerHTML = '<p class="task-empty-state">Erro ao carregar trabalhos: ' + escapeTaskHtml(error.message) + '</p>';
        return;
    }
    taskRecords = new Map((data || []).map(task => [String(task.id), task]));
    if (!data || !data.length) {
        container.innerHTML = '<p class="task-empty-state">Nenhum trabalho pendente cadastrado.</p>';
        return;
    }

    const now = Date.now();
    container.innerHTML = data.map(task => {
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
    checkTaskDeadlines(data);
}

async function checkTaskDeadlines(existingTasks = null) {
    const result = existingTasks
        ? { data: existingTasks, error: null }
        : await supabase.from('tasks').select('id, title, serie, team, deadline');
    if (result.error || !result.data) return;
    const newlyExpired = result.data.filter(task =>
        new Date(task.deadline).getTime() <= Date.now() && !notifiedTaskIds.has(String(task.id))
    );
    newlyExpired.forEach(task => {
        notifiedTaskIds.add(String(task.id));
        showTaskToast(task);
    });
    if (newlyExpired.length) playTaskNotificationSound();
}

function showTaskToast(task) {
    const container = document.getElementById('reminder-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'reminder-toast task-toast';
    const heading = document.createElement('strong');
    heading.textContent = '⏰ Prazo de trabalho expirado:';
    const message = document.createElement('div');
    message.style.marginTop = '4px';
    const group = [task.serie ? 'Série ' + task.serie : '', task.team ? 'Turma ' + task.team : ''].filter(Boolean).join(' · ');
    message.textContent = task.title + (group ? ' — ' + group : '');
    toast.append(heading, message);
    container.appendChild(toast);
    updateTaskToastStack(container);
    setTimeout(() => { toast.remove(); updateTaskToastStack(container); }, 7000);
}

function updateTaskToastStack(container) {
    const count = container.children.length;
    container.dataset.notificationCount = String(count);
    container.classList.toggle('has-stack', count > 2);
}

function primeNotificationAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
        if (!notificationAudioContext) notificationAudioContext = new AudioContextClass();
        if (notificationAudioContext.state === 'suspended') {
            notificationAudioContext.resume().then(() => {
                if (pendingNotificationSound) {
                    pendingNotificationSound = false;
                    playTaskNotificationSound();
                }
            }).catch(() => {});
        }
    } catch (error) { console.warn('Áudio de notificação indisponível:', error); }
}

async function playTaskNotificationSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
        if (!notificationAudioContext) notificationAudioContext = new AudioContextClass();
        if (notificationAudioContext.state === 'suspended') await notificationAudioContext.resume();
        const context = notificationAudioContext;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(740, context.currentTime);
        oscillator.frequency.setValueAtTime(940, context.currentTime + 0.16);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.44);
    } catch (error) {
        pendingNotificationSound = true;
        console.info('O navegador bloqueou o áudio até uma interação do usuário.');
    }
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
    notifiedTaskIds.delete(String(id));
    await loadTasks();
};
