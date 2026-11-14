import { supabase } from '../supabaseClient.js';

const WEEKDAYS = [
    { id: 'seg', label: 'Segunda-feira' },
    { id: 'ter', label: 'Terça-feira' },
    { id: 'qua', label: 'Quarta-feira' },
    { id: 'qui', label: 'Quinta-feira' },
    { id: 'sex', label: 'Sexta-feira' }
];

const SHIFTS = {
    mat: {
        label: 'Manhã',
        icon: 'fa-sun',
        slots: [
            { index: 0, label: '1º', time: '07:00 – 07:50' },
            { index: 1, label: '2º', time: '07:50 – 08:30' },
            { index: 2, label: '3º', time: '08:30 – 09:10' },
            { index: 3, label: '4º', time: '09:10 – 09:50' },
            { index: 5, label: '5º', time: '10:10 – 10:50' },
            { index: 6, label: '6º', time: '10:50 – 11:30' }
        ],
        breakTime: '09:50 – 10:10'
    },
    ves: {
        label: 'Tarde',
        icon: 'fa-cloud-sun',
        slots: [
            { index: 0, label: '1º', time: '13:00 – 13:50' },
            { index: 1, label: '2º', time: '13:50 – 14:30' },
            { index: 2, label: '3º', time: '14:30 – 15:10' },
            { index: 3, label: '4º', time: '15:10 – 15:50' },
            { index: 5, label: '5º', time: '16:10 – 16:50' },
            { index: 6, label: '6º', time: '16:50 – 17:30' }
        ],
        breakTime: '15:50 – 16:10'
    }
};

let scheduleRecord = null;
let dashboardInitialized = false;
let scheduleAutoAdvanceTimer = null;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function localDateKey(date) {
    const pad = value => String(value).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function parsePlannerDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    let year, month, day;
    if (match) {
        [, year, month, day] = match;
    } else {
        match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (!match) return null;
        [, day, month, year] = match;
    }
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getFullYear() !== Number(year) ||
        parsed.getMonth() !== Number(month) - 1 ||
        parsed.getDate() !== Number(day)
    ) return null;
    return parsed;
}

function getWeekDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return WEEKDAYS.map((day, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return { ...day, date };
    });
}

function readScheduleValues(value) {
    if (!value) return ['', '', '', '', '', '', ''];
    const matches = String(value).match(/\[([^\]]*)\]/g);
    const values = matches
        ? matches.map(item => item.slice(1, -1).trim())
        : String(value).split(',').map(item => item.replace(/[\[\]]/g, '').trim());
    return Array.from({ length: 7 }, (_, index) => values[index] || '');
}

function shiftHasLessons(data, dayId, shiftId) {
    const values = readScheduleValues(data[dayId + '_' + shiftId]);
    return [0, 1, 2, 3, 5, 6].some(index => Boolean(String(values[index] || '').trim()));
}

function displayLesson(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return { label: 'Sem aula cadastrada', vacant: false, empty: true };
    if (/vago|livre/i.test(value)) return { label: 'Vago', vacant: true, empty: false };
    if (/intervalo/i.test(value)) return { label: 'Intervalo', vacant: false, empty: false };

    // Mantém a informação original e só reorganiza o padrão "Disciplina - 8A".
    const classFirst = value.match(/^(\d\s*[ABC])\s*[-–—]\s*(.+)$/i);
    if (classFirst) {
        return { label: classFirst[1].replace(/\s+/g, '').toUpperCase() + ' - ' + classFirst[2].trim(), vacant: false, empty: false };
    }
    const classLast = value.match(/^(.+?)\s*[-–—]\s*(\d\s*[ABC])$/i);
    if (classLast) {
        return { label: classLast[2].replace(/\s+/g, '').toUpperCase() + ' - ' + classLast[1].trim(), vacant: false, empty: false };
    }
    return { label: value, vacant: false, empty: false };
}

function renderSlot(rawValue, slot, dayId, shiftId) {
    const lesson = displayLesson(rawValue);
    const classes = ['schedule-entry'];
    if (lesson.vacant) classes.push('schedule-entry-vacant');
    if (lesson.empty) classes.push('schedule-entry-empty');
    return '<div id="schedule-slot-' + dayId + '-' + shiftId + '-' + slot.index + '" class="' + classes.join(' ') + '">' +
        '<span class="schedule-entry-index">' + slot.label + '</span>' +
        '<span class="schedule-entry-content"><strong>' + escapeHtml(lesson.label) + '</strong></span>' +
        '<strong class="schedule-entry-time">' + slot.time + '</strong>' +
    '</div>';
}

