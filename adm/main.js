import { initAuth, isAdmLoggedIn, logout } from './auth.js';
import { initPlanner } from './planner.js';
import { initUsers } from './users.js';
import { initMissions } from './missions.js';
import { initFlashcardsAdm } from './flashcardsAdm.js';
import { initTasks } from './tasks.js';
import { supabase } from '../supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. REGISTRA O SERVICE WORKER NA PASTA ADM
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('Service Worker da ADM registrado com sucesso!');
                verificarESalvarAulasNoCache(registration);
            })
            .catch((error) => {
                console.error('Falha ao registrar o Service Worker:', error);
            });
    }

    const loggedIn = await isAdmLoggedIn();
    if (!loggedIn) {
        initAuth();
    } else {
        showAdmPanel();
    }
});

function verificarESalvarAulasNoCache(swRegistration) {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    let cacheAulas = localStorage.getItem('yuki_planejamento_semana');

    if (!cacheAulas) {
        const dadosExemplo = [
            { date: "06/10/2026", time: "07:00", serie: "9", team: "B", activities: "Leitura do Capítulo 3 e gramática." },
            { date: "06/10/2026", time: "08:30", serie: "7", team: "A", activities: "Introdução ao vocabulário de saúde." }
        ];
        localStorage.setItem('yuki_planejamento_semana', JSON.stringify(dadosExemplo));
        cacheAulas = JSON.stringify(dadosExemplo);
    }

    const aulas = JSON.parse(cacheAulas);
    const hojeStr = new Date().toLocaleDateString('pt-BR');

    const aulasDeHoje = aulas.filter(a => a.date === hojeStr);

    if (aulasDeHoje.length > 0 && swRegistration.active) {
        swRegistration.active.postMessage({
            type: 'SCHEDULE_NOTIFICATIONS',
            aulas: aulasDeHoje
        });
    }
}

export function showAdmPanel() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('adm-panel').classList.remove('hidden');
    
    setupNavigation();
    setupDashboard();
    initPlanner();
    initUsers();
    initMissions();
    initFlashcardsAdm();
    initReminders(); // Inicialização dos lembretes
    initTasks();
    
    document.getElementById('btn-logout').addEventListener('click', logout);
}

function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn[data-target]');
    const sections = document.querySelectorAll('.content-section');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.add('hidden'));
            
            btn.classList.add('active');
            const target = btn.dataset.target;
            const targetSection = document.getElementById(target);
            if (targetSection) {
                targetSection.classList.remove('hidden');
                if (target === 'reminders-section') {
                    loadRemindersSection();
                }
            }
            setMobileNav(false);
        });
    });

    const menu = document.getElementById('adm-navigation');
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const menuClose = document.getElementById('mobile-menu-close');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    const setMobileNav = open => {
        if (!menu || !backdrop) return;
        menu.classList.toggle('mobile-open', open);
        backdrop.classList.toggle('is-visible', open);
        backdrop.setAttribute('aria-hidden', String(!open));
        if (menuToggle) menuToggle.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('mobile-nav-active', open);
    };
    if (menuToggle) menuToggle.addEventListener('click', () => setMobileNav(!menu.classList.contains('mobile-open')));
    if (menuClose) menuClose.addEventListener('click', () => setMobileNav(false));
    if (backdrop) backdrop.addEventListener('click', () => setMobileNav(false));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') setMobileNav(false); });
}

