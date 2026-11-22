import { initAuth, logout } from './auth.js';
import { initEduPlanDashboard } from './eduplan-dashboard.js?v=dashboard-layout-fix-20261122';
import { initPlanner } from './planner.js?v=multi-copy-20261117';
import { initUsers } from './users.js?v=users-refresh-anchor2-20261119';
import { initMissions } from './missions.js';
import { initFlashcardsAdm } from './flashcardsAdm.js';
import { initTasks } from './tasks.js';
import { supabase } from '../supabaseClient.js';
import { getTeacherAvatar, getTeacherAvatarOptions } from './teacher-avatars.js';

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
            { date: "06/10/2026", time: "07:00", grade: "9B", activities: "Leitura do Capítulo 3 e gramática." },
            { date: "06/10/2026", time: "08:30", grade: "7A", activities: "Introdução ao vocabulário de saúde." }
        ];
        localStorage.setItem('yuki_planejamento_semana', JSON.stringify(dadosExemplo));
        cacheAulas = JSON.stringify(dadosExemplo);
    }

    const aulas = (Array.isArray(JSON.parse(cacheAulas)) ? JSON.parse(cacheAulas) : []).map(aula => {
        const grade = String(aula.grade || [aula.serie, aula.team].filter(Boolean).join('') || '').trim().toUpperCase();
        const { serie, team, ...aulaAtualizada } = aula;
        return { ...aulaAtualizada, grade };
    });
    localStorage.setItem('yuki_planejamento_semana', JSON.stringify(aulas));
    const hojeStr = new Date().toLocaleDateString('pt-BR');

    const aulasDeHoje = aulas.filter(a => a.date === hojeStr);

    if (aulasDeHoje.length > 0 && swRegistration.active) {
        swRegistration.active.postMessage({
            type: 'SCHEDULE_NOTIFICATIONS',
            aulas: aulasDeHoje
        });
    }
}


let yukiPlannerMessageTimer = null;

function teacherHasEnglish(teacher) {
    const subjects = Array.isArray(teacher?.subjects)
        ? teacher.subjects
        : (teacher?.subjects ? [teacher.subjects] : []);

    return subjects.some(subject =>
        String(subject || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase() === 'ingles'
    );
}

function setupYukiPlannerAccess() {
    const button = document.getElementById('btn-yuki-planner');
    const message = document.getElementById('yuki-planner-status');
    if (!button || button.dataset.accessHandlerInitialized === 'true') return;

    button.dataset.accessHandlerInitialized = 'true';
    button.addEventListener('click', event => {
        event.preventDefault();

        if (teacherHasEnglish(window.currentTeacher)) {
            if (message) {
                message.hidden = true;
                message.textContent = '';
            }
            window.open('https://englishjourney.github.io/game/adm/yukiplanner/index.html', '_blank', 'noopener');
            return;
        }

        if (!message) return;
        message.textContent = 'Em breve...';
        message.hidden = false;
        if (yukiPlannerMessageTimer) clearTimeout(yukiPlannerMessageTimer);
        yukiPlannerMessageTimer = setTimeout(() => {
            message.hidden = true;
        }, 2800);
    });
}

let initializedTeacherId = null;

export async function showAdmPanel() {
    // Keep one loader operation open until every module has completed its first data load.
    const finishPanelLoad = window.EnglishJourneyLoader?.beginOperation({ immediate: true });
    try {
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
        setupYukiPlannerAccess();
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('adm-panel').classList.remove('hidden');

        renderTeacherProfile(teacher);

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

        const initialLoads = [
            Promise.resolve().then(() => initPlanner()),
            Promise.resolve().then(() => initUsers()),
            Promise.resolve().then(() => initReminders()),
            Promise.resolve().then(() => initTasks())
        ];
        if (teacher.is_primary) {
            initialLoads.push(
                Promise.resolve().then(() => initMissions()),
                Promise.resolve().then(() => initFlashcardsAdm())
            );
        }

        const loadResults = await Promise.allSettled(initialLoads);
        loadResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error('Erro durante o carregamento inicial do módulo administrativo ' + (index + 1) + ':', result.reason);
            }
        });

        const logoutButton = document.getElementById('btn-logout');
        if (logoutButton && logoutButton.dataset.initialized !== 'true') {
            logoutButton.dataset.initialized = 'true';
            logoutButton.addEventListener('click', logout);
        }
    } finally {
        finishPanelLoad?.();
    }
}


