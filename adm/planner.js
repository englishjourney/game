import { supabase } from '../supabaseClient.js';

const plannerItemsById = new Map();
let allActivePlannerItems = [];
let selectedPlannerItem = null;
let mergeSourceItem = null;
let mergeTargetItem = null;
let mergeIsSaving = false;
const selectedPlannerIds = new Set();
let plannerSelectionMode = false;
let pendingPlannerRescheduleItems = [];

export function initPlanner() {
    setupCustomOptions();
    setupDatePickers();
    setupLastTeamToggle();
    loadPlanners();
    loadCompletedPlanners();
    updatePlannerBulkToolbar();
    setupPlannerMerge();
    setupPlannerBulkActions();
    setupPlannerSectionReschedule();
    setupActivitiesEditor();
    const detailsEditButton = document.getElementById('btn-edit-planner-from-details');
    if (detailsEditButton) detailsEditButton.addEventListener('click', () => {
        if (!selectedPlannerItem) return;
        document.getElementById('planner-details-modal').close();
        window.editPlanner(selectedPlannerItem);
    });

    const updateRequiredFields = () => {
        const isEsp = document.getElementById('cb-especial').checked;
        const isFlg = document.getElementById('cb-folga').checked;
        const isPrv = document.getElementById('cb-prova').checked;
        
        document.getElementById('plan-time').required = !(isEsp || isFlg || isPrv);
        document.getElementById('plan-grade').required = !(isEsp || isFlg || isPrv);
        const activitiesEditor = document.getElementById('plan-activities');
        activitiesEditor.required = !(isFlg || isPrv);
        if (!activitiesEditor.required) activitiesEditor.setCustomValidity('');
        document.getElementById('plan-end-date').required = isPrv;
        
        document.getElementById('label-end-date').classList.toggle('hidden', !isPrv);
        
        const btnReplicar = document.getElementById('btn-replicar');
        if (btnReplicar) {
            btnReplicar.classList.toggle('hidden', !isPrv);
        }
    };

    ['cb-especial', 'cb-folga', 'cb-prova', 'cb-adaptado'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            if (e.target.checked) {
                ['cb-especial', 'cb-folga', 'cb-prova', 'cb-adaptado'].forEach(other => {
                    if (other !== id) document.getElementById(other).checked = false;
                });
            }
            updateRequiredFields();
        });
    });
    window.updateRequiredFields = updateRequiredFields;

    // Abrir modal pelo botão flutuante "+ Nova aula"
    document.getElementById('btn-add-plan').addEventListener('click', () => {
        resetPlannerForm();
        document.getElementById('plan-id').value = '';
        ['cb-especial', 'cb-folga', 'cb-prova', 'cb-adaptado'].forEach(id => document.getElementById(id).checked = false);
        
        // Aplica "Última turma" se o toggle estiver ativo
        applyLastTeamIfEnabled();

        updateRequiredFields();
        document.getElementById('planner-modal-title').textContent = 'Adicionar Aula';
        document.getElementById('planner-modal').showModal();
    });

    // Lógica do botão Replicar
    const btnReplicar = document.getElementById('btn-replicar');
    if (btnReplicar) {
        btnReplicar.addEventListener('click', async (e) => {
            e.preventDefault();

            const startDateStr = document.getElementById('plan-date').value;
            const endDateStr = document.getElementById('plan-end-date').value;

            if (!startDateStr || !endDateStr) {
                alert('Preencha a Data inicial e a Data final antes de replicar.');
                return;
            }

            const start = parsePlannerDateBR(startDateStr);
            const end = parsePlannerDateBR(endDateStr);
            if (!start || !end) {
                alert('Informe datas válidas no formato DD/MM/AAAA.');
                return;
            }

            const inserts = [];
            let current = incrementPlannerDate(start);

            // Datas são comparadas e incrementadas como texto; não dependem de fuso horário.
            while (current && current.iso <= end.iso) {
                inserts.push({
                    day: current.weekday,
                    date: current.formatted,
                    special: 3
                });
                current = incrementPlannerDate(current);
            }

            if (inserts.length > 0) {
                const progressBar = document.getElementById('replicar-progress');
                if (progressBar) {
                    progressBar.classList.remove('hidden');
                    progressBar.value = 50;
                }

                const { error } = await supabase.from('planner').insert(inserts);
                
                if (progressBar) {
                    progressBar.value = 100;
                    setTimeout(() => progressBar.classList.add('hidden'), 2000);
                }

                if (error) {
                    alert('Erro ao replicar: ' + error.message);
                } else {
                    alert(`Provas replicadas com sucesso até o dia ${endDateStr}! Lembre-se de salvar o registro principal.`);
                    loadPlanners();
                }
            } else {
                alert('A data final deve ser posterior à data inicial.');
            }
        });
    }

    // Submissão do Formulário
    document.getElementById('planner-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('plan-id').value;
        const specialValue = document.getElementById('cb-adaptado').checked ? 4 :
                             document.getElementById('cb-especial').checked ? 1 :
                             document.getElementById('cb-folga').checked ? 2 :
                             document.getElementById('cb-prova').checked ? 3 : 0;

        const activitiesValue = document.getElementById('plan-activities').value;
        const activityTitleLine = activitiesValue.replace(/\r/g, '').split('\n').find(line => line.trim()) || '';
        if (activitiesValue.trim() && !/^#(?!#)[ \t]+\S.*$/.test(activityTitleLine)) {
            const activitiesEditor = document.getElementById('plan-activities');
            activitiesEditor.setCustomValidity('O primeiro conteúdo precisa ser um título principal H1 no formato # Título da aula.');
            activitiesEditor.reportValidity();
            activitiesEditor.focus();
            return;
        }
        document.getElementById('plan-activities').setCustomValidity('');
        const selectedDate = parsePlannerDateBR(document.getElementById('plan-date').value);
        const dateInput = document.getElementById('plan-date');
        if (!selectedDate) {
            dateInput.setCustomValidity('Escolha uma data válida no calendário ou informe DD/MM/AAAA.');
            dateInput.reportValidity();
            dateInput.focus();
            return;
        }
        dateInput.setCustomValidity('');
        dateInput.value = selectedDate.formatted;
        document.getElementById('plan-day').value = selectedDate.weekday;

        const gradeParts = splitPlannerGrade(document.getElementById('plan-grade').value);
        const planData = {
            day: selectedDate.weekday,
            date: selectedDate.formatted,
            time: document.getElementById('plan-time').value,
            serie: gradeParts.serie,
            team: gradeParts.team,
            skills: document.getElementById('plan-skills').value,
            activities: activitiesValue,
            duration: document.getElementById('plan-duration').value,
            special: specialValue
        };

        // Salvar última turma no cache se o toggle estiver ativo
        const isLastTeamEnabled = localStorage.getItem('planner_last_team_enabled') === 'true';
        if (isLastTeamEnabled && document.getElementById('plan-grade').value) {
            localStorage.setItem('planner_last_grade', document.getElementById('plan-grade').value);
            localStorage.removeItem('planner_last_serie');
            localStorage.removeItem('planner_last_team');
        }

        let result;
        if (id) {
            result = await supabase.from('planner').update(planData).eq('id', id);
        } else {
            result = await supabase.from('planner').insert([planData]);
        }

        if (result.error) alert('Erro ao salvar: ' + result.error.message);
        else {
            document.getElementById('planner-modal').close();
            loadPlanners();
        }
    });

    // A guia sempre abre sem um filtro antigo restaurado pelo navegador.
    const searchInput = document.getElementById('planner-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.addEventListener('input', () => {
            renderPlannerList();
        });
    }

    // Limpar cache ao sair
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('planner_state_')) {
                    localStorage.removeItem(key);
                }
            });
        });
    }
}

// Helper para redefinir o formulário mantendo integridade
function resetPlannerForm() {
    document.getElementById('planner-form').reset();
    const activitiesEditor = document.getElementById('plan-activities');
    if (activitiesEditor) activitiesEditor.setCustomValidity('');
    if (window.updatePlannerActivitiesPreview) window.updatePlannerActivitiesPreview();
    const gradeSelect = document.getElementById('plan-grade');
    if (gradeSelect) {
        [...gradeSelect.options].filter(option => option.dataset.legacyGrade === 'true').forEach(option => option.remove());
        gradeSelect.value = '';
    }
    document.getElementById('plan-time').value = '';
    document.getElementById('plan-day').value = '';
    document.getElementById('plan-date').value = '';
    document.getElementById('plan-date-picker').value = '';
    document.getElementById('plan-end-date-picker').value = '';
}

// --- LÓGICA DE GERENCIAMENTO DE DROPDOWNS CUSTOMIZADOS COM PROMPT ---
function setupCustomOptions() {
    // A turma agora usa uma lista fixa em um único seletor.
    loadCustomOptionsForSelect('plan-time', 'planner_custom_times');
    setupCustomAddListener('plan-time', 'planner_custom_times', 'Hora');
}

function loadCustomOptionsForSelect(selectId, storageKey) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const customItems = JSON.parse(localStorage.getItem(storageKey) || '[]');
    customItems.forEach(val => {
        if (!select.querySelector(`option[value="${val}"]`)) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            const addNewOpt = select.querySelector('option[value="__ADD_NEW__"]');
            if (addNewOpt) select.insertBefore(opt, addNewOpt);
            else select.appendChild(opt);
        }
    });
}

function setupCustomAddListener(selectId, storageKey, labelName) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.addEventListener('change', () => {
        if (select.value !== '__ADD_NEW__') return;
        const newVal = prompt('Digite o novo valor para ' + labelName + ':');
        if (!newVal || !newVal.trim()) {
            select.value = '';
            return;
        }
        const cleanVal = newVal.trim();
        setSelectValueWithCustom(selectId, cleanVal);
        const customItems = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!customItems.includes(cleanVal)) {
            customItems.push(cleanVal);
            localStorage.setItem(storageKey, JSON.stringify(customItems));
        }
    });
}

function setSelectValueWithCustom(selectId, value) {
    const select = document.getElementById(selectId);
    if (!select || !value) {
        if (select) select.value = '';
        return;
    }
    let opt = select.querySelector(`option[value="${value}"]`);
    if (!opt) {
        opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        const addNewOpt = select.querySelector('option[value="__ADD_NEW__"]');
        if (addNewOpt) select.insertBefore(opt, addNewOpt);
        else select.appendChild(opt);
    }
    select.value = value;
}

// --- DATAS DO PLANNER: TEXTO BRASILEIRO + CALENDÁRIO NATIVO ---
const PLANNER_WEEKDAYS = [
    'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
    'Quinta-feira', 'Sexta-feira', 'Sábado'
];