async function setupDashboard() {
    const searchInput = document.getElementById('global-search');
    const resultsContainer = document.getElementById('search-results');

    if (searchInput && resultsContainer) {
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (query.length < 3) {
                resultsContainer.classList.add('hidden');
                return;
            }

            resultsContainer.innerHTML = '<div class="search-item">Buscando...</div>';
            resultsContainer.classList.remove('hidden');

            try {
                const { data: users } = await supabase.from('users').select('name, username, grade').ilike('name', `%${query}%`).limit(3);
                const { data: planners } = await supabase.from('planner').select('serie, team, activities').ilike('activities', `%${query}%`).limit(3);

                let html = '';
                if (users && users.length) {
                    html += '<div style="padding: 5px 10px; color: var(--primary); font-size: 0.8em">Alunos</div>';
                    users.forEach(u => html += `<div class="search-item">${u.name} (${u.username}) - ${u.grade || 'Sem turma'}</div>`);
                }
                if (planners && planners.length) {
                    html += '<div style="padding: 5px 10px; color: var(--primary); font-size: 0.8em">Planejamentos</div>';
                    planners.forEach(p => html += `<div class="search-item">${p.serie} ${p.team}: ${p.activities.substring(0,30)}...</div>`);
                }

                if (!html) html = '<div class="search-item">Nenhum resultado.</div>';
                resultsContainer.innerHTML = html;
            } catch (err) {
                console.error(err);
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== searchInput && e.target !== resultsContainer) {
                resultsContainer.classList.add('hidden');
            }
        });
    }

    // Carrega em paralelo as aulas do dia e os horários semanais.
    await Promise.all([loadTodayPlans(), loadSchedule()]);
}

function escapeDashboardHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

async function loadTodayPlans() {
    const container = document.getElementById('today-plans-container');
    if (!container) return;

    const today = new Date();
    const pad = value => String(value).padStart(2, '0');
    const todayKey = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    const dateLabel = today.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long'
    });

    container.innerHTML = '<div class="today-plans-panel"><div class="today-plans-loading">Carregando aulas de hoje...</div></div>';

    try {
        const { data, error } = await supabase
            .from('planner')
            .select('date, time, serie, team, activities, special, tag')
            .is('completed_at', null);

        if (error) throw error;

        const plansForToday = (data || []).filter(item => {
            const rawDate = String(item.date || '').trim();
            const parts = rawDate.split(/[/-]/);
            if (parts.length !== 3) return false;

            const [year, month, day] = parts[0].length === 4
                ? parts
                : [parts[2], parts[1], parts[0]];

            const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
            if (
                Number.isNaN(parsedDate.getTime()) ||
                parsedDate.getFullYear() !== Number(year) ||
                parsedDate.getMonth() !== Number(month) - 1 ||
                parsedDate.getDate() !== Number(day)
            ) return false;

            return year + '-' + pad(month) + '-' + pad(day) === todayKey;
        }).sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));

        const plansHtml = plansForToday.length
            ? plansForToday.map(item => {
                const turma = item.serie && item.team
                    ? 'Turma ' + item.serie + item.team
                    : (item.serie ? 'Série ' + item.serie : (item.team ? 'Turma ' + item.team : 'Sem turma'));
                const specialLabels = {
                    1: 'Aula especial',
                    2: 'Folga',
                    3: 'Prova',
                    4: 'Aula adaptada'
                };
                const specialLabel = specialLabels[Number(item.special)] || item.tag || '';
                const activities = item.activities
                    ? escapeDashboardHtml(item.activities).replace(/\r?\n/g, '<br>')
                    : 'Atividades não informadas';
                return '<article class="today-plan-item">' +
                    '<span class="today-plan-time">' + escapeDashboardHtml(item.time || '—') + '</span>' +
                    '<div class="today-plan-details">' +
                        '<strong>' + escapeDashboardHtml(turma) + '</strong>' +
                        (specialLabel ? '<span class="today-plan-type">' + escapeDashboardHtml(specialLabel) + '</span>' : '') +
                        '<div class="today-plan-activities"><small>Atividades</small><p>' + activities + '</p></div>' +
                    '</div>' +
                '</article>';
            }).join('')
            : '<p class="today-plans-empty">Sem aulas para hoje</p>';

        container.innerHTML =
            '<section class="today-plans-panel">' +
                '<div class="today-plans-header">' +
                    '<h3><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> Aulas planejadas para hoje</h3>' +
                    '<span>' + escapeDashboardHtml(dateLabel) + '</span>' +
                '</div>' +
                '<div class="today-plans-list">' + plansHtml + '</div>' +
            '</section>';
    } catch (error) {
        console.error('Erro ao carregar as aulas de hoje:', error);
        container.innerHTML =
            '<section class="today-plans-panel">' +
                '<div class="today-plans-header"><h3><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> Aulas planejadas para hoje</h3></div>' +
                '<p class="today-plans-empty">Não foi possível carregar as aulas de hoje.</p>' +
            '</section>';
    }
}