function renderBreak(time, dayId, shiftId) {
    return '<div id="schedule-slot-' + dayId + '-' + shiftId + '-4" class="schedule-entry schedule-entry-break">' +
        '<span class="schedule-entry-index"><i class="fa-solid fa-mug-hot" aria-hidden="true"></i></span>' +
        '<span class="schedule-entry-label">Intervalo</span>' +
        '<strong class="schedule-entry-time">' + time + '</strong>' +
    '</div>';
}

function renderShift(dayData, config, dayId, shiftId) {
    if (!shiftHasLessons(dayData, dayId, shiftId)) return '';
    const values = readScheduleValues(dayData[dayId + '_' + shiftId]);
    return '<section class="schedule-shift schedule-shift-' + (shiftId === 'mat' ? 'morning' : 'afternoon') + '">' +
        '<header class="schedule-shift-header">' +
            '<span class="schedule-shift-icon"><i class="fa-solid ' + config.icon + '" aria-hidden="true"></i></span>' +
            '<h4>' + config.label + '</h4>' +
        '</header>' +
        '<div class="schedule-period-list">' +
            config.slots.slice(0, 4).map(slot => renderSlot(values[slot.index], slot, dayId, shiftId)).join('') +
            renderBreak(config.breakTime, dayId, shiftId) +
            config.slots.slice(4).map(slot => renderSlot(values[slot.index], slot, dayId, shiftId)).join('') +
        '</div>' +
    '</section>';
}

function hasActualScheduledLesson(value) {
    const lesson = displayLesson(value);
    return Boolean(String(value || '').trim()) &&
        !lesson.empty &&
        !lesson.vacant &&
        !/intervalo/i.test(lesson.label);
}

function dayHasActualLessons(data, dayId) {
    return ['mat', 'ves'].some(shiftId => {
        const values = readScheduleValues(data[dayId + '_' + shiftId]);
        return [0, 1, 2, 3, 5, 6].some(index => hasActualScheduledLesson(values[index]));
    });
}

function getLastLessonEndMinutes(data, dayId) {
    let lastEnd = null;
    ['mat', 'ves'].forEach(shiftId => {
        const values = readScheduleValues(data[dayId + '_' + shiftId]);
        SHIFTS[shiftId].slots.forEach(slot => {
            if (!hasActualScheduledLesson(values[slot.index])) return;
            const endText = slot.time.split('–').pop().trim();
            const [hours, minutes] = endText.split(':').map(Number);
            const endMinutes = hours * 60 + minutes;
            if (Number.isFinite(endMinutes) && (lastEnd === null || endMinutes > lastEnd)) {
                lastEnd = endMinutes;
            }
        });
    });
    return lastEnd;
}

function getDefaultExpandedDayId(data, visibleDays, now) {
    if (!visibleDays.length) return null;

    const weekdayIndex = (now.getDay() + 6) % 7;
    const currentDay = WEEKDAYS[weekdayIndex];
    if (currentDay && weekdayIndex < WEEKDAYS.length) {
        const currentIsVisible = visibleDays.some(day => day.id === currentDay.id);
        const lastEnd = currentIsVisible ? getLastLessonEndMinutes(data, currentDay.id) : null;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (currentIsVisible && (lastEnd === null || nowMinutes < lastEnd)) {
            return currentDay.id;
        }
    }

    const nextLessonDay = visibleDays.find(day =>
        WEEKDAYS.findIndex(weekday => weekday.id === day.id) > weekdayIndex
    );
    return nextLessonDay?.id || visibleDays[0].id;
}