function parsePlannerDateBR(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1) return null;

    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > monthLengths[month - 1]) return null;

    // Algoritmo gregoriano sem Date(): evita deslocamentos por fuso horário.
    const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let adjustedYear = year;
    if (month < 3) adjustedYear -= 1;
    const weekdayIndex = (
        adjustedYear +
        Math.floor(adjustedYear / 4) -
        Math.floor(adjustedYear / 100) +
        Math.floor(adjustedYear / 400) +
        offsets[month - 1] +
        day
    ) % 7;

    const pad = number => String(number).padStart(2, '0');
    return {
        day,
        month,
        year,
        iso: `${year}-${pad(month)}-${pad(day)}`,
        formatted: `${pad(day)}/${pad(month)}/${year}`,
        weekday: PLANNER_WEEKDAYS[weekdayIndex]
    };
}

function plannerDateFromISO(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return parsePlannerDateBR(`${match[3]}/${match[2]}/${match[1]}`);
}

function incrementPlannerDate(dateInfo) {
    if (!dateInfo) return null;
    const leapYear = dateInfo.year % 4 === 0 && (dateInfo.year % 100 !== 0 || dateInfo.year % 400 === 0);
    const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let day = dateInfo.day + 1;
    let month = dateInfo.month;
    let year = dateInfo.year;

    if (day > monthLengths[month - 1]) {
        day = 1;
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return parsePlannerDateBR(`${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`);
}

function setPlannerDateFields(value, fallbackDay = '') {
    const dateInput = document.getElementById('plan-date');
    const datePicker = document.getElementById('plan-date-picker');
    const dayInput = document.getElementById('plan-day');
    const parsed = parsePlannerDateBR(value);

    if (dateInput) {
        dateInput.value = parsed ? parsed.formatted : String(value || '');
        dateInput.setCustomValidity('');
    }
    if (datePicker) datePicker.value = parsed ? parsed.iso : '';
    if (dayInput) dayInput.value = parsed ? parsed.weekday : (fallbackDay || '');
    return parsed;
}

function setupDatePickers() {
    setupDateInputAndPicker('plan-date', 'plan-date-picker');
    setupDateInputAndPicker('plan-end-date', 'plan-end-date-picker');
}

function setupDateInputAndPicker(inputId, pickerId) {
    const textInput = document.getElementById(inputId);
    const datePicker = document.getElementById(pickerId);
    const isLessonDate = inputId === 'plan-date';

    if (textInput) {
        textInput.addEventListener('input', () => {
            let digits = textInput.value.replace(/\D/g, '');
            if (digits.length > 8) digits = digits.slice(0, 8);
            if (digits.length >= 5) {
                textInput.value = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
            } else if (digits.length >= 3) {
                textInput.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
            } else {
                textInput.value = digits;
            }

            const parsed = parsePlannerDateBR(textInput.value);
            if (datePicker) datePicker.value = parsed ? parsed.iso : '';
            if (isLessonDate) {
                const dayInput = document.getElementById('plan-day');
                if (dayInput) dayInput.value = parsed ? parsed.weekday : '';
            }
            textInput.setCustomValidity(
                digits.length === 8 && !parsed ? 'Data inválida. Confira dia, mês e ano.' : ''
            );
        });

        if (datePicker) {
            // Clicar no próprio campo abre o calendário, mantendo a data do banco em texto.
            textInput.addEventListener('click', () => {
                const current = parsePlannerDateBR(textInput.value);
                datePicker.value = current ? current.iso : '';
                try {
                    if (typeof datePicker.showPicker === 'function') datePicker.showPicker();
                    else datePicker.click();
                } catch {
                    datePicker.focus();
                    datePicker.click();
                }
            });
        }
    }

    if (datePicker && textInput) {
        datePicker.addEventListener('change', () => {
            const parsed = plannerDateFromISO(datePicker.value);
            if (!parsed) return;
            textInput.value = parsed.formatted;
            textInput.setCustomValidity('');
            if (isLessonDate) {
                const dayInput = document.getElementById('plan-day');
                if (dayInput) dayInput.value = parsed.weekday;
            }
        });
    }
}

// --- LÓGICA DO SWITCHER "ÚLTIMA TURMA" ---
function setupLastTeamToggle() {
    const toggle = document.getElementById('last-team-toggle');
    if (!toggle) return;
    toggle.checked = localStorage.getItem('planner_last_team_enabled') === 'true';
    toggle.addEventListener('change', () => {
        localStorage.setItem('planner_last_team_enabled', toggle.checked ? 'true' : 'false');
        if (!toggle.checked) {
            localStorage.removeItem('planner_last_grade');
            localStorage.removeItem('planner_last_serie');
            localStorage.removeItem('planner_last_team');
        }
    });
}

function applyLastTeamIfEnabled() {
    if (localStorage.getItem('planner_last_team_enabled') !== 'true') return;
    let grade = localStorage.getItem('planner_last_grade') || '';
    if (!grade) grade = (localStorage.getItem('planner_last_serie') || '') + (localStorage.getItem('planner_last_team') || '');
    const select = document.getElementById('plan-grade');
    if (select && [...select.options].some(option => option.value === grade)) select.value = grade;
}

// --- LÓGICA DE ABRIR "+ NOVA AULA" DIRETO DA SEÇÃO DO DIA ---
window.addPlanForDay = (day, date) => {
    resetPlannerForm();
    document.getElementById('plan-id').value = '';
    ['cb-especial', 'cb-folga', 'cb-prova', 'cb-adaptado'].forEach(id => document.getElementById(id).checked = false);

    // Preenche o dia e a data fornecidos pela seção
    const selectedDate = setPlannerDateFields(date, day || '');
    const actualDay = selectedDate ? selectedDate.weekday : (day || '');

    // Aplica "Última turma" se o switcher estiver ligado
    applyLastTeamIfEnabled();

    window.updateRequiredFields();
    document.getElementById('planner-modal-title').textContent = `Adicionar Aula - ${actualDay} (${date})`;
    document.getElementById('planner-modal').showModal();
};

// Recolher/expandir cada dia, preservando o estado salvo pelo professor.
window.togglePlannerSection = (btn, title) => {
    const contentDiv = btn.closest('.planner-section-title')?.nextElementSibling;
    if (!contentDiv) return;

    const isHidden = contentDiv.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!isHidden));
    btn.setAttribute('aria-label', isHidden ? 'Expandir dia' : 'Recolher dia');
    btn.title = isHidden ? 'Expandir dia' : 'Recolher dia';
    btn.innerHTML = '<i class="fa-solid ' + (isHidden ? 'fa-chevron-down' : 'fa-chevron-up') + '" aria-hidden="true"></i>';
    localStorage.setItem(`planner_state_v2_${title}`, String(isHidden));
};


function normalizePlannerClassValue(value) {
    return String(value == null ? '' : value).trim().toLocaleLowerCase('pt-BR');
}

