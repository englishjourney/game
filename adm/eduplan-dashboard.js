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
            { index: 0, label: '1º', time: '07:00 – 07:45' },
            { index: 1, label: '2º', time: '07:45 – 08:30' },
            { index: 2, label: '3º', time: '08:30 – 09:15' },
            { index: 3, label: '4º', time: '09:15 – 10:00' },
            { index: 5, label: '5º', time: '10:20 – 11:05' },
            { index: 6, label: '6º', time: '11:05 – 11:50' }
        ],
        breakTime: '10:00 – 10:20'
    },
    ves: {
        label: 'Tarde',
        icon: 'fa-cloud-sun',
        slots: [
            { index: 0, label: '1º', time: '13:00 – 13:45' },
            { index: 1, label: '2º', time: '13:45 – 14:30' },
            { index: 2, label: '3º', time: '14:30 – 15:15' },
            { index: 3, label: '4º', time: '15:15 – 16:00' },
            { index: 5, label: '5º', time: '16:20 – 17:05' },
            { index: 6, label: '6º', time: '17:05 – 17:50' }
        ],
        breakTime: '16:00 – 16:20'
    }
};

let scheduleRecord = null;
let dashboardInitialized = false;

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
    if (!value) return ['', '', '', '', 'Intervalo', '', ''];
    const matches = String(value).match(/\[([^\]]*)\]/g);
    const values = matches
        ? matches.map(item => item.slice(1, -1).trim())
        : String(value).split(',').map(item => item.replace(/[\[\]]/g, '').trim());
    const normalized = Array.from({ length: 7 }, (_, index) => values[index] || '');
    normalized[4] = 'Intervalo';
    return normalized;
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

function renderSlot(rawValue, slot) {
    const lesson = displayLesson(rawValue);
    const classes = ['schedule-entry'];
    if (lesson.vacant) classes.push('schedule-entry-vacant');
    if (lesson.empty) classes.push('schedule-entry-empty');
    return '<div class="' + classes.join(' ') + '">' +
        '<span class="schedule-entry-index">' + slot.label + '</span>' +
        '<span class="schedule-entry-content"><strong>' + escapeHtml(lesson.label) + '</strong></span>' +
        '<strong class="schedule-entry-time">' + slot.time + '</strong>' +
    '</div>';
}

function renderBreak(time) {
    return '<div class="schedule-entry schedule-entry-break">' +
        '<span class="schedule-entry-index"><i class="fa-solid fa-mug-hot" aria-hidden="true"></i></span>' +
        '<span class="schedule-entry-label">Intervalo</span>' +
        '<strong class="schedule-entry-time">' + time + '</strong>' +
    '</div>';
}

function renderShift(dayData, config, dayId, shiftId) {
    const values = readScheduleValues(dayData[dayId + '_' + shiftId]);
    return '<section class="schedule-shift schedule-shift-' + (shiftId === 'mat' ? 'morning' : 'afternoon') + '">' +
        '<header class="schedule-shift-header">' +
            '<span class="schedule-shift-icon"><i class="fa-solid ' + config.icon + '" aria-hidden="true"></i></span>' +
            '<h4>' + config.label + '</h4>' +
        '</header>' +
        '<div class="schedule-period-list">' +
            config.slots.slice(0, 4).map(slot => renderSlot(values[slot.index], slot)).join('') +
            renderBreak(config.breakTime) +
            config.slots.slice(4).map(slot => renderSlot(values[slot.index], slot)).join('') +
        '</div>' +
    '</section>';
}