function scheduleAutomaticDayAdvance(data, visibleDays, preferredDayId, now) {
    if (scheduleAutoAdvanceTimer) {
        window.clearTimeout(scheduleAutoAdvanceTimer);
        scheduleAutoAdvanceTimer = null;
    }

    const currentWeekdayIndex = (now.getDay() + 6) % 7;
    const currentDay = WEEKDAYS[currentWeekdayIndex];
    if (!currentDay || preferredDayId !== currentDay.id) return;

    const lastEnd = getLastLessonEndMinutes(data, currentDay.id);
    if (lastEnd === null) return;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes >= lastEnd) return;

    const nextAdvance = new Date(now);
    nextAdvance.setHours(Math.floor(lastEnd / 60), lastEnd % 60, 1, 0);
    const delay = Math.max(250, nextAdvance.getTime() - now.getTime());
    scheduleAutoAdvanceTimer = window.setTimeout(() => {
        renderSchedule(scheduleRecord || {});
    }, delay);
}

function renderSchedule(data) {
    const container = document.getElementById('schedule-container');
    if (!container) return;

    const weekDates = getWeekDates();
    const now = new Date();
    const visibleDays = weekDates.filter(day => dayHasActualLessons(data, day.id));
    const preferredOpenDayId = getDefaultExpandedDayId(data, visibleDays, now);

    const dayCards = visibleDays.map(day => {
        const isOpen = day.id === preferredOpenDayId;
        return '<article class="schedule-day-card ' + (isOpen ? 'is-open' : '') + '" data-day-card="' + day.id + '">' +
            '<button type="button" class="schedule-day-header" data-day-toggle="' + day.id + '" aria-expanded="' + String(isOpen) + '" aria-label="' + (isOpen ? 'Recolher ' : 'Expandir ') + day.label + '" title="' + (isOpen ? 'Recolher' : 'Expandir') + '">' +
                '<span class="schedule-day-mark"><i class="fa-regular fa-calendar" aria-hidden="true"></i></span>' +
                '<span class="schedule-day-title">' + day.label + '</span>' +
                '<i class="fa-solid ' + (isOpen ? 'fa-chevron-up' : 'fa-chevron-down') + ' schedule-day-chevron" aria-hidden="true"></i>' +
            '</button>' +
            '<div class="schedule-day-content" ' + (isOpen ? '' : 'hidden') + '>' +
                '<div class="schedule-shifts-grid">' +
                    renderShift(data, SHIFTS.mat, day.id, 'mat') +
                    renderShift(data, SHIFTS.ves, day.id, 'ves') +
                '</div>' +
            '</div>' +
        '</article>';
    });

    container.innerHTML = visibleDays.length
        ? '<div class="schedule-week-grid">' + dayCards.join('') + '</div>'
        : '<div class="empty-state">Nenhum horário de aula cadastrado.</div>';

    container.querySelectorAll('[data-day-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            const card = button.closest('[data-day-card]');
            const content = card.querySelector('.schedule-day-content');
            const open = card.classList.toggle('is-open');
            content.hidden = !open;
            button.setAttribute('aria-expanded', String(open));
            button.setAttribute('aria-label', (open ? 'Recolher ' : 'Expandir ') + card.dataset.dayCard);
            button.title = open ? 'Recolher' : 'Expandir';
            const chevron = button.querySelector('.schedule-day-chevron');
            chevron.classList.toggle('fa-chevron-up', open);
            chevron.classList.toggle('fa-chevron-down', !open);
        });
    });

    scheduleAutomaticDayAdvance(data, visibleDays, preferredOpenDayId, now);
}