function splitPlannerGrade(value) {
    const match = String(value || '').trim().toUpperCase().match(/^(\d{1,2})([A-Z])$/);
    return match ? { serie: match[1], team: match[2] } : { serie: '', team: '' };
}
function formatPlannerGrade(item) {
    return (String(item && item.serie || '').trim() + String(item && item.team || '').trim()).toUpperCase();
}
function setPlannerGradeSelect(serie, team) {
    const select = document.getElementById('plan-grade');
    if (!select) return;
    const grade = (String(serie || '').trim() + String(team || '').trim()).toUpperCase();
    [...select.options].filter(option => option.dataset.legacyGrade === 'true').forEach(option => option.remove());
    if (grade && ![...select.options].some(option => option.value === grade)) {
        const legacy = document.createElement('option');
        legacy.value = grade;
        legacy.textContent = grade + ' (registro existente)';
        legacy.dataset.legacyGrade = 'true';
        select.appendChild(legacy);
    }
    select.value = grade;
}
function getPlannerTitle(item) {
    const lines = String(item && item.activities || '').replace(/\r/g, '').split('\n');
    const firstLine = lines.find(line => line.trim()) || '';
    const heading = firstLine.match(/^#\s+(.+?)\s*$/);
    let title = heading ? heading[1] : firstLine.replace(/^#{1,6}\s*/, '');
    title = title.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/~~(.*?)~~/g, '$1').trim();
    if (title) return title.length > 110 ? title.slice(0, 107) + '…' : title;
    if (item && item.special == 2) return 'Folga';
    if (item && item.special == 3) return 'Prova';
    if (item && item.special == 4) return 'Aula adaptada';
    return 'Aula sem título';
}

function renderMergePreviewCard(item, label) {
    if (!item) {
        return '<div class="merge-empty-card"><i class="fa-regular fa-square-plus"></i><p>Selecione uma aula para receber as atividades</p><button type="button" class="btn-primary" id="btn-open-merge-picker">Selecionar aula</button></div>';
    }

    return '<article class="merge-preview-card">' +
        '<div class="merge-preview-card-label">' + escapePlannerHtml(label) + '</div>' +
        '<h4>' + escapePlannerHtml(item.day || 'Aula') + ' — ' + escapePlannerHtml(item.date || 'Sem data') + '</h4>' +
        '<p><strong>Horário:</strong> ' + escapePlannerHtml(item.time || 'Não informado') + '</p>' +
        '<p><strong>Turma:</strong> ' + escapePlannerHtml(formatPlannerGrade(item) || 'Não informada') + '</p>' +
        '<p><strong>Duração:</strong> ' + escapePlannerHtml(item.duration || 'Não informada') + '</p>' +
        '<div class="merge-preview-activities"><strong>Atividades:</strong>' +
            (item.activities ? renderPlannerMarkdown(item.activities) : '<p class="merge-no-activities">Sem atividades cadastradas.</p>') +
        '</div>' + (label === 'Aula de destino' ? '<button type="button" id="btn-change-merge-target" class="btn-secondary merge-change-target">Trocar aula</button>' : '') +
        '</article>';
}

function renderMergeCandidateCard(item) {
    return '<article class="merge-option-card">' +
        '<div class="merge-option-info">' +
            '<strong>' + escapePlannerHtml(item.day || 'Aula') + ' — ' + escapePlannerHtml(item.date || 'Sem data') + '</strong>' +
            '<span>' + escapePlannerHtml(item.time || 'Sem horário') + ' · ' + escapePlannerHtml(formatPlannerGrade(item) || 'Sem turma') + '</span>' +
            '<div class="merge-option-activities">' + (item.activities ? renderPlannerMarkdown(item.activities) : '<em>Sem atividades cadastradas.</em>') + '</div>' +
        '</div><button type="button" class="btn-primary" data-merge-select="' + escapePlannerHtml(item.id) + '">Selecionar</button>' +
    '</article>';
}

function showPlannerMergeComparison() {
    const comparison = document.getElementById('merge-comparison-view');
    const picker = document.getElementById('merge-picker-view');
    if (comparison) comparison.classList.remove('hidden');
    if (picker) picker.classList.add('hidden');
}

function setupPlannerMerge() {
    const modal = document.getElementById('planner-merge-modal');
    if (!modal) return;

    const closeButton = document.getElementById('btn-close-planner-merge');
    const cancelButton = document.getElementById('btn-cancel-planner-merge');
    const confirmButton = document.getElementById('btn-confirm-planner-merge');
    const targetPreview = document.getElementById('merge-target-preview');

    const closeModal = () => {
        if (modal.open) modal.close();
        mergeSourceItem = null;
        mergeTargetItem = null;
        mergeIsSaving = false;
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.textContent = 'Unir aulas';
        }
    };

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (cancelButton) cancelButton.addEventListener('click', closeModal);

    if (targetPreview) {
        targetPreview.addEventListener('click', event => {
            if (event.target.closest('#btn-open-merge-picker, #btn-change-merge-target')) {
                window.showPlannerMergePicker();
            }
        });
    }

    const backButton = document.getElementById('btn-back-merge-picker');
    if (backButton) backButton.addEventListener('click', showPlannerMergeComparison);

    if (confirmButton) {
        confirmButton.addEventListener('click', async () => {
            if (mergeIsSaving || !mergeSourceItem || !mergeTargetItem) return;

            const confirmed = confirm(
                'Unir as atividades da aula de origem às atividades da aula de destino?\n\n' +
                'As atividades da aula de destino ficarão primeiro; uma linha separadora será adicionada e, abaixo dela, entrarão as atividades da aula de origem. ' +
                'A aula de origem será removida após a atualização. Os demais dados da aula de destino serão preservados.'
            );
            if (!confirmed) return;

            mergeIsSaving = true;
            confirmButton.disabled = true;
            confirmButton.textContent = 'Unindo...';

            try {
                const sourceId = String(mergeSourceItem.id);
                const targetId = String(mergeTargetItem.id);
                const { data: currentItems, error: fetchError } = await supabase
                    .from('planner')
                    .select('*')
                    .in('id', [sourceId, targetId])
                    .is('completed_at', null);

                if (fetchError) throw fetchError;

                const currentSource = (currentItems || []).find(item => String(item.id) === sourceId);
                const currentTarget = (currentItems || []).find(item => String(item.id) === targetId);
                if (!currentSource || !currentTarget) {
                    throw new Error('Uma das aulas não está mais disponível entre os planejamentos ativos. Atualize a lista e tente novamente.');
                }

                // O merge pode unir aulas de datas e turmas diferentes.
                // Somente as atividades são copiadas; os demais campos do destino são preservados.

                const targetActivities = String(currentTarget.activities || '');
                const sourceActivities = String(currentSource.activities || '');
                const cleanTargetActivities = targetActivities.replace(/\s+$/, '');
                const cleanSourceActivities = sourceActivities.trim();
                if (!cleanSourceActivities) {
                    throw new Error('A aula de origem não possui atividades para adicionar. Nenhuma aula foi alterada.');
                }
                let mergedActivities = cleanTargetActivities;

                if (cleanSourceActivities) {
                    mergedActivities = cleanTargetActivities
                        ? cleanTargetActivities + '\n\n---\n\n' + cleanSourceActivities
                        : cleanSourceActivities;
                }

                let updateTargetQuery = supabase
                    .from('planner')
                    .update({ activities: mergedActivities })
                    .eq('id', targetId)
                    .is('completed_at', null);
                updateTargetQuery = currentTarget.activities == null
                    ? updateTargetQuery.is('activities', null)
                    : updateTargetQuery.eq('activities', currentTarget.activities);

                const { data: updatedTarget, error: updateError } = await updateTargetQuery
                    .select('*')
                    .maybeSingle();

                if (updateError) throw updateError;
                if (!updatedTarget) throw new Error('As atividades da aula de destino foram alteradas durante o merge. Nenhuma aula foi removida. Reabra o merge e tente novamente.');

                let deleteSourceQuery = supabase
                    .from('planner')
                    .delete()
                    .eq('id', sourceId)
                    .is('completed_at', null);
                deleteSourceQuery = currentSource.activities == null
                    ? deleteSourceQuery.is('activities', null)
                    : deleteSourceQuery.eq('activities', currentSource.activities);

                const { data: deletedSource, error: deleteError } = await deleteSourceQuery
                    .select('id')
                    .maybeSingle();

                if (deleteError || !deletedSource) {
                    const { data: rollbackData, error: rollbackError } = await supabase
                        .from('planner')
                        .update({ activities: currentTarget.activities })
                        .eq('id', targetId)
                        .eq('activities', mergedActivities)
                        .is('completed_at', null)
                        .select('id')
                        .maybeSingle();

                    if (rollbackError || !rollbackData) {
                        throw new Error('A aula de destino recebeu as atividades, mas não foi possível remover a aula de origem nem restaurar o texto anterior. Verifique as duas aulas antes de tentar novamente. Detalhe: ' + (deleteError || new Error('A aula de origem não foi removida.')).message);
                    }
                    throw new Error('A aula de origem não pôde ser removida. A aula de destino foi restaurada ao conteúdo anterior. ' + (deleteError ? deleteError.message : 'Atualize a lista e tente novamente.'));
                }

                plannerItemsById.delete(sourceId);
                plannerItemsById.set(targetId, updatedTarget);
                closeModal();
                await loadPlanners();
                alert('Merge concluído! As atividades foram unidas e a aula de origem foi removida.');
            } catch (error) {
                console.error('Erro ao unir aulas:', error);
                alert('Não foi possível concluir o merge: ' + (error.message || 'erro inesperado'));
            } finally {
                mergeIsSaving = false;
                if (confirmButton) {
                    confirmButton.disabled = !mergeTargetItem;
                    confirmButton.textContent = 'Unir aulas';
                }
            }
        });
    }
}

window.openPlannerMerge = async id => {
    const modal = document.getElementById('planner-merge-modal');
    if (!modal) return;

    const { data, error } = await supabase
        .from('planner')
        .select('*')
        .eq('id', id)
        .is('completed_at', null)
        .maybeSingle();

    if (error || !data) {
        alert('Não foi possível abrir o merge: esta aula não está mais nos planejamentos ativos.');
        return;
    }

    mergeSourceItem = data;
    mergeTargetItem = null;

    document.getElementById('merge-source-preview').innerHTML = renderMergePreviewCard(mergeSourceItem, 'Aula de origem');
    document.getElementById('merge-target-preview').innerHTML = renderMergePreviewCard(null, '');
    document.getElementById('merge-picker-list').innerHTML = '';
    document.getElementById('merge-comparison-view').classList.remove('hidden');
    document.getElementById('merge-picker-view').classList.add('hidden');

    const confirmButton = document.getElementById('btn-confirm-planner-merge');
    confirmButton.disabled = true;
    confirmButton.textContent = 'Unir aulas';

    if (!modal.open) modal.showModal();
};

window.showPlannerMergePicker = async () => {
    if (!mergeSourceItem) return;

    const comparison = document.getElementById('merge-comparison-view');
    const picker = document.getElementById('merge-picker-view');
    const list = document.getElementById('merge-picker-list');
    comparison.classList.add('hidden');
    picker.classList.remove('hidden');
    list.innerHTML = '<div class="empty-state">Carregando todos os planejamentos ativos...</div>';

    const { data, error } = await supabase
        .from('planner')
        .select('*')
        .is('completed_at', null)
        .order('id', { ascending: false });

    if (error) {
        list.innerHTML = '<div class="empty-state">Erro ao carregar as aulas disponíveis.</div>';
        console.error('Erro ao carregar opções de merge:', error);
        return;
    }

    // Sem restrição de turma ou data: qualquer outro planejamento ativo pode ser destino.
    const candidates = (data || []).filter(item => String(item.id) !== String(mergeSourceItem.id));

    if (!candidates.length) {
        list.innerHTML = '<div class="empty-state">Não há outras aulas planejadas e não concluídas disponíveis para merge.</div>';
        return;
    }

    list.innerHTML = candidates.map(renderMergeCandidateCard).join('');
    list.querySelectorAll('[data-merge-select]').forEach(button => {
        button.addEventListener('click', () => {
            const selected = candidates.find(item => String(item.id) === String(button.dataset.mergeSelect));
            if (!selected) return;

            mergeTargetItem = selected;
            document.getElementById('merge-target-preview').innerHTML = renderMergePreviewCard(mergeTargetItem, 'Aula de destino');
            document.getElementById('btn-confirm-planner-merge').disabled = false;
            showPlannerMergeComparison();
        });
    });
};