async function loadSchedule() {
    const container = document.getElementById('schedule-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Carregando horários semanais...</div>';

    try {
        const { data: rows, error } = await supabase.from('schedule').select('*');
        
        if (error) throw error;
        
        if (!rows || rows.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum horário encontrado na tabela "schedule".</div>';
            return;
        }

        // Pega a linha preenchida ou a primeira linha da tabela
        const data = rows.find(r => r.seg_mat || r.seg_ves || r.ter_mat || r.ter_ves || r.qua_mat || r.qua_ves) || rows[0];

        const dias = [
            { id: 'seg', nome: 'Segunda-Feira' },
            { id: 'ter', nome: 'Terça-Feira' },
            { id: 'qua', nome: 'Quarta-Feira' },
            { id: 'qui', nome: 'Quinta-Feira' },
            { id: 'sex', nome: 'Sexta-Feira' }
        ];

        let html = '';
        
        dias.forEach(dia => {
            const mat = data[`${dia.id}_mat`];
            const ves = data[`${dia.id}_ves`];

            // Se o dia inteiro estiver totalmente vazio, pula
            if (!mat && !ves) return;

            // Card principal do dia da semana
            html += `<div class="schedule-card" style="margin-bottom: 25px; border: 1px solid var(--border); padding: 20px; border-radius: 10px; background: var(--bg-card); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h3 style="text-align: center; border-bottom: 2px solid var(--border); padding-bottom: 12px; margin-bottom: 20px; color: var(--primary); font-size: 1.4rem;">${dia.nome}</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">`;

            const renderTurno = (turnoStr, turnoNome) => {
                let turnoHtml = `<div style="background: var(--bg-dark); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column;">
                    <strong style="display: block; margin-bottom: 12px; text-align: center; color: var(--primary); font-size: 1.1rem; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 6px;">${turnoNome}</strong>`;

                // Se a coluna estiver totalmente vazia, exibe "Sem horários"
                if (!turnoStr || turnoStr.trim() === '') {
                    turnoHtml += `<div style="text-align: center; padding: 20px; color: #888; font-style: italic; margin: auto;">Sem horários</div></div>`;
                    return turnoHtml;
                }
                
                // Quebra o texto por vírgulas e remove colchetes e espaços extras
                const items = turnoStr.split(',').map(item => item.replace(/[\[\]]/g, '').trim()).filter(item => item !== '');

                if (items.length === 0) {
                    turnoHtml += `<div style="text-align: center; padding: 20px; color: #888; font-style: italic; margin: auto;">Sem horários</div></div>`;
                    return turnoHtml;
                }

                turnoHtml += `<ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">`;

                items.forEach(text => {
                    let bg = 'rgba(255, 255, 255, 0.05)';
                    let color = 'white';
                    let borderColor = 'rgba(255,255,255,0.1)';

                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('vago')) {
                        bg = '#eab308'; // Amarelo
                        color = '#000';
                        borderColor = '#ca8a04';
                    } else if (lowerText.includes('intervalo')) {
                        bg = '#ef4444'; // Vermelho
                        color = '#fff';
                        borderColor = '#b91c1c';
                    }

                    turnoHtml += `<li style="background-color: ${bg}; color: ${color}; padding: 10px; border-radius: 6px; text-align: center; font-weight: 500; border: 1px solid ${borderColor};">${text}</li>`;
                });

                turnoHtml += `</ul></div>`;
                return turnoHtml;
            };

            // Renderiza as seções Matutino e Vespertino lado a lado
            html += renderTurno(mat, 'Matutino');
            html += renderTurno(ves, 'Vespertino');
            
            html += `</div></div>`;
        });

        if (!html) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum dia da semana cadastrado possui horários preenchidos.</div>';
            return;
        }

        container.innerHTML = html;
    } catch (err) {
        console.error("Erro ao carregar horários do schedule:", err);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">Erro ao carregar os horários. Verifique a conexão com o Supabase e a tabela "schedule".</div>';
    }
}
// Um único aviso discreto junto ao sino; a verificação periódica ocorre a cada 30 minutos.
let reminderStatusInterval = null;
let reminderAudioContext = null;
let pendingReminderSound = false;
let notificationCheckInProgress = false;