function renderSummary(plans) {
    const container = document.getElementById('today-plans-container');
    if (!container) return;

    const today = new Date();
    const todayKey = localDateKey(today);
    const week = getWeekDates();
    const weekStart = week[0].date;
    const weekEnd = new Date(week[4].date);
    weekEnd.setDate(weekEnd.getDate() + 1);

    const dated = plans.map(plan => ({ ...plan, parsedDate: parsePlannerDate(plan.date) })).filter(plan => plan.parsedDate);
    const todayPlans = dated.filter(plan => localDateKey(plan.parsedDate) === todayKey);
    const weekPlans = dated.filter(plan => plan.parsedDate >= weekStart && plan.parsedDate < weekEnd);

    const activeClasses = new Set(weekPlans.map(plan => {
        const grade = [plan.serie, plan.team].filter(Boolean).join('');
        return grade || null;
    }).filter(Boolean));

    const now = new Date();
    const upcoming = dated.map(plan => {
        const lessonDate = new Date(plan.parsedDate);
        const [hours, minutes] = String(plan.time || '00:00').split(':').map(Number);
        lessonDate.setHours(hours || 0, minutes || 0, 0, 0);
        return { ...plan, lessonDate };
    }).filter(plan => plan.lessonDate >= now)
      .sort((a, b) => a.lessonDate - b.lessonDate)[0];

    const upcomingTime = upcoming
        ? upcoming.lessonDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '—';
    const upcomingClass = upcoming
        ? [upcoming.serie, upcoming.team].filter(Boolean).join('') || 'Aula planejada'
        : 'Nenhuma aula futura';

    const cards = [
        { icon: 'fa-calendar-check', tone: 'purple', label: 'Aulas hoje', value: todayPlans.length, foot: 'Ver seu cronograma' },
        { icon: 'fa-users', tone: 'green', label: 'Turmas ativas', value: activeClasses.size, foot: 'Turmas nesta semana' },
        { icon: 'fa-check', tone: 'orange', label: 'Planejamentos da semana', value: weekPlans.length, foot: 'Aulas planejadas' },
        { icon: 'fa-clock', tone: 'blue', label: 'Próxima aula', value: upcomingTime, foot: upcomingClass }
    ];

    container.innerHTML = '<div class="dashboard-summary-grid">' + cards.map(card =>
        '<article class="dashboard-summary-card">' +
            '<span class="dashboard-summary-icon tone-' + card.tone + '"><i class="fa-solid ' + card.icon + '" aria-hidden="true"></i></span>' +
            '<div class="dashboard-summary-copy"><span>' + card.label + '</span><strong>' + escapeHtml(card.value) + '</strong><small>' + escapeHtml(card.foot) + '</small></div>' +
        '</article>'
    ).join('') + '</div>';
}

function renderScheduleEditor(data) {
    const container = document.getElementById('schedule-editor-fields');
    if (!container) return;

    const shifts = ['mat', 'ves'];
    container.innerHTML = WEEKDAYS.map(day =>
        '<section class="schedule-editor-day">' +
            '<h4><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + day.label + '</h4>' +
            '<div class="schedule-editor-shifts">' +
                shifts.map(shiftId => {
                    const config = SHIFTS[shiftId];
                    const values = readScheduleValues(data[day.id + '_' + shiftId]);
                    return '<div class="schedule-editor-shift">' +
                        '<h5><i class="fa-solid ' + config.icon + '" aria-hidden="true"></i> ' + config.label + '</h5>' +
                        config.slots.map(slot =>
                            '<label><span>' + slot.label + ' horário <small>' + slot.time + '</small></span>' +
                            '<input type="text" data-schedule-field data-day="' + day.id + '" data-shift="' + shiftId + '" data-index="' + slot.index + '" value="' + escapeHtml(values[slot.index]) + '" placeholder="Ex.: 8A - Inglês"></label>'
                        ).join('') +
                    '</div>';
                }).join('') +
            '</div>' +
        '</section>'
    ).join('');
}

async function loadDashboard() {
    const summary = document.getElementById('today-plans-container');
    const schedule = document.getElementById('schedule-container');
    if (summary) summary.innerHTML = '<div class="dashboard-summary-loading"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Carregando resumo...</div>';
    if (schedule) schedule.innerHTML = '<div class="schedule-loading"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Carregando cronograma...</div>';

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
        if (summary) summary.innerHTML = '<p class="dashboard-load-error">Entre novamente para visualizar seu cronograma.</p>';
        if (schedule) schedule.innerHTML = '<div class="empty-state schedule-error">Sua sessão expirou. Entre novamente.</div>';
        return;
    }

    const [plannerResult, scheduleResult] = await Promise.all([
        supabase.from('planner').select('date,time,serie,team,completed_at').eq('owner', authData.user.id).is('completed_at', null),
        supabase.from('schedule').select('*').eq('owner', authData.user.id).maybeSingle()
    ]);

    if (plannerResult.error) {
        console.error('Erro ao carregar planejamentos do dashboard:', plannerResult.error);
        if (summary) summary.innerHTML = '<p class="dashboard-load-error">Não foi possível carregar o resumo das aulas.</p>';
    } else {
        renderSummary(plannerResult.data || []);
    }

    if (scheduleResult.error) {
        console.error('Erro ao carregar horários:', scheduleResult.error);
        if (schedule) schedule.innerHTML = '<div class="empty-state schedule-error">Não foi possível carregar os horários semanais.</div>';
        return;
    }

    scheduleRecord = scheduleResult.data || null;
    renderSchedule(scheduleRecord || {});
}