function renderPlannerCard(p, mode = 'active') {
    const cardClass = p.special == 4 ? 'card-adapted' :
        (p.special == 1 ? 'card-special-1' : (p.special == 2 ? 'card-special-2' : (p.special == 3 ? 'card-special-3' : '')));
    const grade = formatPlannerGrade(p);
    const specialLabel = p.special == 4
        ? '<span class="planner-type-chip adapted-chip"><i class="fa-solid fa-puzzle-piece"></i> Adaptado</span>'
        : (p.special == 1 ? '<span class="planner-type-chip">Especial</span>' : (p.special == 2 ? '<span class="planner-type-chip">Folga</span>' : (p.special == 3 ? '<span class="planner-type-chip">Prova</span>' : '')));
    const isCompleted = mode === 'completed';
    const selectionControl = !isCompleted && plannerSelectionMode
        ? '<label class="planner-card-select" title="Selecionar este planejamento"><input type="checkbox" class="planner-select-checkbox" data-plan-select="' + escapePlannerHtml(p.id) + '"' + (selectedPlannerIds.has(String(p.id)) ? ' checked' : '') + '><span></span></label>'
        : '';
    const actions = isCompleted
        ? '<div class="planner-card-menu"><button type="button" class="planner-completed-delete" data-planner-action="delete-completed" aria-label="Excluir aula passada" title="Excluir aula passada"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div>'
        : '<div class="planner-card-menu"><button type="button" class="planner-options-trigger" aria-label="Opções da aula" aria-expanded="false"><i class="fa-solid fa-ellipsis-vertical"></i></button><div class="planner-actions-menu hidden">' +
            '<button type="button" data-planner-action="edit"><i class="fa-solid fa-pen"></i> Editar</button>' +
            '<button type="button" data-planner-action="merge"><i class="fa-solid fa-object-group"></i> Mesclar</button>' +
            '<button type="button" data-planner-action="defer"><i class="fa-solid fa-clock"></i> Adiar</button>' +
            '<button type="button" data-planner-action="advance"><i class="fa-solid fa-forward"></i> Adiantar</button>' +
            '<button type="button" data-planner-action="complete"><i class="fa-solid fa-check"></i> Concluída</button>' +
            '<button type="button" data-planner-action="delete" class="danger-action"><i class="fa-solid fa-trash"></i> Excluir</button>' +
          '</div></div>';
    return '<article class="data-card planner-card ' + cardClass + (isCompleted ? ' completed-card' : '') +
        (selectedPlannerIds.has(String(p.id)) && !isCompleted ? ' planner-card-selected' : '') + '"' +
        ' id="plan-card-' + escapePlannerHtml(p.id) + '" data-plan-id="' + escapePlannerHtml(p.id) + '" role="button" tabindex="0" aria-label="Ver detalhes: ' + escapePlannerHtml(getPlannerTitle(p)) + '">' +
        selectionControl +
        '<div class="data-card-info planner-card-info"><div class="planner-card-heading"><div class="planner-card-title-wrap">' + specialLabel +
            '<div class="planner-card-title-line">' +
                (grade ? '<span class="planner-card-grade"><i class="fa-solid fa-users" aria-hidden="true"></i>' + escapePlannerHtml(grade) + '</span>' : '') +
                '<h3 class="planner-card-title">' + escapePlannerHtml(getPlannerTitle(p)) + '</h3>' +
            '</div></div>' + actions + '</div>' +
            '<div class="planner-card-datetime">' +
                (isCompleted ? '<span class="planner-completed-date"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + escapePlannerHtml((p.day ? p.day + ' · ' : '') + (p.date || 'Sem data')) + '</span>' : '') +
                '<strong><i class="fa-regular fa-clock" aria-hidden="true"></i> ' + escapePlannerHtml(p.time || 'Horário não definido') + '</strong>' +
            '</div>' +
            '<div class="planner-card-meta">' +
            (p.duration ? '<span><i class="fa-regular fa-hourglass-half"></i> ' + escapePlannerHtml(p.duration) + '</span>' : '') +
            (p.tag ? '<span class="planner-card-tag"><i class="fa-solid fa-arrows-rotate"></i> ' + escapePlannerHtml(p.tag) + '</span>' : '') +
            (isCompleted && p.completed_at ? '<span class="completed-at"><i class="fa-solid fa-circle-check"></i> Concluída em ' + new Date(p.completed_at).toLocaleString('pt-BR') + '</span>' : '') +
            '</div></div></article>';
}
function setupPlannerCardInteractions(container) {
    container.querySelectorAll('.data-card[data-plan-id]').forEach(card => {
        const id = String(card.dataset.planId);
        const checkbox = card.querySelector('.planner-select-checkbox');
        if (checkbox) checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedPlannerIds.add(id);
            else selectedPlannerIds.delete(id);
            card.classList.toggle('planner-card-selected', checkbox.checked);
            updatePlannerBulkToolbar();
        });
        const completedDeleteButton = card.querySelector('.planner-completed-delete');
        if (completedDeleteButton) {
            completedDeleteButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                window.deleteCompletedPlanner(id);
            });
        }

        const optionsButton = card.querySelector('.planner-options-trigger');
        const actionsMenu = card.querySelector('.planner-actions-menu');
        if (optionsButton && actionsMenu) {
            optionsButton.addEventListener('click', event => {
                event.stopPropagation();
                const open = actionsMenu.classList.contains('hidden');
                container.querySelectorAll('.planner-actions-menu').forEach(menu => menu.classList.add('hidden'));
                container.querySelectorAll('.planner-options-trigger').forEach(button => button.setAttribute('aria-expanded', 'false'));
                actionsMenu.classList.toggle('hidden', !open);
                optionsButton.setAttribute('aria-expanded', String(open));
            });
            actionsMenu.querySelectorAll('[data-planner-action]').forEach(button => button.addEventListener('click', event => {
                event.stopPropagation();
                actionsMenu.classList.add('hidden');
                optionsButton.setAttribute('aria-expanded', 'false');
                const item = plannerItemsById.get(id) || allActivePlannerItems.find(plan => String(plan.id) === id);
                if (button.dataset.plannerAction === 'edit' && item) window.editPlanner(item);
                else if (button.dataset.plannerAction === 'merge') window.openPlannerMerge(id);
                else if (button.dataset.plannerAction === 'defer') window.deferPlanner(id);
                else if (button.dataset.plannerAction === 'advance') window.advancePlanner(id);
                else if (button.dataset.plannerAction === 'complete') window.completePlanner(id);
                else if (button.dataset.plannerAction === 'delete') window.deletePlanner(id);
                else if (button.dataset.plannerAction === 'delete-completed') window.deleteCompletedPlanner(id);
            }));
        }
        card.addEventListener('click', event => {
            if (event.target.closest('button, a, input, label')) return;
            window.viewPlanner(id);
        });
        card.addEventListener('keydown', event => {
            if (event.target !== card) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                window.viewPlanner(id);
            }
        });
    });
}
function normalizePlannerSearchValue(value) {
    return String(value == null ? '' : value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .trim();
}

function setupPlannerSectionReschedule() {
    const modal = document.getElementById('planner-reschedule-modal');
    const form = document.getElementById('planner-reschedule-form');
    const dateInput = document.getElementById('planner-reschedule-date');
    const cancelButton = document.getElementById('btn-cancel-planner-reschedule');
    const saveButton = document.getElementById('btn-confirm-planner-reschedule');
    if (!modal || !form || !dateInput || !saveButton) return;

    if (cancelButton) cancelButton.addEventListener('click', () => modal.close());
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const selectedDate = plannerDateFromISO(dateInput.value);
        if (!selectedDate || !pendingPlannerRescheduleItems.length) {
            dateInput.setCustomValidity('Escolha uma data válida.');
            dateInput.reportValidity();
            return;
        }
        dateInput.setCustomValidity('');

        const ids = [...new Set(pendingPlannerRescheduleItems.map(item => item.id))];
        const sourceDateKeys = new Set(pendingPlannerRescheduleItems.map(item => plannerDateKey(item.date)));
        if (sourceDateKeys.size === 1 && sourceDateKeys.has(plannerDateKey(selectedDate.formatted))) {
            modal.close();
            pendingPlannerRescheduleItems = [];
            return;
        }
        saveButton.disabled = true;
        saveButton.textContent = 'Salvando...';
        try {
            const { data: destinationPlans, error: fetchError } = await supabase
                .from('planner')
                .select('*')
                .is('completed_at', null);
            if (fetchError) throw fetchError;

            const destinationMarkers = getPlannerDateMarkers(destinationPlans || [], selectedDate.formatted);
            if (destinationMarkers.blocked.length) {
                alert(getPlannerBlockedDayMessage(selectedDate.formatted, destinationMarkers));
                return;
            }
            if (!confirmPlannerSpecialDestination(destinationMarkers)) return;

            const { error } = await supabase
                .from('planner')
                .update({ date: selectedDate.formatted, day: selectedDate.weekday })
                .in('id', ids)
                .is('completed_at', null);

            if (error) throw error;
            modal.close();
            pendingPlannerRescheduleItems = [];
            await loadPlanners();
        } catch (error) {
            alert('Não foi possível remarcar a seção: ' + (error.message || error));
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Aplicar nova data';
        }
    });
    modal.addEventListener('close', () => {
        pendingPlannerRescheduleItems = [];
        dateInput.value = '';
        dateInput.setCustomValidity('');
    });
}

function openPlannerSectionReschedule(items) {
    const modal = document.getElementById('planner-reschedule-modal');
    const dateInput = document.getElementById('planner-reschedule-date');
    const currentLabel = document.getElementById('planner-reschedule-current');
    const countLabel = document.getElementById('planner-reschedule-count');
    if (!modal || !dateInput || !items || !items.length) return;

    const first = items[0];
    const currentDate = parsePlannerDateBR(first.date);
    // A pesquisa pode esconder cartões, mas remarcar deve atingir todas as aulas ativas da data.
    const completeSectionItems = currentDate
        ? allActivePlannerItems.filter(item => {
            const itemDate = parsePlannerDateBR(item.date);
            return itemDate && itemDate.formatted === currentDate.formatted;
        })
        : items;
    pendingPlannerRescheduleItems = completeSectionItems.length ? [...completeSectionItems] : [...items];
    dateInput.value = currentDate ? currentDate.iso : '';
    if (currentLabel) {
        currentLabel.textContent = currentDate
            ? `Data atual: ${currentDate.formatted} (${currentDate.weekday})`
            : 'Data atual não identificada';
    }
    if (countLabel) {
        countLabel.textContent = `${pendingPlannerRescheduleItems.length} aula(s) serão atualizadas. Horários, turmas e atividades serão mantidos.`;
    }
    if (!modal.open) modal.showModal();
}

function renderPlannerList() {
    const container = document.getElementById('planner-list');
    if (!container) return;
    const searchInput = document.getElementById('planner-search');
    const query = normalizePlannerSearchValue(searchInput ? searchInput.value : '');
    const filteredData = allActivePlannerItems.filter(item => {
        if (!query) return true;
        const labels = { 1: 'especial', 2: 'folga', 3: 'prova', 4: 'adaptado' };
        const text = [item.day, item.date, item.time, item.duration, item.serie, item.team, item.activities, item.skills, item.tag, getPlannerTitle(item), labels[item.special] || ''].join(' ');
        return normalizePlannerSearchValue(text).includes(query);
    });
    const resultCount = document.getElementById('planner-results-count');
    if (resultCount) {
        resultCount.textContent = query
            ? 'Exibindo ' + filteredData.length + ' de ' + allActivePlannerItems.length + ' planejamentos ativos.'
            : allActivePlannerItems.length + (allActivePlannerItems.length === 1 ? ' planejamento ativo.' : ' planejamentos ativos.');
    }
    if (!filteredData.length) {
        container.innerHTML = allActivePlannerItems.length ? '<div class="empty-state">Nenhum planejamento corresponde à pesquisa.</div>' : '<div class="empty-state">Nenhuma aula planejada.</div>';
        updatePlannerBulkToolbar();
        return;
    }
    const timestamp = (dateStr, timeStr) => {
        const dateInfo = parsePlannerDateBR(dateStr);
        if (!dateInfo) return 0;
        const timeMatch = String(timeStr || '00:00').match(/^(\d{1,2}):(\d{2})$/);
        const minutes = timeMatch ? Number(timeMatch[1]) * 60 + Number(timeMatch[2]) : 0;
        return (dateInfo.year * 10000 + dateInfo.month * 100 + dateInfo.day) * 1440 + minutes;
    };
    const sorted = [...filteredData].sort((a, b) => timestamp(a.date, a.time) - timestamp(b.date, b.time));
    const groups = sorted.reduce((acc, item) => {
        const dateInfo = parsePlannerDateBR(item.date);
        // Agrupa pela data, não pelo texto antigo do dia, para evitar seções duplicadas.
        const key = dateInfo ? dateInfo.formatted : (item.day || 'Sem dia') + ' - ' + (item.date || 'Sem data');
        (acc[key] ||= []).push(item);
        return acc;
    }, {});
    const sectionEntries = Object.entries(groups);
    container.innerHTML = sectionEntries.map(([key, items], sectionIndex) => {
        const first = items[0] || {};
        const dateInfo = parsePlannerDateBR(first.date);
        const sectionDay = dateInfo ? dateInfo.weekday : (first.day || '');
        const sectionDate = dateInfo ? dateInfo.formatted : (first.date || 'Sem data');
        const title = sectionDay ? sectionDay + ' - ' + sectionDate : sectionDate;
        const collapsed = localStorage.getItem('planner_state_v2_' + title) === 'true';
        return '<section class="planner-section"><h3 class="planner-section-title"><span>' + escapePlannerHtml(title) + '</span><div class="planner-section-heading-actions">' +
            '<button type="button" class="btn-small btn-secondary planner-reschedule-button" data-reschedule-section="' + sectionIndex + '" title="Alterar a data de todas as aulas desta seção"><i class="fa-regular fa-calendar-days" aria-hidden="true"></i> Remarcar</button>' +
            '<button type="button" class="btn-small btn-primary" data-add-plan-day="' + escapePlannerHtml(sectionDay) + '" data-add-plan-date="' + escapePlannerHtml(sectionDate) + '">+ Nova aula</button>' +
            '<button type="button" class="minimize-btn planner-section-toggle" data-toggle-planner-section data-section-title="' + escapePlannerHtml(title) + '" aria-label="' + (collapsed ? 'Expandir dia' : 'Recolher dia') + '" aria-expanded="' + String(!collapsed) + '" title="' + (collapsed ? 'Expandir dia' : 'Recolher dia') + '"><i class="fa-solid ' + (collapsed ? 'fa-chevron-down' : 'fa-chevron-up') + '" aria-hidden="true"></i></button></div></h3>' +
            '<div class="planner-section-content ' + (collapsed ? 'hidden' : '') + '">' + items.map(item => renderPlannerCard(item, 'active')).join('') + '</div></section>';
    }).join('');

    container.querySelectorAll('[data-reschedule-section]').forEach(button => {
        const group = sectionEntries[Number(button.dataset.rescheduleSection)];
        button.addEventListener('click', () => openPlannerSectionReschedule(group ? group[1] : []));
    });
    container.querySelectorAll('[data-add-plan-day]').forEach(button => {
        button.addEventListener('click', () => window.addPlanForDay(button.dataset.addPlanDay, button.dataset.addPlanDate));
    });
    container.querySelectorAll('[data-toggle-planner-section]').forEach(button => {
        button.addEventListener('click', () => window.togglePlannerSection(button, button.dataset.sectionTitle));
    });
    setupPlannerCardInteractions(container);
    updatePlannerBulkToolbar();
}
async function fetchTeacherPlannerRows(completed) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user?.id) {
        throw new Error('Sua sessão expirou. Entre novamente para visualizar seus planejamentos.');
    }

    const pageSize = 500;
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
        let query = supabase
            .from('planner')
            .select('*')
            .eq('owner', authData.user.id);

        query = completed
            ? query.not('completed_at', 'is', null)
                .order('completed_at', { ascending: false })
                .order('id', { ascending: false })
            : query.is('completed_at', null)
                .order('id', { ascending: false });

        const { data, error } = await query.range(offset, offset + pageSize - 1);
        if (error) throw error;

        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) break;
    }
    return rows;
}