function createTeacherAvatarVisual(option, className) {
    const visual = document.createElement('span');
    visual.className = className;
    visual.style.backgroundColor = option.background;

    const appendFallbackIcon = () => {
        const icon = document.createElement('i');
        icon.className = 'fa-solid ' + option.icon;
        icon.setAttribute('aria-hidden', 'true');
        visual.appendChild(icon);
    };

    if (option.file) {
        const image = document.createElement('img');
        image.src = './avatars/' + option.file;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            image.remove();
            appendFallbackIcon();
        }, { once: true });
        visual.appendChild(image);
    } else {
        appendFallbackIcon();
    }

    return visual;
}

function closeTeacherAvatarModal() {
    const modal = document.getElementById('teacher-avatar-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
}

function setupTeacherAvatarModal() {
    const modal = document.getElementById('teacher-avatar-modal');
    const optionsContainer = document.getElementById('teacher-avatar-options');
    const closeButton = document.getElementById('teacher-avatar-close');
    if (!modal || !optionsContainer || modal.dataset.initialized === 'true') return;

    modal.dataset.initialized = 'true';
    closeButton?.addEventListener('click', closeTeacherAvatarModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeTeacherAvatarModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeTeacherAvatarModal();
        }
    });

    optionsContainer.addEventListener('click', async event => {
        const button = event.target.closest('[data-teacher-avatar-key]');
        if (!button || button.disabled) return;

        const teacher = window.currentTeacher;
        const avatarKey = button.dataset.teacherAvatarKey;
        if (!teacher || !avatarKey) return;
        if (teacher.avatar_key === avatarKey) {
            closeTeacherAvatarModal();
            return;
        }

        const message = document.getElementById('teacher-avatar-message');
        optionsContainer.querySelectorAll('button').forEach(item => { item.disabled = true; });
        if (message) message.textContent = 'Salvando foto de perfil...';

        try {
            const { data, error } = await supabase
                .from('teachers')
                .update({ avatar_key: avatarKey })
                .eq('id', teacher.id)
                .select('avatar_key')
                .single();

            if (error) throw error;
            teacher.avatar_key = data.avatar_key;
            window.currentTeacher = teacher;
            renderTeacherProfile(teacher);
            closeTeacherAvatarModal();
        } catch (error) {
            console.error('Erro ao atualizar avatar do professor:', error);
            if (message) message.textContent = 'Não foi possível salvar a foto. Tente novamente.';
            optionsContainer.querySelectorAll('button').forEach(item => { item.disabled = false; });
        }
    });
}

function openTeacherAvatarModal(teacher) {
    const modal = document.getElementById('teacher-avatar-modal');
    const optionsContainer = document.getElementById('teacher-avatar-options');
    const message = document.getElementById('teacher-avatar-message');
    if (!modal || !optionsContainer) return;

    setupTeacherAvatarModal();
    optionsContainer.replaceChildren();

    getTeacherAvatarOptions(teacher.subjects).forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'teacher-avatar-choice';
        button.dataset.teacherAvatarKey = option.key;
        button.setAttribute('aria-pressed', String(teacher.avatar_key === option.key));
        button.title = option.subject;

        button.appendChild(createTeacherAvatarVisual(option, 'teacher-avatar-choice-visual'));
        const label = document.createElement('span');
        label.textContent = option.subject;
        button.appendChild(label);
        optionsContainer.appendChild(button);
    });

    if (message) message.textContent = 'Escolha uma das disciplinas vinculadas à sua conta.';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    optionsContainer.querySelector('button')?.focus();
}

