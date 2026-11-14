import { initAuth, logout } from './auth.js';
import { initEduPlanDashboard } from './eduplan-dashboard.js';
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

    await initAuth();
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

let initializedTeacherId = null;

export async function showAdmPanel() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return;

    const { data: teacher, error: teacherError } = await supabase
        .from('teachers')
        .select('id, email, display_name, avatar_key, subjects, is_primary')
        .eq('id', authData.user.id)
        .single();

    if (teacherError || !teacher) {
        console.error('Perfil de professor não encontrado:', teacherError);
        await supabase.auth.signOut();
        document.getElementById('login-container')?.classList.remove('hidden');
        document.getElementById('adm-panel')?.classList.add('hidden');
        document.querySelectorAll('.auth-stage').forEach(stage => stage.classList.add('hidden'));
        document.getElementById('login-step')?.classList.remove('hidden');
        return;
    }

    window.currentTeacher = teacher;
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('adm-panel').classList.remove('hidden');

    const avatarIcons = {
        'violet-book': 'fa-book-open',
        'blue-graduation': 'fa-graduation-cap',
        'teal-user': 'fa-user-astronaut',
        'orange-atom': 'fa-atom',
        'pink-palette': 'fa-palette',
        'indigo-globe': 'fa-earth-americas'
    };
    const profile = document.getElementById('teacher-profile');
    if (profile) {
        profile.innerHTML =
            '<span class="teacher-avatar avatar-' + (avatarIcons[teacher.avatar_key] ? teacher.avatar_key : 'violet-book') + '">' +
                '<i class="fa-solid ' + (avatarIcons[teacher.avatar_key] || 'fa-book-open') + '" aria-hidden="true"></i>' +
            '</span>' +
            '<span class="teacher-profile-copy"><strong>' + escapeAdminHtml(teacher.display_name) + '</strong>' +
                '<small>' + escapeAdminHtml((teacher.subjects || []).join(', ')) + '</small></span>';
    }

    const missionsNav = document.querySelector('.nav-btn[data-target="missions-section"]');
    const flashcardsNav = document.querySelector('.nav-btn[data-target="flashcards-section"]');
    [missionsNav, flashcardsNav].forEach(button => {
        if (!button) return;
        button.classList.toggle('hidden', !teacher.is_primary);
        button.setAttribute('aria-hidden', String(!teacher.is_primary));
        button.tabIndex = teacher.is_primary ? 0 : -1;
    });
    if (!teacher.is_primary) {
        document.getElementById('missions-section')?.classList.add('hidden');
        document.getElementById('flashcards-section')?.classList.add('hidden');
    }

    if (initializedTeacherId === teacher.id) {
        await window.refreshEduPlanDashboard?.();
        return;
    }
    initializedTeacherId = teacher.id;

    setupNavigation();
    await initEduPlanDashboard();
    initPlanner();
    initUsers();
    if (teacher.is_primary) {
        initMissions();
        initFlashcardsAdm();
    }
    initReminders();
    initTasks();

    const logoutButton = document.getElementById('btn-logout');
    if (logoutButton && logoutButton.dataset.initialized !== 'true') {
        logoutButton.dataset.initialized = 'true';
        logoutButton.addEventListener('click', logout);
    }
}

function escapeAdminHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
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
                if (target === 'dashboard-section') {
                    window.refreshEduPlanDashboard?.();
                }
            }
            setMobileNav(false);
            const pageHeading = targetSection?.querySelector('h2')?.textContent?.trim() || 'Painel do Professor';
            document.title = 'EduPlan | ' + pageHeading;
        });
    });

    const menu = document.getElementById('adm-navigation');
    const menuToggle = document.getElementById('sidebar-toggle');
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
    const isMobileLayout = () => window.matchMedia('(max-width: 920px)').matches;
    const setSidebarCollapsed = collapsed => {
        document.getElementById('adm-panel')?.classList.toggle('sidebar-collapsed', collapsed);
        if (menuToggle) {
            menuToggle.setAttribute('aria-expanded', String(!collapsed));
            menuToggle.setAttribute('aria-label', collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral');
            menuToggle.innerHTML = '<i class="fa-solid ' + (collapsed ? 'fa-bars' : 'fa-angles-left') + '" aria-hidden="true"></i>';
        }
    };
    if (menuToggle) menuToggle.addEventListener('click', () => {
        if (isMobileLayout()) {
            setMobileNav(!menu.classList.contains('mobile-open'));
        } else {
            setSidebarCollapsed(!document.getElementById('adm-panel')?.classList.contains('sidebar-collapsed'));
        }
    });
    if (menuToggle) menuToggle.innerHTML = '<i class="fa-solid fa-angles-left" aria-hidden="true"></i>';
    window.addEventListener('resize', () => {
        if (!isMobileLayout()) setMobileNav(false);
    });
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
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Sessão de professor não encontrada.');

        const { data, error } = await supabase
            .from('planner')
            .select('date, time, serie, team, activities, special, tag')
            .eq('owner', authData.user.id)
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
                        '<span class="today-plan-grade">' + escapeDashboardHtml(turma) + '</span>' +
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

    container.innerHTML = '<div class="schedule-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando horários semanais...</div>';

    const shiftConfig = {
        mat: {
            name: 'Manhã',
            icon: 'fa-sun',
            slots: [
                { label: '1º horário', time: '07:00' },
                { label: '2º horário', time: '07:50' },
                { label: '3º horário', time: '08:30' },
                { label: '4º horário', time: '09:10' },
                { label: 'Intervalo', time: '09:50', interval: true },
                { label: '5º horário', time: '10:10' },
                { label: '6º horário', time: '10:50' }
            ]
        },
        ves: {
            name: 'Tarde',
            icon: 'fa-cloud-sun',
            slots: [
                { label: '1º horário', time: '13:00' },
                { label: '2º horário', time: '13:50' },
                { label: '3º horário', time: '14:30' },
                { label: '4º horário', time: '15:10' },
                { label: 'Intervalo', time: '15:50', interval: true },
                { label: '5º horário', time: '16:10' },
                { label: '6º horário', time: '16:50' }
            ]
        }
    };

    const splitScheduleItems = value => String(value || '')
        .split(',')
        .map(item => item.replace(/[\[\]]/g, '').trim());

    const renderScheduleEntry = (rawValue, slot) => {
        if (slot.interval) {
            return '<div class="schedule-entry schedule-entry-break">' +
                '<span class="schedule-entry-index"><i class="fa-solid fa-mug-hot" aria-hidden="true"></i></span>' +
                '<span class="schedule-entry-label">Intervalo</span>' +
                '<strong class="schedule-entry-time">' + slot.time + '</strong>' +
            '</div>';
        }

        const value = String(rawValue || '').trim();
        if (!value) {
            return '<div class="schedule-entry schedule-entry-empty">' +
                '<span class="schedule-entry-index">' + slot.label.replace('º horário', 'º') + '</span>' +
                '<span class="schedule-entry-content"><strong>Sem aula cadastrada</strong></span>' +
                '<strong class="schedule-entry-time">' + slot.time + '</strong>' +
            '</div>';
        }

        const isVacant = /vago/i.test(value);
        const gradeMatch = value.match(/\b(1|2|3|6|7|8|9)\s*([ABC])\b/i);
        const yearMatch = value.match(/\b([1-3])\s*ano\b/i);
        const gradeLabel = gradeMatch
            ? (gradeMatch[1] + gradeMatch[2]).toUpperCase()
            : (yearMatch ? yearMatch[1] + 'º ano' : '');
        let subjectLabel = value;
        if (gradeMatch) subjectLabel = value.replace(gradeMatch[0], '').replace(/[-–—|]+/g, ' ').trim();
        else if (yearMatch) subjectLabel = value.replace(yearMatch[0], '').replace(/[-–—|]+/g, ' ').trim();
        if (!subjectLabel) subjectLabel = isVacant ? 'Horário livre' : value;

        return '<div class="schedule-entry ' + (isVacant ? 'schedule-entry-vacant' : '') + '">' +
            '<span class="schedule-entry-index">' + slot.label.replace('º horário', 'º') + '</span>' +
            '<span class="schedule-entry-content">' +
                '<strong>' + escapeDashboardHtml(subjectLabel) + '</strong>' +
                (gradeLabel ? '<span class="schedule-grade-badge">' + escapeDashboardHtml(gradeLabel) + '</span>' : '') +
                (isVacant ? '<span class="schedule-entry-status">Vago</span>' : '') +
            '</span>' +
            '<strong class="schedule-entry-time">' + slot.time + '</strong>' +
        '</div>';
    };

    const renderShift = (value, config, shiftKey) => {
        const entries = splitScheduleItems(value);
        const hasData = entries.some(Boolean);
        return '<section class="schedule-shift schedule-shift-' + shiftKey + '">' +
            '<header class="schedule-shift-header">' +
                '<span class="schedule-shift-icon"><i class="fa-solid ' + config.icon + '" aria-hidden="true"></i></span>' +
                '<div><h4>' + config.name + '</h4><small>' + (hasData ? 'Grade de aulas' : 'Sem horários cadastrados') + '</small></div>' +
            '</header>' +
            '<div class="schedule-period-list">' +
                config.slots.map((slot, index) => renderScheduleEntry(entries[index], slot)).join('') +
            '</div>' +
        '</section>';
    };

    try {
        const { data: rows, error } = await supabase.from('schedule').select('*');
        if (error) throw error;

        if (!rows || !rows.length) {
            container.innerHTML = '<div class="empty-state">Nenhum horário encontrado na tabela de horários.</div>';
            return;
        }

        const data = rows.find(row =>
            row.seg_mat || row.seg_ves || row.ter_mat || row.ter_ves ||
            row.qua_mat || row.qua_ves || row.qui_mat || row.qui_ves ||
            row.sex_mat || row.sex_ves
        ) || rows[0];

        const days = [
            { id: 'seg', name: 'Segunda-feira' },
            { id: 'ter', name: 'Terça-feira' },
            { id: 'qua', name: 'Quarta-feira' },
            { id: 'qui', name: 'Quinta-feira' },
            { id: 'sex', name: 'Sexta-feira' }
        ];

        const dayCards = days.map(day => {
            const morning = data[day.id + '_mat'];
            const afternoon = data[day.id + '_ves'];
            if (!morning && !afternoon) return '';

            return '<article class="schedule-day-card">' +
                '<header class="schedule-day-header">' +
                    '<span class="schedule-day-mark"><i class="fa-regular fa-calendar" aria-hidden="true"></i></span>' +
                    '<h3>' + day.name + '</h3>' +
                '</header>' +
                '<div class="schedule-shifts-grid">' +
                    renderShift(morning, shiftConfig.mat, 'morning') +
                    renderShift(afternoon, shiftConfig.ves, 'afternoon') +
                '</div>' +
            '</article>';
        }).filter(Boolean);

        if (!dayCards.length) {
            container.innerHTML = '<div class="empty-state">Nenhum dia da semana cadastrado possui horários preenchidos.</div>';
            return;
        }

        container.innerHTML = '<div class="schedule-week-grid">' + dayCards.join('') + '</div>';
    } catch (error) {
        console.error('Erro ao carregar horários do schedule:', error);
        container.innerHTML = '<div class="empty-state schedule-error">Não foi possível carregar os horários. Verifique a conexão com o Supabase e a tabela de horários.</div>';
    }
}
// Um único aviso discreto junto ao sino; a verificação periódica ocorre a cada 30 minutos.
let reminderStatusInterval = null;
let reminderAudioContext = null;
let pendingReminderSound = false;
let notificationCheckInProgress = false;
let reminderBubbleTimeout = null;

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
        gain.gain.exponentialRampToValueAtTime(0.32, context.currentTime + 0.025);
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
    if (reminderBubbleTimeout) clearTimeout(reminderBubbleTimeout);
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
        } else {
            await window.deleteReminder(notification.id);
        }
    });

    actions.append(snoozeButton, deleteButton);
    bubble.append(heading, title, meta, actions);

    // O balão fica visível por apenas 2 segundos; a bolinha continua indicando pendências.
    reminderBubbleTimeout = setTimeout(() => {
        bubble.classList.add('hidden');
        reminderBubbleTimeout = null;
    }, 2000);
}

async function checkRemindersStatus(options = {}) {
    if (notificationCheckInProgress) return;
    notificationCheckInProgress = true;
    try {
        const now = Date.now();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Sessão de professor não encontrada.');
        const [remindersResult, tasksResult] = await Promise.all([
            supabase.from('reminders').select('id, remindMeTo, date, time'),
            supabase.from('tasks').select('id, title, serie, team, deadline').eq('owner', authData.user.id)
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