async function loadPlanners() {
    const container = document.getElementById('planner-list');
    if (!container) return;
    container.innerHTML = '<div class="empty-state">Carregando seus planejamentos...</div>';

    try {
        allActivePlannerItems = await fetchTeacherPlannerRows(false);
    } catch (error) {
        console.error('Erro ao carregar aulas planejadas do professor:', error);
        container.innerHTML = '<div class="empty-state">Não foi possível carregar seus planejamentos: ' + escapePlannerHtml(error.message) + '</div>';
        const count = document.getElementById('planner-results-count');
        if (count) count.textContent = 'Não foi possível consultar os planejamentos.';
        return;
    }

    const activeIds = new Set(allActivePlannerItems.map(item => String(item.id)));
    [...selectedPlannerIds].forEach(id => { if (!activeIds.has(id)) selectedPlannerIds.delete(id); });
    allActivePlannerItems.forEach(item => plannerItemsById.set(String(item.id), item));

    renderPlannerList();
}

async function loadCompletedPlanners() {
    const container = document.getElementById('completed-planner-container');
    if (!container) return;
    container.innerHTML = '<div class="empty-state">Carregando suas aulas passadas...</div>';

    let data;
    try {
        data = await fetchTeacherPlannerRows(true);
    } catch (error) {
        console.error('Erro ao carregar aulas concluídas do professor:', error);
        container.innerHTML = '<div class="empty-state">Não foi possível carregar suas aulas passadas: ' + escapePlannerHtml(error.message) + '</div>';
        const count = document.getElementById('completed-planner-count');
        if (count) count.textContent = 'Não foi possível consultar as aulas passadas.';
        return;
    }

    const count = document.getElementById('completed-planner-count');
    if (count) count.textContent = data.length + (data.length === 1 ? ' aula concluída' : ' aulas concluídas');

    if (!data || !data.length) {
        container.innerHTML = '<div class="empty-state">Nenhuma aula concluída até o momento.</div>';
        return;
    }

    const groups = new Map();
    data.forEach(item => {
        const serie = String(item.serie || '').trim();
        const team = String(item.team || '').trim();
        const key = serie + '::' + team;
        const label = serie && team ? 'Turma ' + serie + team :
            (serie ? 'Série ' + serie : (team ? 'Turma ' + team : 'Sem turma'));
        if (!groups.has(key)) groups.set(key, { label, items: [] });
        groups.get(key).items.push(item);
        plannerItemsById.set(String(item.id), item);
    });

    const sortedGroups = [...groups.entries()].sort((a, b) =>
        a[1].label.localeCompare(b[1].label, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );

    container.innerHTML =
        '<div class="completed-class-tabs" role="tablist" aria-label="Filtrar aulas passadas por turma">' +
            sortedGroups.map(([key, group], index) =>
                '<button type="button" class="completed-class-tab ' + (index === 0 ? 'active' : '') +
                '" role="tab" aria-selected="' + (index === 0 ? 'true' : 'false') +
                '" data-completed-tab="' + index + '">' + escapePlannerHtml(group.label) + '</button>'
            ).join('') +
        '</div><div class="completed-class-panels">' +
            sortedGroups.map(([key, group], index) =>
                '<div class="completed-class-panel ' + (index === 0 ? '' : 'hidden') +
                '" role="tabpanel" data-completed-panel="' + index + '">' +
                    '<div class="cards-container">' + group.items.map(item => renderPlannerCard(item, 'completed')).join('') + '</div>' +
                '</div>'
            ).join('') +
        '</div>';

    container.querySelectorAll('[data-completed-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            const selectedIndex = tab.dataset.completedTab;
            container.querySelectorAll('[data-completed-tab]').forEach(button => {
                const isActive = button.dataset.completedTab === selectedIndex;
                button.classList.toggle('active', isActive);
                button.setAttribute('aria-selected', String(isActive));
            });
            container.querySelectorAll('[data-completed-panel]').forEach(panel => {
                panel.classList.toggle('hidden', panel.dataset.completedPanel !== selectedIndex);
            });
        });
    });

    setupPlannerCardInteractions(container);
}


// Seleção e ações em lote dos planejamentos
function updatePlannerBulkToolbar() {
    const toggle = document.getElementById('btn-toggle-plan-selection');
    const menuButton = document.getElementById('btn-planner-bulk-menu');
    const menu = document.getElementById('planner-bulk-menu');
    const count = document.getElementById('planner-selected-count');
    if (toggle) {
        toggle.innerHTML = plannerSelectionMode ? '<i class="fa-solid fa-xmark"></i> Cancelar seleção' : '<i class="fa-regular fa-square-check"></i> Selecionar';
        toggle.classList.toggle('selection-active', plannerSelectionMode);
    }
    if (menuButton) {
        menuButton.classList.toggle('hidden', !plannerSelectionMode);
        menuButton.disabled = selectedPlannerIds.size === 0;
        menuButton.setAttribute('aria-expanded', String(!!menu && !menu.classList.contains('hidden')));
    }
    if (count) count.textContent = String(selectedPlannerIds.size);
    const mergeAction = menu && menu.querySelector('[data-bulk-action="merge"]');
    if (mergeAction) mergeAction.disabled = selectedPlannerIds.size < 2;
}
function clearPlannerSelection(exitMode = true) {
    selectedPlannerIds.clear();
    if (exitMode) plannerSelectionMode = false;
    const menu = document.getElementById('planner-bulk-menu');
    const button = document.getElementById('btn-planner-bulk-menu');
    if (menu) menu.classList.add('hidden');
    if (button) button.setAttribute('aria-expanded', 'false');
}
function setupPlannerBulkActions() {
    const toggle = document.getElementById('btn-toggle-plan-selection');
    const menuButton = document.getElementById('btn-planner-bulk-menu');
    const menu = document.getElementById('planner-bulk-menu');
    const modal = document.getElementById('planner-bulk-merge-modal');
    const close = () => { if (modal && modal.open) modal.close(); };
    if (toggle) toggle.addEventListener('click', () => {
        plannerSelectionMode = !plannerSelectionMode;
        if (!plannerSelectionMode) clearPlannerSelection(false);
        renderPlannerList();
    });
    if (menuButton && menu) menuButton.addEventListener('click', event => {
        event.stopPropagation();
        if (menuButton.disabled) return;
        const open = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !open);
        menuButton.setAttribute('aria-expanded', String(open));
    });
    if (menu) menu.addEventListener('click', event => {
        const action = event.target.closest('[data-bulk-action]');
        if (!action || action.disabled) return;
        menu.classList.add('hidden');
        if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
        runPlannerBulkAction(action.dataset.bulkAction);
    });
    document.addEventListener('click', event => {
        if (menu && !event.target.closest('.planner-bulk-menu-wrap')) {
            menu.classList.add('hidden');
            if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
        }
    });
    const closeButton = document.getElementById('btn-close-planner-bulk-merge');
    const cancelButton = document.getElementById('btn-cancel-planner-bulk-merge');
    const confirmButton = document.getElementById('btn-confirm-planner-bulk-merge');
    if (closeButton) closeButton.addEventListener('click', close);
    if (cancelButton) cancelButton.addEventListener('click', close);
    if (confirmButton) confirmButton.addEventListener('click', executePlannerBulkMerge);
}
function openPlannerBulkMergeDialog() {
    const items = allActivePlannerItems.filter(item => selectedPlannerIds.has(String(item.id)));
    if (items.length < 2) { alert('Selecione pelo menos duas aulas para mesclar.'); return; }
    const select = document.getElementById('planner-bulk-merge-target');
    const summary = document.getElementById('planner-bulk-merge-summary');
    const modal = document.getElementById('planner-bulk-merge-modal');
    select.innerHTML = items.map(item => {
        const label = getPlannerTitle(item) + ' — ' + (item.date || 'Sem data') + ' · ' + (item.time || 'Sem horário') + ' · ' + (formatPlannerGrade(item) || 'Sem turma');
        return '<option value="' + escapePlannerHtml(item.id) + '">' + escapePlannerHtml(label) + '</option>';
    }).join('');
    summary.textContent = (items.length - 1) + ' aula(s) de origem serão adicionadas ao destino escolhido e removidas da lista ativa.';
    if (!modal.open) modal.showModal();
}
async function executePlannerBulkMerge() {
    const ids = [...selectedPlannerIds];
    const targetId = String(document.getElementById('planner-bulk-merge-target').value || '');
    const button = document.getElementById('btn-confirm-planner-bulk-merge');
    const modal = document.getElementById('planner-bulk-merge-modal');
    if (ids.length < 2 || !ids.includes(targetId)) return;
    if (!confirm('Mesclar ' + (ids.length - 1) + ' aula(s) na aula de destino escolhida? As aulas de origem serão removidas após a cópia das atividades.')) return;
    button.disabled = true;
    button.textContent = 'Mesclando...';
    try {
        const { data, error } = await supabase.from('planner').select('*').in('id', ids).is('completed_at', null);
        if (error) throw error;
        const items = data || [];
        if (items.length !== ids.length) throw new Error('Uma ou mais aulas selecionadas não estão mais disponíveis.');
        const target = items.find(item => String(item.id) === targetId);
        const sources = items.filter(item => String(item.id) !== targetId);
        const emptySource = sources.find(item => !String(item.activities || '').trim());
        if (emptySource) throw new Error('A aula "' + getPlannerTitle(emptySource) + '" não possui atividades. Ela não será removida para evitar perda de dados.');
        const merged = [String(target.activities || '').trim()].concat(sources.map(item => String(item.activities).trim())).filter(Boolean).join('\n\n---\n\n');
        let update = supabase.from('planner').update({ activities: merged }).eq('id', targetId).is('completed_at', null);
        update = target.activities == null ? update.is('activities', null) : update.eq('activities', target.activities);
        const { data: updated, error: updateError } = await update.select('id').maybeSingle();
        if (updateError) throw updateError;
        if (!updated) throw new Error('A aula de destino foi alterada durante a operação. Nenhuma aula de origem foi removida.');
        const failures = [];
        for (const source of sources) {
            const { data: deleted, error: deleteError } = await supabase.from('planner').delete()
                .eq('id', source.id).is('completed_at', null).eq('activities', source.activities).select('id').maybeSingle();
            if (deleteError || !deleted) failures.push(getPlannerTitle(source));
        }
        if (modal.open) modal.close();
        clearPlannerSelection(true);
        await loadPlanners();
        if (failures.length) alert('As atividades foram copiadas, mas estas aulas permaneceram ativas: ' + failures.join(', ') + '. Verifique possíveis duplicatas.');
        else alert('Mesclagem concluída. Os dados do destino foram preservados.');
    } catch (error) {
        console.error('Erro na mesclagem em lote:', error);
        alert('Não foi possível mesclar as aulas: ' + (error.message || 'erro inesperado'));
    } finally {
        button.disabled = false;
        button.textContent = 'Mesclar aulas';
    }
}
function parsePlannerDateTime(dateStr, timeStr) {
    const parts = String(dateStr || '').split(/[/-]/);
    if (parts.length !== 3) return NaN;
    const [year,month,day] = parts[0].length === 4 ? parts : [parts[2],parts[1],parts[0]];
    const time = /^\d{2}:\d{2}$/.test(String(timeStr || '')) ? timeStr : '00:00';
    const [hours,minutes] = time.split(':').map(Number);
    const date = new Date(Number(year),Number(month)-1,Number(day),hours,minutes);
    return Number.isNaN(date.getTime()) ? NaN : date.getTime();
}
function plannerDateKey(value) {
    const parts = String(value || '').split(/[/-]/);
    if (parts.length !== 3) return 0;
    const [year,month,day] = parts[0].length === 4 ? parts : [parts[2],parts[1],parts[0]];
    return Number(year)*10000 + Number(month)*100 + Number(day);
}