function setupGlobalSearch() {
    const input = document.getElementById('global-search');
    const resultsContainer = document.getElementById('search-results');
    const loader = document.getElementById('global-search-loader');
    if (!input || !resultsContainer || input.dataset.initialized === 'true') return;
    input.dataset.initialized = 'true';

    let searchSequence = 0;
    let searchDebounce = null;

    const appendResultGroup = (label, items, idField, section, formatLabel) => {
        if (!items.length) return '';
        return '<div class="search-result-group">' +
            '<div class="search-group-label">' + label + '</div>' +
            items.map(item =>
                '<button type="button" class="search-item search-result-item" role="option" data-search-result ' +
                    'data-search-section="' + escapeHtml(typeof section === 'function' ? section(item) : section) + '" data-search-id="' + escapeHtml(item[idField]) + '">' +
                    formatLabel(item) +
                '</button>'
            ).join('') +
        '</div>';
    };

    const revealTargetAncestors = target => {
        let ancestor = target.parentElement;
        while (ancestor && ancestor !== document.body) {
            if (ancestor.classList.contains('planner-section-content') && ancestor.classList.contains('hidden')) {
                ancestor.classList.remove('hidden');
                const toggle = ancestor.closest('.planner-section')?.querySelector('[data-toggle-planner-section]');
                if (toggle) {
                    toggle.setAttribute('aria-label', 'Recolher dia');
                    toggle.setAttribute('aria-expanded', 'true');
                    toggle.title = 'Recolher dia';
                    toggle.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
                }
            }

            if (ancestor.classList.contains('completed-class-panel') && ancestor.classList.contains('hidden')) {
                const panelIndex = ancestor.dataset.completedPanel;
                const tabsContainer = ancestor.closest('#completed-planner-container');
                const tab = tabsContainer?.querySelector('[data-completed-tab="' + panelIndex + '"]');
                if (tab) tab.click();
                else ancestor.classList.remove('hidden');
            }

            if (ancestor.classList.contains('team-content') && ancestor.classList.contains('hidden')) {
                ancestor.classList.remove('hidden');
                const toggle = ancestor.previousElementSibling?.querySelector('.minimize-btn');
                if (toggle) {
                    toggle.setAttribute('aria-label', 'Recolher turma');
                    toggle.setAttribute('aria-expanded', 'true');
                    toggle.title = 'Recolher turma';
                    toggle.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
                }
            }

            if (ancestor.classList.contains('flashcard-stack-content') && ancestor.hidden) {
                ancestor.hidden = false;
                const toggle = ancestor.previousElementSibling;
                if (toggle?.matches('[data-flashcard-stack-toggle]')) {
                    toggle.setAttribute('aria-expanded', 'true');
                    const chevron = toggle.querySelector('.flashcard-stack-chevron');
                    chevron?.classList.add('fa-chevron-up');
                    chevron?.classList.remove('fa-chevron-down');
                }
            }

            if (ancestor.classList.contains('schedule-day-content') && ancestor.hidden) {
                ancestor.hidden = false;
                const toggle = ancestor.previousElementSibling;
                const card = ancestor.closest('[data-day-card]');
                card?.classList.add('is-open');
                if (toggle?.matches('[data-day-toggle]')) {
                    toggle.setAttribute('aria-expanded', 'true');
                    toggle.setAttribute('aria-label', 'Recolher ' + (card?.dataset.dayCard || 'dia'));
                    toggle.title = 'Recolher';
                    const chevron = toggle.querySelector('.schedule-day-chevron');
                    chevron?.classList.add('fa-chevron-up');
                    chevron?.classList.remove('fa-chevron-down');
                }
            }

            ancestor = ancestor.parentElement;
        }
    };

    const highlightTarget = targetId => {
        const target = document.getElementById(targetId);
        if (!target) return false;
        revealTargetAncestors(target);
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('search-result-highlight');
        window.setTimeout(() => target.classList.remove('search-result-highlight'), 3000);
        return true;
    };

    const navigateToResult = button => {
        const sectionId = button.dataset.searchSection;
        const targetId = button.dataset.searchId;
        const navButton = document.querySelector('.nav-btn[data-target="' + sectionId + '"]');
        if (navButton) navButton.click();
        resultsContainer.classList.add('hidden');
        input.value = '';

        if (sectionId === 'reminders-section') {
            const onRemindersLoaded = () => highlightTarget(targetId);
            document.addEventListener('reminders-section:loaded', onRemindersLoaded, { once: true });
            window.setTimeout(() => {
                document.removeEventListener('reminders-section:loaded', onRemindersLoaded);
                highlightTarget(targetId);
            }, 1500);
            return;
        }

        if (sectionId === 'planner-section') {
            const plannerSearch = document.getElementById('planner-search');
            if (plannerSearch) {
                plannerSearch.value = '';
                plannerSearch.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        if (sectionId === 'dashboard-section') {
            Promise.resolve(window.refreshEduPlanDashboard?.()).finally(() => {
                window.setTimeout(() => highlightTarget(targetId), 90);
            });
            return;
        }

        window.setTimeout(() => highlightTarget(targetId), 140);
    };

    resultsContainer.addEventListener('click', event => {
        const button = event.target.closest('[data-search-result]');
        if (button) navigateToResult(button);
    });

    input.addEventListener('input', event => {
        const query = event.target.value.trim();
        const sequence = ++searchSequence;
        if (query.length < 2) {
            window.clearTimeout(searchDebounce);
            loader?.classList.add('hidden');
            resultsContainer.classList.add('hidden');
            resultsContainer.innerHTML = '';
            return;
        }

        window.clearTimeout(searchDebounce);
        loader?.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        resultsContainer.innerHTML = '';
        searchDebounce = window.setTimeout(() => {
            if (sequence !== searchSequence) return;
            loader?.classList.remove('hidden');
            performGlobalSearch(query, sequence);
        }, 450);
    });

    async function performGlobalSearch(query, sequence) {
        if (sequence !== searchSequence) return;
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData.user) throw new Error('Sessão de professor não encontrada.');
            const pattern = '%' + query + '%';
            const [
                usersName, usersLogin, usersGrade,
                plannerRowsResult, taskRowsResult, scheduleResult, missionsName,
                flashWords, flashTranslations, flashStacks,
                remindersText
            ] = await Promise.all([
                supabase.from('users').select('id,name,username,grade').neq('username', 'micael.svg').ilike('name', pattern).limit(4),
                supabase.from('users').select('id,name,username,grade').neq('username', 'micael.svg').ilike('username', pattern).limit(4),
                supabase.from('users').select('id,name,username,grade').neq('username', 'micael.svg').ilike('grade', pattern).limit(4),
                supabase.from('planner').select('id,date,day,time,serie,team,activities,skills,completed_at,tag,special').eq('owner', authData.user.id).order('id', { ascending: false }).range(0, 999),
                supabase.from('tasks').select('id,title,description,grades,serie,team,deadline').eq('owner', authData.user.id).order('id', { ascending: false }).range(0, 999),
                supabase.from('schedule').select('*').eq('owner', authData.user.id).maybeSingle(),
                supabase.from('missions').select('id,mission_name,mission_score,mission_link').ilike('mission_name', pattern).limit(4),
                supabase.from('flashcards').select('id,word,translation,stack').ilike('word', pattern).limit(4),
                supabase.from('flashcards').select('id,word,translation,stack').ilike('translation', pattern).limit(4),
                supabase.from('flashcards').select('id,word,translation,stack').ilike('stack', pattern).limit(4),
                supabase.from('reminders').select('id,remindMeTo,date,time').ilike('remindMeTo', pattern).limit(4)
            ]);

            if (sequence !== searchSequence) return;
            const queryResults = [
                usersName, usersLogin, usersGrade,
                plannerRowsResult, taskRowsResult,
                scheduleResult, missionsName, flashWords, flashTranslations, flashStacks, remindersText
            ];
            const failedQuery = queryResults.find(result => result?.error);
            if (failedQuery) throw failedQuery.error;

            const combineUnique = (results, key = 'id') => {
                const map = new Map();
                results.forEach(result => (result.data || []).forEach(item => map.set(String(item[key]), item)));
                return Array.from(map.values()).slice(0, 5);
            };
            const users = combineUnique([usersName, usersLogin, usersGrade]);
            const normalizedQuery = query.toLocaleLowerCase('pt-BR');
            const plans = (plannerRowsResult.data || []).filter(plan =>
                [plan.day, plan.date, plan.time, plan.serie, plan.team, plan.serie + plan.team, plan.activities, plan.skills, plan.tag, plan.special]
                    .some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalizedQuery))
            ).slice(0, 5).map(plan => ({
                ...plan,
                section: plan.completed_at ? 'completed-planner-section' : 'planner-section'
            }));
            const tasks = (taskRowsResult.data || []).filter(task =>
                [task.title, task.description, task.serie, task.team, (task.grades || []).join(' ')]
                    .some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalizedQuery))
            ).slice(0, 5);
            const missions = missionsName.data || [];
            const flashcards = combineUnique([flashWords, flashTranslations, flashStacks]);
            const reminders = remindersText.data || [];

            const scheduleMatches = [];
            const scheduleRow = scheduleResult.data;
            const weekdayLabels = {
                seg: 'Segunda-feira',
                ter: 'Terça-feira',
                qua: 'Quarta-feira',
                qui: 'Quinta-feira',
                sex: 'Sexta-feira'
            };
            const shiftLabels = { mat: 'Manhã', ves: 'Tarde' };
            const slotLabels = ['1º', '2º', '3º', '4º', 'Intervalo', '5º', '6º'];
            if (scheduleRow) {
                Object.keys(weekdayLabels).forEach(dayId => {
                    ['mat', 'ves'].forEach(shiftId => {
                        const raw = String(scheduleRow[dayId + '_' + shiftId] || '');
                        const values = raw.match(/\[([^\]]*)\]/g)?.map(item => item.slice(1, -1).trim()) || [];
                        values.forEach((value, index) => {
                            if (value.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))) {
                                scheduleMatches.push({
                                    id: 'schedule-slot-' + dayId + '-' + shiftId + '-' + index,
                                    label: weekdayLabels[dayId] + ' • ' + shiftLabels[shiftId] + ' • ' + (slotLabels[index] || 'Horário'),
                                    value
                                });
                            }
                        });
                    });
                });
            }

            const pieces = [];
            pieces.push(appendResultGroup('Aulas', scheduleMatches, 'id', 'dashboard-section', lesson =>
                '<strong>' + escapeHtml(lesson.label) + '</strong>' +
                '<span>' + escapeHtml(lesson.value) + '</span>'
            ));
            pieces.push(appendResultGroup('Trabalhos', tasks, 'id', 'tasks-section', task =>
                '<strong>' + escapeHtml(task.title || 'Trabalho sem título') + '</strong>' +
                '<span>' + escapeHtml((task.grades || []).join(', ') || [task.serie, task.team].filter(Boolean).join('') || 'Todas as turmas') + '</span>'
            ));
            pieces.push(appendResultGroup('Planejamentos', plans, 'id', plan => plan.section, plan =>
                '<strong>' + escapeHtml([plan.serie, plan.team].filter(Boolean).join('') || 'Aula') + '</strong>' +
                '<span>' + escapeHtml([plan.date, plan.time, String(plan.activities || '').replace(/<[^>]*>/g, ' ').slice(0, 70)].filter(Boolean).join(' • ')) + '</span>'
            ));
            pieces.push(appendResultGroup('Missões', missions, 'id', 'missions-section', mission =>
                '<strong>' + escapeHtml(mission.mission_name || 'Missão') + '</strong>' +
                '<span>' + escapeHtml('Pontuação: ' + (mission.mission_score ?? 0)) + '</span>'
            ));
            pieces.push(appendResultGroup('Alunos', users, 'id', 'users-section', user =>
                '<strong>' + escapeHtml(user.name || user.username) + '</strong>' +
                '<span>' + escapeHtml((user.username || '') + (user.grade ? ' • Turma ' + user.grade : '')) + '</span>'
            ));
            pieces.push(appendResultGroup('Flashcards', flashcards, 'id', 'flashcards-section', card =>
                '<strong>' + escapeHtml(card.word || 'Flashcard') + '</strong>' +
                '<span>' + escapeHtml([card.translation, card.stack].filter(Boolean).join(' • ')) + '</span>'
            ));
            pieces.push(appendResultGroup('Lembretes', reminders, 'id', 'reminders-section', reminder =>
                '<strong>' + escapeHtml(reminder.remindMeTo || 'Lembrete') + '</strong>' +
                '<span>' + escapeHtml([reminder.date, reminder.time].filter(Boolean).join(' • ')) + '</span>'
            ));

            const html = pieces.filter(Boolean).join('');
            if (sequence !== searchSequence) return;
            loader?.classList.add('hidden');
            resultsContainer.innerHTML = html || '<div class="search-item search-empty">Nenhum resultado encontrado.</div>';
            resultsContainer.classList.remove('hidden');
        } catch (error) {
            if (sequence !== searchSequence) return;
            loader?.classList.add('hidden');
            console.error('Erro na pesquisa global:', error);
            resultsContainer.innerHTML = '<div class="search-item search-empty">Não foi possível realizar a pesquisa.</div>';
            resultsContainer.classList.remove('hidden');
        }
    }
}