export function initReminders() {
    const btnReminders = document.getElementById('btn-reminders');
    const dropdown = document.getElementById('reminders-dropdown');
    const btnNew = document.getElementById('btn-dropdown-new-reminder');
    const btnSee = document.getElementById('btn-dropdown-see-reminders');
    const modalForm = document.getElementById('modal-reminder-form');
    const btnSaveForm = document.getElementById('btn-save-reminder-form');
    const btnCancelForm = document.getElementById('btn-cancel-reminder-form');

    if (!btnReminders || !dropdown) return;

    btnReminders.addEventListener('click', event => {
        event.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', event => {
        if (!dropdown.contains(event.target) && !btnReminders.contains(event.target)) {
            dropdown.classList.add('hidden');
        }
    });

    if (btnNew) {
        btnNew.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            openReminderFormModal();
        });
    }

    if (btnSee) {
        btnSee.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            const remindersNavBtn = document.querySelector('[data-target="reminders-section"]');
            if (remindersNavBtn) remindersNavBtn.click();
        });
    }

    const btnAddReminderFromSection = document.getElementById('btn-add-reminder-from-section');
    if (btnAddReminderFromSection) btnAddReminderFromSection.addEventListener('click', () => openReminderFormModal());

    if (btnSaveForm) {
        btnSaveForm.addEventListener('click', async () => {
            const id = document.getElementById('reminder-edit-id').value;
            const remindMeTo = document.getElementById('reminder-text').value.trim();
            const date = document.getElementById('reminder-date').value;
            const time = document.getElementById('reminder-time').value;

            if (!remindMeTo || !date || !time) {
                alert('Por favor, preencha todos os campos do lembrete.');
                return;
            }

            try {
                if (id) {
                    const { error } = await supabase.from('reminders').update({ remindMeTo, date, time }).eq('id', id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('reminders').insert([{ remindMeTo, date, time }]);
                    if (error) throw error;
                }
                modalForm.classList.add('hidden');
                await checkRemindersStatus();
                await loadRemindersSection();
            } catch (err) {
                console.error('Erro ao salvar lembrete:', err);
                alert('Erro ao salvar o lembrete.');
            }
        });
    }

    if (btnCancelForm) btnCancelForm.addEventListener('click', () => modalForm.classList.add('hidden'));

    // O navegador exige interação prévia para liberar áudio em algumas situações.
    document.addEventListener('pointerdown', primeReminderAudio, { once: true });
    checkRemindersStatus();

    if (!reminderStatusInterval) {
        reminderStatusInterval = setInterval(() => {
            checkRemindersStatus({ playSound: true });
        }, 30 * 60 * 1000);
    }
}

// Abrir modal de formulário
function openReminderFormModal(data = null) {
    const modalForm = document.getElementById('modal-reminder-form');
    document.getElementById('reminder-modal-title').innerText = data ? 'Editar / Adiar Lembrete' : 'Novo Lembrete';
    document.getElementById('reminder-edit-id').value = data ? data.id : '';
    document.getElementById('reminder-text').value = data ? data.remindMeTo : '';
    document.getElementById('reminder-date').value = data ? data.date : '';
    document.getElementById('reminder-time').value = data ? data.time : '';
    modalForm.classList.remove('hidden');
}