function getPlannerDateMarkers(plans, dateValue) {
    const dateKey = plannerDateKey(dateValue);
    if (!dateKey) return { blocked: [], special: null };

    const sameDay = (plans || []).filter(item => plannerDateKey(item.date) === dateKey);
    const blocked = sameDay.filter(item => Number(item.special) === 2 || Number(item.special) === 3);
    const special = sameDay.find(item => Number(item.special) === 1) || null;
    return { blocked, special };
}

function getPlannerBlockedDayMessage(dateValue, markers) {
    const types = [...new Set((markers.blocked || []).map(item =>
        Number(item.special) === 2 ? 'Folga' : 'Prova'
    ))];
    return 'O dia ' + dateValue + ' está marcado como ' + types.join(' e ') +
        ' e não pode receber planejamentos adiados, adiantados ou remarcados.';
}

function confirmPlannerSpecialDestination(markers) {
    if (!markers || !markers.special) return true;
    const title = getPlannerTitle(markers.special) || 'Sem título';
    return confirm('Este dia possui um plano marcado como especial com o título "' +
        title + '", realmente deseja mover para lá?');
}
async function executePlannerBulkShift(action) {
    const ids = [...selectedPlannerIds];
    if (!ids.length) return;
    const label = action === 'defer' ? 'adiar' : 'adiantar';
    if (!confirm('Deseja ' + label + ' ' + ids.length + ' aula(s)? Cada uma ocupará um horário compatível e ainda livre da mesma turma.')) return;

    const { data, error } = await supabase.from('planner').select('*').is('completed_at', null);
    if (error) { alert('Não foi possível carregar os planejamentos: ' + error.message); return; }

    const plans = data || [];
    const selectedSet = new Set(ids);
    const selected = plans.filter(item => selectedSet.has(String(item.id)))
        .sort((a, b) => parsePlannerDateTime(a.date, a.time) - parsePlannerDateTime(b.date, b.time));
    const remaining = plans.filter(item => !selectedSet.has(String(item.id)));
    const used = new Set();
    const currentDate = new Date();
    const todayKey = currentDate.getFullYear() * 10000 + (currentDate.getMonth() + 1) * 100 + currentDate.getDate();
    const now = Date.now();
    const plannedMoves = [];
    const skipped = [];
    const blockedDestinations = new Map();
    const specialDestinations = new Map();

    for (const source of selected) {
        const sourceTime = parsePlannerDateTime(source.date, source.time);
        const sourceKey = plannerDateKey(source.date);
        if (!Number.isFinite(sourceTime) || !source.serie || !source.team) {
            skipped.push(getPlannerTitle(source));
            continue;
        }

        const sameClass = item =>
            normalizePlannerClassValue(item.serie) === normalizePlannerClassValue(source.serie) &&
            normalizePlannerClassValue(item.team) === normalizePlannerClassValue(source.team);

        const possible = remaining
            .filter(item => sameClass(item) && !used.has(String(item.id)))
            .map(item => ({ item, time: parsePlannerDateTime(item.date, item.time), key: plannerDateKey(item.date) }))
            .filter(entry => Number.isFinite(entry.time) && (action === 'defer'
                ? entry.key > todayKey && entry.key > sourceKey && entry.time > sourceTime
                : entry.key >= todayKey && entry.key !== sourceKey && entry.time >= now && entry.time < sourceTime))
            .sort((a, b) => a.time - b.time);

        let chosen = null;
        for (const candidate of possible) {
            const markers = getPlannerDateMarkers(plans, candidate.item.date);
            if (markers.blocked.length) {
                blockedDestinations.set(candidate.key, {
                    date: candidate.item.date,
                    markers
                });
                continue;
            }
            chosen = { ...candidate, markers };
            break;
        }

        if (!chosen) {
            skipped.push(getPlannerTitle(source));
            continue;
        }

        const target = chosen.item;
        const tag = (action === 'defer' ? 'Adiada do dia ' : 'Adiantada do dia ') + getPlannerOriginalDate(source);
        plannedMoves.push({ source, target, tag });
        used.add(String(target.id));

        if (chosen.markers.special) {
            specialDestinations.set(chosen.key, {
                date: target.date,
                title: getPlannerTitle(chosen.markers.special) || 'Sem título'
            });
        }
    }

    if (specialDestinations.size) {
        const warnings = [...specialDestinations.values()].map(item =>
            'Este dia possui um plano marcado como especial com o título "' + item.title +
            '", realmente deseja mover para lá?\nData: ' + item.date
        );
        if (!confirm(warnings.join('\n\n'))) return;
    }

    let moved = 0;
    for (const move of plannedMoves) {
        const { error: updateError } = await supabase.from('planner')
            .update({
                date: move.target.date,
                day: move.target.day,
                time: move.target.time,
                tag: move.tag
            })
            .eq('id', move.source.id)
            .is('completed_at', null);
        if (updateError) skipped.push(getPlannerTitle(move.source));
        else moved++;
    }

    clearPlannerSelection(true);
    await loadPlanners();
    const blockedSummary = blockedDestinations.size
        ? ' Dias ignorados por Folga/Prova: ' + [...blockedDestinations.values()].map(item => item.date).join(', ') + '.'
        : '';
    alert(moved + ' aula(s) movimentada(s).' +
        (skipped.length ? ' Não foi possível: ' + skipped.join(', ') + '.' : '') +
        blockedSummary);
}
async function runPlannerBulkAction(action) {
    const ids = [...selectedPlannerIds];
    if (!ids.length) return;
    if (action === 'merge') { openPlannerBulkMergeDialog(); return; }
    if (action === 'delete') {
        if (!confirm('Excluir definitivamente ' + ids.length + ' planejamento(s) selecionado(s)? Esta ação não pode ser desfeita.')) return;
        const { data, error } = await supabase.from('planner').delete().in('id',ids).is('completed_at',null).select('id');
        if (error) { alert('Erro ao excluir: ' + error.message); return; }
        (data || []).forEach(item => plannerItemsById.delete(String(item.id)));
        clearPlannerSelection(true);
        await loadPlanners();
        alert((data || []).length + ' planejamento(s) excluído(s).');
        return;
    }
    if (action === 'defer' || action === 'advance') await executePlannerBulkShift(action);
}

// Recupera a data de origem da aula. Se ela já foi movida, mantém a data registrada na tag.
function getPlannerOriginalDate(item) {
    const match = String(item.tag || '').match(/(?:Adiada|Adiantada) do dia (\d{2}\/\d{2}\/\d{4})/);
    if (match) return match[1];

    const value = String(item.date || '');
    const parts = value.split(/[/-]/);
    if (parts.length !== 3) return value;
    if (parts[0].length === 4) return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
}