function setupScheduleEditor() {
    const modal = document.getElementById('schedule-editor-modal');
    const openButton = document.getElementById('btn-edit-schedule');
    const form = document.getElementById('schedule-editor-form');
    const cancelButton = document.getElementById('btn-cancel-schedule-editor');
    if (!modal || !openButton || !form || openButton.dataset.initialized === 'true') return;
    openButton.dataset.initialized = 'true';

    openButton.addEventListener('click', async () => {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
            alert('Sua sessão expirou. Entre novamente para editar os horários.');
            return;
        }

        // A consulta sempre procura o registro do professor autenticado.
        // Uma linha legada com owner NULL nunca é usada como registro de edição.
        const { data, error } = await supabase
            .from('schedule')
            .select('*')
            .eq('owner', authData.user.id)
            .maybeSingle();
        if (error) {
            alert('Não foi possível abrir os horários: ' + error.message);
            return;
        }
        scheduleRecord = data || null;
        renderScheduleEditor(scheduleRecord || {});
        modal.showModal();
    });

    cancelButton?.addEventListener('click', () => modal.close());

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            alert('Sua sessão expirou. Entre novamente para salvar os horários.');
            return;
        }

        const payload = {};
        WEEKDAYS.forEach(day => {
            ['mat', 'ves'].forEach(shiftId => {
                const values = ['', '', '', '', '', '', ''];
                form.querySelectorAll('[data-schedule-field][data-day="' + day.id + '"][data-shift="' + shiftId + '"]').forEach(input => {
                    values[Number(input.dataset.index)] = input.value.trim();
                });
                const hasLessons = [0, 1, 2, 3, 5, 6].some(index => values[index]);
                if (hasLessons) {
                    values[4] = 'Intervalo';
                    payload[day.id + '_' + shiftId] = values.map(value => '[' + value.replace(/[\[\]]/g, '') + ']').join(', ');
                } else {
                    payload[day.id + '_' + shiftId] = null;
                }
            });
        });

        const saveButton = form.querySelector('[type="submit"]');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Salvando...';
        }

        let saveError = null;
        try {
            // Busca exclusivamente o horário deste professor antes de decidir
            // entre atualizar a própria linha ou inserir uma nova.
            const { data: ownSchedule, error: lookupError } = await supabase
                .from('schedule')
                .select('id')
                .eq('owner', userData.user.id)
                .maybeSingle();

            if (lookupError) throw lookupError;

            if (ownSchedule) {
                const { error } = await supabase
                    .from('schedule')
                    .update(payload)
                    .eq('id', ownSchedule.id)
                    .eq('owner', userData.user.id);
                if (error) throw error;
            } else {
                // Não informa id nem owner: o Postgres gera um novo id e
                // define owner com auth.uid(). A linha legada permanece intacta.
                const { error } = await supabase
                    .from('schedule')
                    .insert(payload);
                if (error) throw error;
            }
        } catch (error) {
            saveError = error;
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Salvar horários';
            }
        }

        if (saveError) {
            console.error('Erro ao salvar horários do professor:', saveError);
            alert('Erro ao salvar horários: ' + saveError.message);
            return;
        }
        modal.close();
        await loadDashboard();
    });
}

export async function initEduPlanDashboard() {
    if (dashboardInitialized) {
        await loadDashboard();
        return;
    }
    dashboardInitialized = true;
    setupGlobalSearch();
    setupScheduleEditor();
    window.refreshEduPlanDashboard = loadDashboard;
    await loadDashboard();
}