// Carregar e renderizar lembretes na guia dedicada do menu
export async function loadRemindersSection() {
    const container = document.getElementById('reminder-items-container');
    if (!container) return;
    
    container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Carregando lembretes...</div>';

    try {
        const { data: reminders, error } = await supabase.from('reminders').select('*').order('date', { ascending: true });
        if (error) throw error;

        if (!reminders || reminders.length === 0) {
            container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Nenhum lembrete agendado.</div>';
            return;
        }

        let html = '';
        reminders.forEach(item => {
            html += `
                <div style="background: var(--bg-card, #1e293b); border: 1px solid var(--border, #334155); padding: 15px; border-radius: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: #fff; display: block; margin-bottom: 4px; font-size: 1rem;">${item.remindMeTo}</strong>
                        <small style="color: var(--primary, #38bdf8);"><i class="fa-regular fa-clock"></i> ${item.date} às ${item.time}</small>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="window.editReminder('${item.id}', '${encodeURIComponent(item.remindMeTo)}', '${item.date}', '${item.time}')" style="background: #eab308; color: #000; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold;">Adiar / Editar</button>
                        <button onclick="window.deleteReminder('${item.id}')" style="background: #ef4444; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Excluir</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (err) {
        console.error('Erro ao buscar lembretes:', err);
        container.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 20px;">Erro ao carregar lembretes.</div>';
    }
}

// Funções globais para escutar os cliques dentro da lista HTML
// Exclui um lembrete e atualiza imediatamente o indicador e o aviso discreto.
window.deleteReminder = async function(id) {
    if (!confirm('Deseja realmente excluir este lembrete?')) return;
    try {
        const { error } = await supabase.from('reminders').delete().eq('id', id);
        if (error) throw error;
        await loadRemindersSection();
        await checkRemindersStatus();
    } catch (err) {
        console.error('Erro ao excluir:', err);
    }
};

window.editReminder = function(id, text, date, time) {
    openReminderFormModal({ id, remindMeTo: decodeURIComponent(text), date, time });
};

function parseReminderTimestamp(dateValue, timeValue) {
    const parts = String(dateValue || '').trim().split(/[/-]/);
    if (parts.length !== 3) return NaN;
    const [year, month, day] = parts[0].length === 4 ? parts : [parts[2], parts[1], parts[0]];
    const [hours, minutes] = String(timeValue || '00:00').split(':');
    const timestamp = new Date(Number(year), Number(month) - 1, Number(day), Number(hours || 0), Number(minutes || 0));
    if (Number.isNaN(timestamp.getTime()) || timestamp.getFullYear() !== Number(year) ||
        timestamp.getMonth() !== Number(month) - 1 || timestamp.getDate() !== Number(day)) return NaN;
    return timestamp.getTime();
}

function primeReminderAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
        if (!reminderAudioContext) reminderAudioContext = new AudioContextClass();
        if (reminderAudioContext.state === 'suspended') {
            reminderAudioContext.resume().then(() => {
                if (pendingReminderSound) {
                    pendingReminderSound = false;
                    playReminderNotificationSound();
                }
            }).catch(() => {});
        } else if (pendingReminderSound) {
            pendingReminderSound = false;
            playReminderNotificationSound();
        }
    } catch (error) {
        console.warn('Áudio de notificação indisponível:', error);
    }
}

async function playReminderNotificationSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
        if (!reminderAudioContext) reminderAudioContext = new AudioContextClass();
        if (reminderAudioContext.state === 'suspended') await reminderAudioContext.resume();
        if (reminderAudioContext.state !== 'running') {
            pendingReminderSound = true;
            return;
        }
        const context = reminderAudioContext;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(740, context.currentTime);
        oscillator.frequency.setValueAtTime(940, context.currentTime + 0.16);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.44);
    } catch (error) {
        pendingReminderSound = true;
        console.info('O navegador bloqueou o áudio até uma interação do usuário.');
    }
}

function renderExpiredNotification(notification) {
    const bubble = document.getElementById('reminder-chat-bubble');
    if (!bubble) return;
    bubble.replaceChildren();
    if (!notification) {
        bubble.classList.add('hidden');
        return;
    }
    bubble.classList.remove('hidden');

    const heading = document.createElement('span');
    heading.className = 'reminder-chat-label';
    heading.textContent = notification.type === 'task' ? 'Prazo expirado' : 'Lembrete expirado';

    const title = document.createElement('strong');
    title.className = 'reminder-chat-title';
    title.textContent = notification.title;

    const meta = document.createElement('small');
    meta.className = 'reminder-chat-meta';
    meta.textContent = 'Vencido em ' + new Date(notification.timestamp).toLocaleString('pt-BR', {
        dateStyle: 'short', timeStyle: 'short'
    });

    const actions = document.createElement('div');
    actions.className = 'reminder-chat-actions';

    const snoozeButton = document.createElement('button');
    snoozeButton.type = 'button';
    snoozeButton.className = 'reminder-chat-snooze';
    snoozeButton.textContent = 'Adiar';
    snoozeButton.addEventListener('click', () => {
        bubble.classList.add('hidden');
        if (notification.type === 'task') {
            if (typeof window.editTask === 'function') window.editTask(String(notification.id));
        } else {
            openReminderFormModal({
                id: notification.id,
                remindMeTo: notification.title,
                date: notification.date,
                time: notification.time
            });
        }
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'reminder-chat-delete';
    deleteButton.textContent = 'Excluir';
    deleteButton.addEventListener('click', async () => {
        if (notification.type === 'task') {
            if (typeof window.deleteTask === 'function') await window.deleteTask(String(notification.id));
            await checkRemindersStatus();
        } else {
            await window.deleteReminder(notification.id);
        }
    });

    actions.append(snoozeButton, deleteButton);
    bubble.append(heading, title, meta, actions);
}

async function checkRemindersStatus(options = {}) {
    if (notificationCheckInProgress) return;
    notificationCheckInProgress = true;
    try {
        const now = Date.now();
        const [remindersResult, tasksResult] = await Promise.all([
            supabase.from('reminders').select('id, remindMeTo, date, time'),
            supabase.from('tasks').select('id, title, serie, team, deadline')
        ]);
        if (remindersResult.error) throw remindersResult.error;
        if (tasksResult.error) console.warn('Não foi possível consultar os prazos dos trabalhos:', tasksResult.error);

        const expired = [];
        (remindersResult.data || []).forEach(reminder => {
            const timestamp = parseReminderTimestamp(reminder.date, reminder.time);
            if (Number.isFinite(timestamp) && timestamp <= now) {
                expired.push({
                    type: 'reminder', id: reminder.id,
                    title: reminder.remindMeTo || 'Lembrete sem título',
                    date: reminder.date, time: reminder.time, timestamp
                });
            }
        });
        (tasksResult.data || []).forEach(task => {
            const timestamp = new Date(task.deadline).getTime();
            if (Number.isFinite(timestamp) && timestamp <= now) {
                expired.push({
                    type: 'task', id: task.id,
                    title: task.title || 'Trabalho sem título',
                    timestamp
                });
            }
        });

        // A notificação mais antiga é a que está vencida há mais tempo.
        expired.sort((a, b) => a.timestamp - b.timestamp);
        const oldestExpired = expired[0] || null;
        const badge = document.getElementById('reminders-badge');
        if (badge) badge.classList.toggle('hidden', !oldestExpired);
        renderExpiredNotification(oldestExpired);

        if (oldestExpired && options.playSound) await playReminderNotificationSound();
    } catch (err) {
        console.error('Erro ao verificar notificações expiradas:', err);
    } finally {
        notificationCheckInProgress = false;
    }
}

window.refreshAdminNotifications = () => checkRemindersStatus();