// Adia uma aula para a próxima aula futura da mesma série e turma.
window.deferPlanner = async (id) => {
    try {
        const { data, error } = await supabase.from('planner').select('*').is('completed_at', null);
        if (error) throw error;

        const plans = data || [];
        const selected = plans.find(item => String(item.id) === String(id));
        if (!selected) {
            alert('Não foi possível encontrar esta aula.');
            return;
        }

        const parseDateTime = (dateStr, timeStr) => {
            if (!dateStr) return NaN;
            const parts = String(dateStr).split(/[/-]/);
            if (parts.length !== 3) return NaN;
            let year, month, day;
            if (parts[0].length === 4) [year, month, day] = parts;
            else [day, month, year] = parts;

            const time = /^\d{2}:\d{2}$/.test(String(timeStr || '')) ? timeStr : '00:00';
            const [hours, minutes] = time.split(':').map(Number);
            const date = new Date(Number(year), Number(month) - 1, Number(day), hours, minutes);
            return Number.isNaN(date.getTime()) ? NaN : date.getTime();
        };

        const getDateKey = (dateStr) => {
            if (!dateStr) return '';
            const parts = String(dateStr).split(/[/-]/);
            if (parts.length !== 3) return '';
            const [year, month, day] = parts[0].length === 4
                ? parts
                : [parts[2], parts[1], parts[0]];
            return Number(year) * 10000 + Number(month) * 100 + Number(day);
        };

        const today = new Date();
        const todayKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
        const selectedTimestamp = parseDateTime(selected.date, selected.time);
        if (!Number.isFinite(selectedTimestamp)) {
            alert('Esta aula não possui uma data válida para adiamento.');
            return;
        }

        const normalize = value => String(value ?? '').trim().toLocaleLowerCase('pt-BR');
        const sameSeriesAndTeam = item =>
            normalize(item.serie) === normalize(selected.serie) &&
            normalize(item.team) === normalize(selected.team);

        // Busca a próxima aula da mesma série e turma, excluindo esta aula.
        // O destino precisa estar em uma data estritamente posterior à data de hoje.
        const candidates = plans
            .filter(item => String(item.id) !== String(id) && sameSeriesAndTeam(item))
            .map(item => ({ item, timestamp: parseDateTime(item.date, item.time), dateKey: getDateKey(item.date) }))
            .filter(entry =>
                Number.isFinite(entry.timestamp) &&
                entry.dateKey > todayKey &&
                entry.dateKey > getDateKey(selected.date) &&
                entry.timestamp > selectedTimestamp
            )
            .sort((a, b) => a.timestamp - b.timestamp);

        const blockedDestinations = new Map();
        const next = candidates.find(entry => {
            const markers = getPlannerDateMarkers(plans, entry.item.date);
            if (markers.blocked.length) {
                blockedDestinations.set(entry.dateKey, { date: entry.item.date, markers });
                return false;
            }
            return true;
        });

        if (!next) {
            if (blockedDestinations.size) {
                const dates = [...blockedDestinations.values()].map(item => item.date).join(', ');
                alert('As próximas datas encontradas (' + dates + ') estão marcadas como Folga ou Prova e não podem receber planejamentos. Não foi encontrado outro destino disponível.');
            } else {
                alert('Não encontrei uma próxima aula futura para esta mesma série e turma. O adiamento só pode ser feito para uma data posterior a hoje.');
            }
            return;
        }

        const target = next.item;
        if (!confirmPlannerSpecialDestination(getPlannerDateMarkers(plans, target.date))) return;
        const confirmation = confirm(
            `Adiar esta aula de ${selected.date} às ${selected.time || 'horário não definido'} para a próxima aula de ${selected.serie || ''}ª série, turma ${selected.team || ''}, em ${target.date} às ${target.time || 'horário não definido'}?\n\nAs duas aulas ficarão agendadas para o mesmo dia e horário.`
        );
        if (!confirmation) return;

        const { error: updateError } = await supabase
            .from('planner')
            .update({ date: target.date, day: target.day, time: target.time, tag: `Adiada do dia ${getPlannerOriginalDate(selected)}` })
            .eq('id', id);

        if (updateError) throw updateError;

        await loadPlanners();
        alert(`Aula adiada para ${target.day || ''} ${target.date} às ${target.time || 'horário não definido'}.`);
    } catch (error) {
        console.error('Erro ao adiar aula:', error);
        alert('Não foi possível adiar a aula: ' + (error.message || 'erro inesperado'));
    }
};

// Antecipa uma aula para a próxima aula futura da mesma série e turma, em ordem cronológica.
window.advancePlanner = async (id) => {
    try {
        const { data, error } = await supabase.from('planner').select('*').is('completed_at', null);
        if (error) throw error;

        const plans = data || [];
        const selected = plans.find(item => String(item.id) === String(id));
        if (!selected) {
            alert('Não foi possível encontrar esta aula.');
            return;
        }

        const parseDateTime = (dateStr, timeStr) => {
            if (!dateStr) return NaN;
            const parts = String(dateStr).split(/[/-]/);
            if (parts.length !== 3) return NaN;
            let year, month, day;
            if (parts[0].length === 4) [year, month, day] = parts;
            else [day, month, year] = parts;

            const time = /^\d{2}:\d{2}$/.test(String(timeStr || '')) ? timeStr : '00:00';
            const [hours, minutes] = time.split(':').map(Number);
            const date = new Date(Number(year), Number(month) - 1, Number(day), hours, minutes);
            return Number.isNaN(date.getTime()) ? NaN : date.getTime();
        };

        const getDateKey = (dateStr) => {
            if (!dateStr) return 0;
            const parts = String(dateStr).split(/[/-]/);
            if (parts.length !== 3) return 0;
            const [year, month, day] = parts[0].length === 4
                ? parts
                : [parts[2], parts[1], parts[0]];
            return Number(year) * 10000 + Number(month) * 100 + Number(day);
        };

        const now = Date.now();
        const today = new Date();
        const todayKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
        const selectedTimestamp = parseDateTime(selected.date, selected.time);
        if (!Number.isFinite(selectedTimestamp)) {
            alert('Esta aula não possui uma data válida para antecipação.');
            return;
        }

        const normalize = value => String(value ?? '').trim().toLocaleLowerCase('pt-BR');
        const sameSeriesAndTeam = item =>
            normalize(item.serie) === normalize(selected.serie) &&
            normalize(item.team) === normalize(selected.team);

        // Entre as aulas futuras da mesma turma que acontecem antes da aula selecionada,
        // escolhe a mais próxima de agora (a primeira na ordem cronológica).
        const candidates = plans
            .filter(item => String(item.id) !== String(id) && sameSeriesAndTeam(item))
            .map(item => ({ item, timestamp: parseDateTime(item.date, item.time), dateKey: getDateKey(item.date) }))
            .filter(entry =>
                Number.isFinite(entry.timestamp) &&
                entry.dateKey >= todayKey &&
                entry.dateKey !== getDateKey(selected.date) &&
                entry.timestamp >= now &&
                entry.timestamp < selectedTimestamp
            )
            .sort((a, b) => a.timestamp - b.timestamp);

        const blockedDestinations = new Map();
        const nextUpcoming = candidates.find(entry => {
            const markers = getPlannerDateMarkers(plans, entry.item.date);
            if (markers.blocked.length) {
                blockedDestinations.set(entry.dateKey, { date: entry.item.date, markers });
                return false;
            }
            return true;
        });

        if (!nextUpcoming) {
            if (blockedDestinations.size) {
                const dates = [...blockedDestinations.values()].map(item => item.date).join(', ');
                alert('As próximas datas encontradas (' + dates + ') estão marcadas como Folga ou Prova e não podem receber planejamentos. Não foi encontrado outro destino disponível.');
            } else {
                alert('Não encontrei uma próxima aula futura desta mesma série e turma antes da data selecionada. A antecipação não pode levar a aula para uma data passada nem adiantar para depois da aula original.');
            }
            return;
        }

        const target = nextUpcoming.item;
        if (!confirmPlannerSpecialDestination(getPlannerDateMarkers(plans, target.date))) return;
        const confirmation = confirm(
            'Adiantar esta aula de ' + selected.date + ' às ' + (selected.time || 'horário não definido') +
            ' para a próxima aula de ' + (selected.serie || '') + 'ª série, turma ' + (selected.team || '') +
            ', em ' + target.date + ' às ' + (target.time || 'horário não definido') +
            '?\n\nAs duas aulas ficarão agendadas para o mesmo dia e horário.'
        );
        if (!confirmation) return;

        const { error: updateError } = await supabase
            .from('planner')
            .update({ date: target.date, day: target.day, time: target.time, tag: `Adiantada do dia ${getPlannerOriginalDate(selected)}` })
            .eq('id', id);

        if (updateError) throw updateError;

        await loadPlanners();
        alert('Aula adiantada para ' + (target.day || '') + ' ' + target.date + ' às ' + (target.time || 'horário não definido') + '.');
    } catch (error) {
        console.error('Erro ao adiantar aula:', error);
        alert('Não foi possível adiantar a aula: ' + (error.message || 'erro inesperado'));
    }
};

window.viewPlanner = id => {
    const p = plannerItemsById.get(String(id));
    if (!p) return;
    selectedPlannerItem = p;

    const special = Number(p.special || 0);
    const types = { 0: 'Regular', 1: 'Especial', 2: 'Folga', 3: 'Prova', 4: 'Adaptada' };
    const typeIcons = {
        0: 'fa-graduation-cap',
        1: 'fa-star',
        2: 'fa-calendar-xmark',
        3: 'fa-file-circle-check',
        4: 'fa-puzzle-piece'
    };
    const facts = [
        { label: 'Data', value: p.date || 'Não informada', icon: 'fa-calendar-days' },
        { label: 'Hora', value: p.time || 'Não informada', icon: 'fa-clock' },
        { label: 'Dia da Semana', value: p.day || 'Não informado', icon: 'fa-calendar-days' },
        { label: 'Turma', value: formatPlannerGrade(p) || 'Não informada', icon: 'fa-users' },
        { label: 'Duração', value: p.duration || 'Não informada', icon: 'fa-hourglass-half' }
    ];

    const title = getPlannerTitle(p);
    const heading = document.getElementById('planner-detail-heading');
    if (heading) heading.textContent = title;
    const mark = document.querySelector('#planner-details-modal .edu-modal-mark i');
    if (mark) mark.className = 'fa-solid ' + (special === 4 ? 'fa-puzzle-piece' : 'fa-book-open');

    const grid = document.getElementById('planner-details-grid');
    const tag = p.tag || (special === 2 ? 'Folga' : 'Original desta data');
    grid.innerHTML =
        '<div class="planner-details-facts">' +
            facts.map(field =>
                '<div class="planner-detail-fact">' +
                    '<i class="fa-solid ' + field.icon + '" aria-hidden="true"></i>' +
                    '<div><span>' + escapePlannerHtml(field.label) + '</span><strong>' + escapePlannerHtml(field.value) + '</strong></div>' +
                '</div>'
            ).join('') +
        '</div>' +
        '<div class="planner-details-classification">' +
            '<div class="planner-detail-classification-card planner-detail-type special-type-' + special + '">' +
                '<i class="fa-solid ' + (typeIcons[special] || 'fa-graduation-cap') + '" aria-hidden="true"></i>' +
                '<div><span>Tipo</span><strong>' + escapePlannerHtml(types[special] || 'Regular') + '</strong></div>' +
            '</div>' +
            '<div class="planner-detail-classification-card planner-detail-tag-card">' +
                '<i class="fa-solid fa-tag" aria-hidden="true"></i>' +
                '<div><span>Tag</span><strong>' + escapePlannerHtml(tag) + '</strong></div>' +
            '</div>' +
        '</div>' +
        '<section class="planner-detail-section planner-detail-skills">' +
            '<h4><i class="fa-solid fa-list-ul" aria-hidden="true"></i> Habilidades (BNCC e Competências)</h4>' +
            '<div class="planner-markdown-content">' +
                (p.skills
                    ? String(p.skills).split(/[,;\n]+/).map(skill => skill.trim()).filter(Boolean).map(skill => '<span class="planner-skill-chip">' + escapePlannerHtml(skill) + '</span>').join('')
                    : '<span class="planner-skill-chip">Não informado</span>') +
            '</div>' +
        '</section>' +
        '<section class="planner-detail-section planner-detail-activities">' +
            '<h4><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Atividades</h4>' +
            '<div class="planner-markdown-content">' + (p.activities ? renderPlannerMarkdown(p.activities) : '<p>Não informado</p>') + '</div>' +
        '</section>';

    document.getElementById('planner-details-modal').showModal();
};