function renderSchedule(data) {
    const container = document.getElementById('schedule-container');
    if (!container) return;

    const weekDates = getWeekDates();
    const currentWeekday = (new Date().getDay() + 6) % 7;
    const defaultOpenIndex = Math.min(currentWeekday, 4);

    const dayCards = weekDates.map((day, index) => {
        const isOpen = index === defaultOpenIndex;
        const dateLabel = day.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return '<article class="schedule-day-card ' + (isOpen ? 'is-open' : '') + '" data-day-card="' + day.id + '">' +
            '<button type="button" class="schedule-day-header" data-day-toggle="' + day.id + '" aria-expanded="' + String(isOpen) + '">' +
                '<span class="schedule-day-mark"><i class="fa-regular fa-calendar" aria-hidden="true"></i></span>' +
                '<span class="schedule-day-title">' + day.label + ' <span>• ' + dateLabel + '</span></span>' +
                '<span class="schedule-day-toggle-label">' + (isOpen ? 'Minimizar' : 'Maximizar') + '</span>' +
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

    container.innerHTML = '<div class="schedule-week-grid">' + dayCards.join('') + '</div>';

    container.querySelectorAll('[data-day-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            const card = button.closest('[data-day-card]');
            const content = card.querySelector('.schedule-day-content');
            const open = card.classList.toggle('is-open');
            content.hidden = !open;
            button.setAttribute('aria-expanded', String(open));
            button.querySelector('.schedule-day-toggle-label').textContent = open ? 'Minimizar' : 'Maximizar';
            const chevron = button.querySelector('.schedule-day-chevron');
            chevron.classList.toggle('fa-chevron-up', open);
            chevron.classList.toggle('fa-chevron-down', !open);
        });
    });
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
        supabase.from('planner').select('date,time,serie,team,completed_at').is('completed_at', null),
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

    scheduleRecord = scheduleResult.data?.[0] || null;
    renderSchedule(scheduleRecord || {});
}

function setupGlobalSearch() {
    const input = document.getElementById('global-search');
    const resultsContainer = document.getElementById('search-results');
    if (!input || !resultsContainer || input.dataset.initialized === 'true') return;
    input.dataset.initialized = 'true';

    input.addEventListener('input', async event => {
        const query = event.target.value.trim();
        if (query.length < 3) {
            resultsContainer.classList.add('hidden');
            return;
        }

        resultsContainer.innerHTML = '<div class="search-item">Buscando...</div>';
        resultsContainer.classList.remove('hidden');

        try {
            const [usersResult, plansResult] = await Promise.all([
                supabase.from('users').select('name, username, grade').ilike('name', '%' + query + '%').limit(5),
                supabase.from('planner').select('serie, team, activities').ilike('activities', '%' + query + '%').limit(5)
            ]);

            let html = '';
            if (usersResult.data?.length) {
                html += '<div class="search-group-label">Alunos</div>';
                html += usersResult.data.map(user => '<div class="search-item">' +
                    escapeHtml(user.name) + ' (' + escapeHtml(user.username) + ') — ' + escapeHtml(user.grade || 'Sem turma') +
                '</div>').join('');
            }
            if (plansResult.data?.length) {
                html += '<div class="search-group-label">Planejamentos</div>';
                html += plansResult.data.map(plan => '<div class="search-item">' +
                    escapeHtml([plan.serie, plan.team].filter(Boolean).join('')) + ': ' +
                    escapeHtml(String(plan.activities || '').slice(0, 70)) +
                '</div>').join('');
            }
            resultsContainer.innerHTML = html || '<div class="search-item">Nenhum resultado encontrado.</div>';
        } catch (error) {
            console.error('Erro na pesquisa global:', error);
            resultsContainer.innerHTML = '<div class="search-item">Não foi possível realizar a pesquisa.</div>';
        }
    });

    document.addEventListener('click', event => {
        if (!resultsContainer.contains(event.target) && event.target !== input) {
            resultsContainer.classList.add('hidden');
        }
    });
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
                const values = ['', '', '', '', 'Intervalo', '', ''];
                form.querySelectorAll('[data-schedule-field][data-day="' + day.id + '"][data-shift="' + shiftId + '"]').forEach(input => {
                    values[Number(input.dataset.index)] = input.value.trim();
                });
                payload[day.id + '_' + shiftId] = values.map(value => '[' + value.replace(/[\[\]]/g, '') + ']').join(', ');
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