function renderTeacherProfile(teacher) {
    const profile = document.getElementById('teacher-profile');
    if (!profile) return;

    const avatar = getTeacherAvatar(teacher.avatar_key);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'teacher-avatar-trigger';
    trigger.title = 'Clique para alterar sua foto de perfil';
    trigger.setAttribute('aria-label', 'Alterar foto de perfil');
    trigger.appendChild(createTeacherAvatarVisual(avatar, 'teacher-avatar'));

    const camera = document.createElement('span');
    camera.className = 'teacher-avatar-edit';
    camera.innerHTML = '<i class="fa-solid fa-camera" aria-hidden="true"></i>';
    trigger.appendChild(camera);
    trigger.addEventListener('click', () => openTeacherAvatarModal(teacher));

    const copy = document.createElement('span');
    copy.className = 'teacher-profile-copy';
    const name = document.createElement('strong');
    name.textContent = teacher.display_name || 'Professor';
    const subjects = document.createElement('small');
    subjects.textContent = (teacher.subjects || []).join(', ');
    copy.append(name, subjects);

    profile.replaceChildren(trigger, copy);
    setupTeacherAvatarModal();
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
        if (menuToggle) {
            menuToggle.setAttribute('aria-expanded', String(open));
            menuToggle.setAttribute('aria-label', open ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
            menuToggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
        }
        document.body.classList.toggle('mobile-nav-active', open);
    };
    const isMobileLayout = () => window.matchMedia('(max-width: 920px)').matches;
    const setSidebarCollapsed = collapsed => {
        document.getElementById('adm-panel')?.classList.toggle('sidebar-collapsed', collapsed);
        if (menuToggle) {
            menuToggle.setAttribute('aria-expanded', String(!collapsed));
            menuToggle.setAttribute('aria-label', isMobileLayout()
                ? 'Abrir menu de navegação'
                : (collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'));
            menuToggle.innerHTML = '<i class="fa-solid ' +
                (isMobileLayout() ? 'fa-bars' : (collapsed ? 'fa-bars' : 'fa-angles-left')) +
                '" aria-hidden="true"></i>';
        }
    };
    if (menuToggle) menuToggle.addEventListener('click', () => {
        if (isMobileLayout()) {
            setMobileNav(!menu.classList.contains('mobile-open'));
        } else {
            setSidebarCollapsed(!document.getElementById('adm-panel')?.classList.contains('sidebar-collapsed'));
        }
    });
    if (menuToggle) {
        menuToggle.innerHTML = '<i class="fa-solid ' + (isMobileLayout() ? 'fa-bars' : 'fa-angles-left') + '" aria-hidden="true"></i>';
        menuToggle.setAttribute('aria-label', isMobileLayout() ? 'Abrir menu de navegação' : 'Recolher menu lateral');
    }
    window.addEventListener('resize', () => {
        const mobile = isMobileLayout();
        if (menuToggle) {
            const collapsed = document.getElementById('adm-panel')?.classList.contains('sidebar-collapsed');
            menuToggle.innerHTML = '<i class="fa-solid ' +
                (mobile ? 'fa-bars' : (collapsed ? 'fa-bars' : 'fa-angles-left')) +
                '" aria-hidden="true"></i>';
            menuToggle.setAttribute('aria-label', mobile
                ? 'Abrir menu de navegação'
                : (collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'));
        }
        if (!mobile) setMobileNav(false);
    });
    if (menuClose) menuClose.addEventListener('click', () => setMobileNav(false));
    if (backdrop) backdrop.addEventListener('click', () => setMobileNav(false));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') setMobileNav(false); });
}

async function setupDashboard() {
    // A busca global é inicializada exclusivamente pelo módulo do dashboard EduPlan.
    // Este trecho mantém somente a carga legada já existente do resumo do dia.
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
            .select('date, time, grade, activities, special, tag')
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
                const turma = item.grade ? 'Turma ' + item.grade : 'Sem turma';
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
// Lembretes são consultados ao abrir o painel e após alterações manuais, sem polling periódico.
let reminderAudioContext = null;
let pendingReminderSound = false;
let notificationCheckInProgress = false;
let reminderBubbleTimeout = null;
let reminderNextCheckTimeout = null;

function getCurrentReminderOwnerId() {
    const ownerId = window.currentTeacher?.id;
    if (!ownerId) throw new Error('Sessão de professor não encontrada.');
    return ownerId;
}

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
                const ownerId = getCurrentReminderOwnerId();
                if (id) {
                    const { error } = await supabase
                        .from('reminders')
                        .update({ remindMeTo, date, time })
                        .eq('id', id)
                        .eq('owner', ownerId);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('reminders').insert([{
                        remindMeTo,
                        date,
                        time,
                        owner: ownerId
                    }]);
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
    return checkRemindersStatus();
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
        const ownerId = getCurrentReminderOwnerId();
        const [
            { data: reminders, error },
            { data: systemReminders, error: systemError }
        ] = await Promise.all([
            supabase.from('reminders')
                .select('*')
                .eq('owner', ownerId)
                .is('task_id', null)
                .is('system_notice_key', null)
                .order('date', { ascending: true }),
            supabase.from('reminders')
                .select('id, remindMeTo, date, time, system_notice_key')
                .eq('owner', ownerId)
                .not('system_notice_key', 'is', null)
                .order('date', { ascending: true })
        ]);
        if (error) throw error;
        if (systemError) throw systemError;

        const personalRows = reminders || [];
        const systemRows = (systemReminders || []).filter(item => {
            const noticeKey = String(item.system_notice_key || '').toLowerCase();
            const isAnnualCleanupNotice = /annual|cleanup|yearly[_-]?reset|annual[_-]?reset/.test(noticeKey);
            if (!isAnnualCleanupNotice) return true;

            // Avisos da limpeza anual ficam fora da lista até a data/hora programada.
            const expiresAt = parseReminderTimestamp(item.date, item.time);
            return Number.isFinite(expiresAt) && expiresAt <= Date.now();
        });
        if (!personalRows.length && !systemRows.length) {
            container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Nenhum lembrete agendado.</div>';
            return;
        }

        const escapeReminderHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));

        let html = '';
        systemRows.forEach(item => {
            const textParts = String(item.remindMeTo || 'Aviso anual do sistema').split('\n');
            const title = textParts.shift() || 'Aviso anual do sistema';
            const message = textParts.join('\n');
            html += '<article id="reminder-card-' + item.id + '" class="admin-reminder-card admin-system-notice-card">' +
                '<div class="admin-reminder-content">' +
                    '<strong style="color: #fff; display: block; margin-bottom: 4px; font-size: 1rem;">' + escapeReminderHtml(title) + '</strong>' +
                    '<p style="color: #dbeafe; margin: 5px 0; white-space: pre-line;">' + escapeReminderHtml(message) + '</p>' +
                    '<small style="color: var(--primary, #38bdf8);"><i class="fa-regular fa-clock"></i> ' + escapeReminderHtml(item.date) + ' às ' + escapeReminderHtml(item.time) + '</small>' +
                '</div>' +
                '<span class="system-notice-label">Aviso automático</span>' +
            '</article>';
        });

        personalRows.forEach(item => {
            html += '<article id="reminder-card-' + item.id + '" class="admin-reminder-card">' +
                '<div class="admin-reminder-content">' +
                    '<strong style="color: #fff; display: block; margin-bottom: 4px; font-size: 1rem;">' + escapeReminderHtml(item.remindMeTo) + '</strong>' +
                    '<small style="color: var(--primary, #38bdf8);"><i class="fa-regular fa-clock"></i> ' + escapeReminderHtml(item.date) + ' às ' + escapeReminderHtml(item.time) + '</small>' +
                '</div>' +
                '<div class="admin-reminder-actions">' +
                    '<button class="btn-small btn-secondary" onclick="window.editReminder(\'' + item.id + '\', \'' + encodeURIComponent(item.remindMeTo) + '\', \'' + item.date + '\', \'' + item.time + '\')">Adiar / Editar</button>' +
                    '<button class="btn-small btn-danger" onclick="window.deleteReminder(\'' + item.id + '\')">Excluir</button>' +
                '</div>' +
            '</article>';
        });

        container.innerHTML = html;
        document.dispatchEvent(new CustomEvent('reminders-section:loaded'));
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
        const ownerId = getCurrentReminderOwnerId();
        const { error } = await supabase
            .from('reminders')
            .delete()
            .eq('id', id)
            .eq('owner', ownerId);
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

function scheduleNextReminderCheck(timestamp) {
    if (reminderNextCheckTimeout) {
        clearTimeout(reminderNextCheckTimeout);
        reminderNextCheckTimeout = null;
    }
    if (!Number.isFinite(timestamp)) return;

    const delay = Math.max(0, timestamp - Date.now());
    const maxTimeout = 2147483647;

    reminderNextCheckTimeout = setTimeout(() => {
        reminderNextCheckTimeout = null;
        if (timestamp - Date.now() > maxTimeout) {
            // Reagenda só o timer do navegador; consulta o banco apenas no horário previsto.
            scheduleNextReminderCheck(timestamp);
            return;
        }
        checkRemindersStatus();
    }, Math.min(delay, maxTimeout));
}

function getUpcomingAnnualResetRefresh(now = Date.now()) {
    const current = new Date(now);
    let resetAt = new Date(current.getFullYear(), 0, 1, 3, 6, 0, 0).getTime();
    if (resetAt <= now) {
        resetAt = new Date(current.getFullYear() + 1, 0, 1, 3, 6, 0, 0).getTime();
    }
    const remaining = resetAt - now;
    return remaining > 0 && remaining <= 8 * 24 * 60 * 60 * 1000 ? resetAt : NaN;
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

    const isTaskNotification = notification.type === 'task';
    const isSystemNotification = notification.type === 'system';
    const heading = document.createElement('span');
    heading.className = 'reminder-chat-label';
    heading.textContent = isSystemNotification
        ? 'Aviso do sistema'
        : (isTaskNotification
            ? (notification.notificationType === 'day_before' ? 'Prazo amanhã' : 'Prazo hoje')
            : 'Lembrete expirado');

    const rawTitle = String(notification.title || (isTaskNotification ? 'Trabalho com prazo próximo' : 'Lembrete sem título'));
    const titleParts = rawTitle.split('\n');
    const title = document.createElement('strong');
    title.className = 'reminder-chat-title';
    title.textContent = titleParts.shift() || rawTitle;

    const details = titleParts.join('\n').trim();
    const description = document.createElement('p');
    description.className = 'reminder-chat-meta';
    description.textContent = details;

    const meta = document.createElement('small');
    meta.className = 'reminder-chat-meta';
    meta.textContent = (isTaskNotification || isSystemNotification ? 'Aviso programado para ' : 'Vencido em ') +
        new Date(notification.timestamp).toLocaleString('pt-BR', {
            dateStyle: 'short', timeStyle: 'short'
        });

    const actions = document.createElement('div');
    actions.className = 'reminder-chat-actions';

    const primaryButton = document.createElement('button');
    primaryButton.type = 'button';
    primaryButton.className = 'reminder-chat-snooze';
    primaryButton.textContent = isSystemNotification ? 'Entendi' : (isTaskNotification ? 'Abrir trabalho' : 'Adiar');
    primaryButton.addEventListener('click', () => {
        bubble.classList.add('hidden');
        if (isTaskNotification) {
            if (typeof window.editTask === 'function') {
                window.editTask(String(notification.taskId));
            }
        } else if (!isSystemNotification) {
            openReminderFormModal({
                id: notification.id,
                remindMeTo: notification.title,
                date: notification.date,
                time: notification.time
            });
        }
    });

    actions.append(primaryButton);

    if (!isSystemNotification) {
        const dismissButton = document.createElement('button');
        dismissButton.type = 'button';
        dismissButton.className = 'reminder-chat-delete';
        dismissButton.textContent = isTaskNotification ? 'Dispensar' : 'Excluir';
        dismissButton.addEventListener('click', async () => {
            await window.deleteReminder(isTaskNotification ? notification.reminderId : notification.id);
        });
        actions.append(dismissButton);
    }

    bubble.append(heading, title);
    if (details) bubble.append(description);
    bubble.append(meta, actions);

    // O balão fica visível por apenas 2 segundos.
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

        const { data: reminders, error } = await supabase
            .from('reminders')
            .select('id, remindMeTo, date, time, task_id, notification_type, notified_at, system_notice_key')
            .eq('owner', authData.user.id);
        if (error) throw error;

        const rows = reminders || [];
        const scheduledTaskRows = rows.filter(item => item.task_id !== null && item.task_id !== undefined);
        const pendingTaskRows = scheduledTaskRows
            .filter(item => !item.notified_at)
            .map(item => ({ item, timestamp: parseReminderTimestamp(item.date, item.time) }))
            .filter(entry => Number.isFinite(entry.timestamp))
            .sort((a, b) => a.timestamp - b.timestamp);

        const dueTaskRows = pendingTaskRows.filter(entry => entry.timestamp <= now);
        const futureTaskRows = pendingTaskRows.filter(entry => entry.timestamp > now);

        const pendingSystemRows = rows
            .filter(item => item.system_notice_key && !item.notified_at)
            .map(item => ({ item, timestamp: parseReminderTimestamp(item.date, item.time) }))
            .filter(entry => Number.isFinite(entry.timestamp))
            .sort((a, b) => a.timestamp - b.timestamp);

        const dueSystemRows = pendingSystemRows.filter(entry => entry.timestamp <= now);
        const futureSystemRows = pendingSystemRows.filter(entry => entry.timestamp > now);

        const manualExpired = rows
            .filter(item =>
                (item.task_id === null || item.task_id === undefined) &&
                !item.system_notice_key
            )
            .map(item => ({ item, timestamp: parseReminderTimestamp(item.date, item.time) }))
            .filter(entry => Number.isFinite(entry.timestamp) && entry.timestamp <= now)
            .sort((a, b) => a.timestamp - b.timestamp);

        let notification = null;
        if (dueTaskRows.length) {
            const entry = dueTaskRows[0];
            notification = {
                type: 'task',
                taskId: entry.item.task_id,
                reminderId: entry.item.id,
                notificationType: entry.item.notification_type,
                title: entry.item.remindMeTo || 'Trabalho com prazo próximo',
                date: entry.item.date,
                time: entry.item.time,
                timestamp: entry.timestamp
            };

            const { error: markError } = await supabase
                .from('reminders')
                .update({ notified_at: new Date().toISOString() })
                .eq('id', entry.item.id)
                .eq('owner', authData.user.id)
                .is('notified_at', null);
            if (markError) throw markError;
        } else if (dueSystemRows.length) {
            const entry = dueSystemRows[0];
            notification = {
                type: 'system',
                id: entry.item.id,
                title: entry.item.remindMeTo || 'Aviso anual do sistema',
                date: entry.item.date,
                time: entry.item.time,
                timestamp: entry.timestamp
            };

            // Marca como apresentado para não repetir o mesmo aviso a cada abertura do painel.
            const { error: markError } = await supabase
                .from('reminders')
                .update({ notified_at: new Date().toISOString() })
                .eq('id', entry.item.id)
                .eq('owner', authData.user.id)
                .is('notified_at', null);
            if (markError) throw markError;
        } else if (manualExpired.length) {
            const entry = manualExpired[0];
            notification = {
                type: 'reminder',
                id: entry.item.id,
                title: entry.item.remindMeTo || 'Lembrete sem título',
                date: entry.item.date,
                time: entry.item.time,
                timestamp: entry.timestamp
            };
        }

        const dueAutomaticCount = dueTaskRows.length + dueSystemRows.length;
        if (dueAutomaticCount > 1 || (dueAutomaticCount > 0 && manualExpired.length > 0)) {
            scheduleNextReminderCheck(now + 2100);
        } else {
            const nextFutureAutomatic = [...futureTaskRows, ...futureSystemRows]
                .sort((a, b) => a.timestamp - b.timestamp)[0];
            const scheduledTimes = [
                nextFutureAutomatic?.timestamp,
                getUpcomingAnnualResetRefresh(now)
            ].filter(Number.isFinite);
            const nextTimestamp = scheduledTimes.length ? Math.min(...scheduledTimes) : NaN;
            scheduleNextReminderCheck(nextTimestamp);
        }

        const badge = document.getElementById('reminders-badge');
        if (badge) badge.classList.toggle('hidden', !notification);
        renderExpiredNotification(notification);

        if (notification && options.playSound) await playReminderNotificationSound();
    } catch (err) {
        console.error('Erro ao verificar notificações expiradas:', err);
    } finally {
        notificationCheckInProgress = false;
    }
}

window.refreshAdminNotifications = () => checkRemindersStatus();