window.editPlanner = (p) => {
    const detailsModal = document.getElementById('planner-details-modal');
    if (detailsModal && detailsModal.open) detailsModal.close();
    document.getElementById('plan-id').value = p.id;
    
    setPlannerDateFields(p.date || '', p.day || '');
    setSelectValueWithCustom('plan-time', p.time || '');
    setPlannerGradeSelect(p.serie, p.team);

    document.getElementById('plan-skills').value = p.skills || '';
    document.getElementById('plan-activities').value = p.activities || '';
    document.getElementById('plan-activities').setCustomValidity('');
    if (window.updatePlannerActivitiesPreview) window.updatePlannerActivitiesPreview();
    document.getElementById('plan-duration').value = p.duration || '';
    
    document.getElementById('cb-adaptado').checked = p.special == 4;
    document.getElementById('cb-especial').checked = p.special == 1;
    document.getElementById('cb-folga').checked = p.special == 2;
    document.getElementById('cb-prova').checked = p.special == 3;
    document.getElementById('plan-end-date').value = '';
    document.getElementById('plan-end-date-picker').value = '';
    
    window.updateRequiredFields();

    document.getElementById('planner-modal-title').textContent = 'Editar Aula';
    document.getElementById('planner-modal').showModal();
};
                            
window.completePlanner = async id => {
    const confirmation = confirm('Marcar esta aula como concluída? Ela será movida para a guia Aulas passadas.');
    if (!confirmation) return;

    const { error } = await supabase
        .from('planner')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', id)
        .is('completed_at', null);

    if (error) {
        alert('Erro ao concluir a aula: ' + error.message);
        return;
    }

    await Promise.all([loadPlanners(), loadCompletedPlanners()]);
};

window.deleteCompletedPlanner = async id => {
    if (!confirm('Excluir definitivamente esta aula do histórico? Esta ação não pode ser desfeita.')) return;

    const { error } = await supabase
        .from('planner')
        .delete()
        .eq('id', id)
        .not('completed_at', 'is', null);

    if (error) {
        alert('Erro ao excluir a aula: ' + error.message);
        return;
    }

    plannerItemsById.delete(String(id));
    await loadCompletedPlanners();
};

window.deletePlanner = async id => {
    const item = plannerItemsById.get(String(id));
    const classLabel = item
        ? [item.serie ? item.serie + 'ª série' : '', item.team ? 'turma ' + item.team : ''].filter(Boolean).join(' ')
        : 'este planejamento';
    const dateLabel = item ? ' de ' + (item.date || 'data não informada') : '';

    if (!confirm('Excluir definitivamente o planejamento' + dateLabel + (classLabel ? ' (' + classLabel + ')' : '') + '?\n\nEle não será movido para Aulas passadas. Esta ação não pode ser desfeita.')) return;

    const { error } = await supabase
        .from('planner')
        .delete()
        .eq('id', id)
        .is('completed_at', null);

    if (error) {
        alert('Erro ao excluir o planejamento: ' + error.message);
        return;
    }

    plannerItemsById.delete(String(id));
    await loadPlanners();
};


function escapePlannerHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function renderPlannerInlineMarkdown(value) {
    let html = escapePlannerHtml(value);
    const mark = String.fromCharCode(96);

    // Tag sintática customizada: <tag>. Tags vazias ou incompletas continuam
    // aparecendo como texto literal até o usuário escrever seu conteúdo.
    html = html.replace(/&lt;([A-Za-z][A-Za-z0-9_-]{0,30})&gt;/g,
        '<span class="activity-inline-tag">$1</span>');

    html = html.replace(new RegExp(mark + '([^' + mark + ']+)' + mark, 'g'), '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    return html;
}

function plannerHasPrimaryHeading(value) {
    const firstContentLine = String(value == null ? '' : value)
        .replace(/\r/g, '')
        .split('\n')
        .find(line => line.trim()) || '';
    return /^#(?!#)[ \t]+\S.*$/.test(firstContentLine);
}

function renderPlannerMarkdown(value) {
    const lines = String(value == null ? '' : value).replace(/\r/g, '').split('\n');
    const output = [];
    let index = 0;

    // Cada ramo consome ao menos uma linha. Sintaxe incompleta permanece
    // literal até haver conteúdo suficiente para formar Markdown válido.
    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
            index++;
            continue;
        }

        const heading = line.match(/^(#{1,6})[ \t]+(.*)$/);
        if (heading && heading[2].trim()) {
            const level = heading[1].length;
            output.push('<h' + level + '>' + renderPlannerInlineMarkdown(heading[2]) + '</h' + level + '>');
            index++;
            continue;
        }

        if (/^\s*(?:-{3,}|_{3,}|\*{3})\s*$/.test(line)) {
            output.push('<hr>');
            index++;
            continue;
        }

        if (/^\s*[-*+]\s+/.test(line)) {
            const items = [];
            while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
                items.push('<li>' + renderPlannerInlineMarkdown(lines[index].replace(/^\s*[-*+]\s+/, '')) + '</li>');
                index++;
            }
            output.push('<ul>' + items.join('') + '</ul>');
            continue;
        }

        if (/^\s*\d+[.)]\s+/.test(line)) {
            const items = [];
            while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
                items.push('<li>' + renderPlannerInlineMarkdown(lines[index].replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
                index++;
            }
            output.push('<ol>' + items.join('') + '</ol>');
            continue;
        }

        if (/^\s*>\s?/.test(line)) {
            const quote = [];
            while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
                const quoteText = lines[index].replace(/^\s*>\s?/, '');
                quote.push(renderPlannerInlineMarkdown(quoteText));
                index++;
            }
            output.push('<blockquote>' + quote.join('<br>') + '</blockquote>');
            continue;
        }

        const paragraph = [];
        while (index < lines.length && lines[index].trim()) {
            const currentLine = lines[index];
            const headingLine = currentLine.match(/^(#{1,6})[ \t]+(.*)$/);
            const beginsBlock = (headingLine && headingLine[2].trim())
                || /^\s*[-*+]\s+/.test(currentLine)
                || /^\s*\d+[.)]\s+/.test(currentLine)
                || /^\s*>\s?/.test(currentLine)
                || /^\s*([-*_])\1\1+\s*$/.test(currentLine);
            if (beginsBlock) break;
            paragraph.push(renderPlannerInlineMarkdown(currentLine));
            index++;
        }

        // Plain text and incomplete markers remain visible and safe.
        if (paragraph.length) {
            output.push('<p>' + paragraph.join('<br>') + '</p>');
        } else {
            output.push('<p>' + renderPlannerInlineMarkdown(line) + '</p>');
            index++;
        }
    }

    return output.join('');
}

function setupActivitiesEditor() {
    const editor = document.getElementById('plan-activities');
    const preview = document.getElementById('plan-activities-preview');
    const toolbar = document.getElementById('activities-toolbar');
    const headingLevel = document.getElementById('activities-heading-level');
    if (!editor || !preview || !toolbar) return;

    const updatePreview = () => {
        preview.innerHTML = editor.value.length
            ? renderPlannerMarkdown(editor.value)
            : '<span class="preview-placeholder">A pré-visualização aparecerá aqui.</span>';
    };
    window.updatePlannerActivitiesPreview = updatePreview;

    const updateTitleValidity = () => {
        if (plannerHasPrimaryHeading(editor.value) || (!editor.required && !editor.value.trim())) {
            editor.setCustomValidity('');
        }
    };

    toolbar.addEventListener('click', event => {
        const button = event.target.closest('[data-format]');
        if (!button) return;

        const format = button.dataset.format;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selected = editor.value.slice(start, end);

        if (format === 'heading' || format === 'bullet' || format === 'number' || format === 'quote') {
            const lineStart = editor.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
            const lineEnd = editor.value.indexOf('\n', end);
            const actualEnd = lineEnd === -1 ? editor.value.length : lineEnd;
            const block = editor.value.slice(lineStart, actualEnd);

            let prefix;
            if (format === 'heading') {
                const level = Math.min(6, Math.max(1, Number(headingLevel && headingLevel.value) || 1));
                prefix = '#'.repeat(level) + ' ';
            } else {
                prefix = format === 'bullet' ? '- ' : format === 'number' ? '1. ' : '> ';
            }

            const replacement = block.split('\n')
                .map(line => prefix + line.replace(/^(#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|>[ \t]?)/, ''))
                .join('\n');
            editor.value = editor.value.slice(0, lineStart) + replacement + editor.value.slice(actualEnd);
            editor.focus();

            const contentStart = lineStart + prefix.length;
            if (!block.trim()) {
                // Só insere a sintaxe; o usuário escreve o texto depois.
                editor.setSelectionRange(contentStart, contentStart);
            } else {
                editor.setSelectionRange(contentStart, lineStart + replacement.length);
            }
        } else {
            let before = '';
            let after = '';
            if (format === 'bold') { before = '**'; after = '**'; }
            else if (format === 'italic') { before = '*'; after = '*'; }
            else if (format === 'tag') { before = '<'; after = '>'; }
            else if (format === 'divider') {
                before = editor.value.slice(0, start) && !editor.value.slice(0, start).endsWith('\n') ? '\n---\n' : '---\n';
                after = '';
            }

            editor.value = editor.value.slice(0, start) + before + selected + after + editor.value.slice(end);
            editor.focus();

            if (selected) {
                editor.setSelectionRange(start + before.length, start + before.length + selected.length);
            } else {
                // Sem seleção, deixa o cursor entre os marcadores vazios.
                const cursor = start + before.length;
                editor.setSelectionRange(cursor, cursor);
            }
        }

        updateTitleValidity();
        updatePreview();
    });

    editor.addEventListener('input', () => {
        updateTitleValidity();
        updatePreview();
    });
    updatePreview();
}
