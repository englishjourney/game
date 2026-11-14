import { supabase } from '../supabaseClient.js';

const plannerItemsById = new Map();
let allActivePlannerItems = [];
let selectedPlannerItem = null;
let mergeSourceItem = null;
let mergeTargetItem = null;
let mergeIsSaving = false;
const selectedPlannerIds = new Set();
let plannerSelectionMode = false;

export function initPlanner() {
    setupCustomOptions();
    setupDatePickers();
    setupLastTeamToggle();
    loadPlanners();
    loadCompletedPlanners();
    updatePlannerBulkToolbar();
    setupPlannerMerge();
    setupPlannerBulkActions();
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

            const parseDateBR = (dStr) => {
                const p = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
                return p[2].length === 4 ? new Date(`${p[2]}-${p[1]}-${p[0]}T12:00:00`) : new Date(`${p[0]}-${p[1]}-${p[2]}T12:00:00`);
            };
            const formatDateBR = (d) => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
            const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

            let start = parseDateBR(startDateStr);
            let end = parseDateBR(endDateStr);
            let inserts = [];

            let current = new Date(start);
            current.setDate(current.getDate() + 1);

            while (current <= end) {
                inserts.push({
                    day: diasSemana[current.getDay()],
                    date: formatDateBR(new Date(current)),
                    special: 3
                });
                current.setDate(current.getDate() + 1);
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
        const activityTitleLine = activitiesValue.split(/\r?\n/, 1)[0] || '';
        const activitiesRequired = document.getElementById('plan-activities').required;
        if (activitiesValue.trim() && !/^#\s+\S.*$/.test(activityTitleLine)) {
            const activitiesEditor = document.getElementById('plan-activities');
            activitiesEditor.setCustomValidity('A primeira linha precisa ser um título no formato # Título da aula.');
            activitiesEditor.reportValidity();
            activitiesEditor.focus();
            return;
        }
        document.getElementById('plan-activities').setCustomValidity('');
        const gradeParts = splitPlannerGrade(document.getElementById('plan-grade').value);
        const planData = {
            day: document.getElementById('plan-day').value,
            date: document.getElementById('plan-date').value,
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

    // Pesquisa no Planner: filtra diretamente os cartões exibidos.
    const searchInput = document.getElementById('planner-search');
    if (searchInput) {
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
    if (window.updatePlannerActivitiesPreview) window.updatePlannerActivitiesPreview();
    const gradeSelect = document.getElementById('plan-grade');
    if (gradeSelect) {
        [...gradeSelect.options].filter(option => option.dataset.legacyGrade === 'true').forEach(option => option.remove());
        gradeSelect.value = '';
    }
    document.getElementById('plan-time').value = '';
    document.getElementById('plan-day').value = '';
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

// --- LÓGICA DO MÁSCARA E SELEÇÃO DE DATA POR CALENDÁRIO ---
function setupDatePickers() {
    setupDateInputAndPicker('plan-date', 'plan-date-picker');
    setupDateInputAndPicker('plan-end-date', 'plan-end-date-picker');
}

function setupDateInputAndPicker(inputId, pickerId) {
    const textInput = document.getElementById(inputId);
    const datePicker = document.getElementById(pickerId);

    if (textInput) {
        textInput.addEventListener('input', () => {
            let v = textInput.value.replace(/\D/g, '');
            if (v.length > 8) v = v.slice(0, 8);
            if (v.length >= 5) {
                textInput.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
            } else if (v.length >= 3) {
                textInput.value = `${v.slice(0, 2)}/${v.slice(2)}`;
            } else {
                textInput.value = v;
            }
        });
    }

    if (datePicker && textInput) {
        datePicker.addEventListener('change', () => {
            if (datePicker.value) {
                const parts = datePicker.value.split('-'); // YYYY-MM-DD
                if (parts.length === 3) {
                    textInput.value = `${parts[2]}/${parts[1]}/${parts[0]}`;
                }
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
    document.getElementById('plan-day').value = day || '';
    document.getElementById('plan-date').value = date || '';

    // Aplica "Última turma" se o switcher estiver ligado
    applyLastTeamIfEnabled();

    window.updateRequiredFields();
    document.getElementById('planner-modal-title').textContent = `Adicionar Aula - ${day} (${date})`;
    document.getElementById('planner-modal').showModal();
};

// Minimizar/Maximizar salvando no cache
window.togglePlannerSection = (btn, title) => {
    // CORREÇÃO: O closest acha o elemento pai h3 inteiro, 
    // e o nextElementSibling pega a caixa de conteúdo logo abaixo dele.
    const contentDiv = btn.closest('.planner-section-title').nextElementSibling;
    const isHidden = contentDiv.classList.toggle('hidden');
    btn.textContent = isHidden ? 'Maximizar' : 'Minimizar';
    localStorage.setItem(`planner_state_${title}`, isHidden);
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
        ? '<div class="planner-card-menu"><button type="button" class="planner-options-trigger" aria-label="Opções da aula" aria-expanded="false"><i class="fa-solid fa-ellipsis-vertical"></i></button><div class="planner-actions-menu hidden"><button type="button" data-planner-action="delete-completed"><i class="fa-solid fa-trash"></i> Excluir do histórico</button></div></div>'
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
            '<h3 class="planner-card-title">' + escapePlannerHtml(getPlannerTitle(p)) + '</h3></div>' + actions + '</div>' +
            '<div class="planner-card-datetime"><span><i class="fa-regular fa-calendar"></i> ' + escapePlannerHtml((p.day ? p.day + ' · ' : '') + (p.date || 'Sem data')) + '</span>' +
            (p.time ? '<strong><i class="fa-regular fa-clock"></i> ' + escapePlannerHtml(p.time) + '</strong>' : '') + '</div>' +
            '<div class="planner-card-meta">' +
            (grade ? '<span><i class="fa-solid fa-users"></i> ' + escapePlannerHtml(grade) + '</span>' : '') +
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
    if (!filteredData.length) {
        container.innerHTML = allActivePlannerItems.length ? '<div class="empty-state">Nenhum planejamento corresponde à pesquisa.</div>' : '<div class="empty-state">Nenhuma aula planejada.</div>';
        updatePlannerBulkToolbar();
        return;
    }
    const timestamp = (dateStr,timeStr) => {
        const parts = String(dateStr || '').split(/[/-]/);
        if (parts.length !== 3) return 0;
        const [year,month,day] = parts[0].length === 4 ? parts : [parts[2],parts[1],parts[0]];
        return new Date(year + '/' + month + '/' + day + ' ' + (timeStr || '00:00')).getTime();
    };
    const sorted = [...filteredData].sort((a,b) => timestamp(a.date,a.time) - timestamp(b.date,b.time));
    const groups = sorted.reduce((acc,item) => {
        const key = item.day ? item.day + ' - ' + item.date : item.date;
        (acc[key] ||= []).push(item);
        return acc;
    }, {});
    container.innerHTML = Object.entries(groups).map(([title,items]) => {
        const collapsed = localStorage.getItem('planner_state_' + title) === 'true';
        const first = items[0] || {};
        return '<section class="planner-section"><h3 class="planner-section-title"><span>' + escapePlannerHtml(title) + '</span><div class="planner-section-heading-actions">' +
            '<button class="btn-small btn-primary" onclick="window.addPlanForDay(\'' + escapePlannerHtml(first.day || '') + '\', \'' + escapePlannerHtml(first.date || '') + '\')">+ Nova aula</button>' +
            '<button class="minimize-btn" onclick="window.togglePlannerSection(this, \'' + escapePlannerHtml(title) + '\')">' + (collapsed ? 'Maximizar' : 'Minimizar') + '</button></div></h3>' +
            '<div class="planner-section-content ' + (collapsed ? 'hidden' : '') + '">' + items.map(item => renderPlannerCard(item,'active')).join('') + '</div></section>';
    }).join('');
    setupPlannerCardInteractions(container);
    updatePlannerBulkToolbar();
}
async function loadPlanners() {
    const container = document.getElementById('planner-list');
    if (!container) return;
    container.innerHTML = 'Carregando...';

    const { data, error } = await supabase
        .from('planner')
        .select('*')
        .is('completed_at', null)
        .order('id', { ascending: false });

    if (error) {
        console.error('Erro ao carregar aulas planejadas:', error);
        container.innerHTML = 'Erro ao carregar planos.';
        return;
    }

    allActivePlannerItems = data || [];
    const activeIds = new Set(allActivePlannerItems.map(item => String(item.id)));
    [...selectedPlannerIds].forEach(id => { if (!activeIds.has(id)) selectedPlannerIds.delete(id); });
    allActivePlannerItems.forEach(item => plannerItemsById.set(String(item.id), item));

    // A pesquisa atual é preservada após salvar, excluir, concluir ou mover uma aula.
    renderPlannerList();
}

async function loadCompletedPlanners() {
    const container = document.getElementById('completed-planner-container');
    if (!container) return;
    container.innerHTML = '<div class="empty-state">Carregando aulas passadas...</div>';

    const { data, error } = await supabase
        .from('planner')
        .select('*')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false });

    if (error) {
        console.error('Erro ao carregar aulas concluídas:', error);
        container.innerHTML = '<div class="empty-state">Erro ao carregar aulas passadas.</div>';
        return;
    }
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
async function executePlannerBulkShift(action) {
    const ids = [...selectedPlannerIds];
    if (!ids.length) return;
    const label = action === 'defer' ? 'adiar' : 'adiantar';
    if (!confirm('Deseja ' + label + ' ' + ids.length + ' aula(s)? Cada uma ocupará um horário compatível e ainda livre da mesma turma.')) return;
    const { data, error } = await supabase.from('planner').select('*').is('completed_at', null);
    if (error) { alert('Não foi possível carregar os planejamentos: ' + error.message); return; }
    const plans = data || [];
    const selectedSet = new Set(ids);
    const selected = plans.filter(item => selectedSet.has(String(item.id))).sort((a,b) => parsePlannerDateTime(a.date,a.time)-parsePlannerDateTime(b.date,b.time));
    const remaining = plans.filter(item => !selectedSet.has(String(item.id)));
    const used = new Set();
    const currentDate = new Date();
    const todayKey = currentDate.getFullYear()*10000 + (currentDate.getMonth()+1)*100 + currentDate.getDate();
    const now = Date.now();
    let moved = 0;
    const skipped = [];
    for (const source of selected) {
        const sourceTime = parsePlannerDateTime(source.date,source.time);
        const sourceKey = plannerDateKey(source.date);
        if (!Number.isFinite(sourceTime) || !source.serie || !source.team) { skipped.push(getPlannerTitle(source)); continue; }
        const sameClass = item => normalizePlannerClassValue(item.serie) === normalizePlannerClassValue(source.serie)
            && normalizePlannerClassValue(item.team) === normalizePlannerClassValue(source.team);
        const possible = remaining.filter(item => sameClass(item) && !used.has(String(item.id)))
            .map(item => ({item,time:parsePlannerDateTime(item.date,item.time),key:plannerDateKey(item.date)}))
            .filter(entry => Number.isFinite(entry.time) && (action === 'defer'
                ? entry.key > todayKey && entry.key > sourceKey && entry.time > sourceTime
                : entry.key >= todayKey && entry.key !== sourceKey && entry.time >= now && entry.time < sourceTime))
            .sort((a,b) => a.time-b.time);
        const target = possible[0] && possible[0].item;
        if (!target) { skipped.push(getPlannerTitle(source)); continue; }
        const tag = (action === 'defer' ? 'Adiada do dia ' : 'Adiantada do dia ') + getPlannerOriginalDate(source);
        const { error: updateError } = await supabase.from('planner').update({date:target.date,day:target.day,time:target.time,tag})
            .eq('id',source.id).is('completed_at',null);
        if (updateError) skipped.push(getPlannerTitle(source));
        else { moved++; used.add(String(target.id)); }
    }
    clearPlannerSelection(true);
    await loadPlanners();
    alert(moved + ' aula(s) movimentada(s).' + (skipped.length ? ' Não foi possível: ' + skipped.join(', ') + '.' : ''));
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
        const { data, error } = await supabase.from('planner').select('*');
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
        const next = plans
            .filter(item => String(item.id) !== String(id) && sameSeriesAndTeam(item))
            .map(item => ({ item, timestamp: parseDateTime(item.date, item.time), dateKey: getDateKey(item.date) }))
            .filter(entry =>
                Number.isFinite(entry.timestamp) &&
                entry.dateKey > todayKey &&
                entry.dateKey > getDateKey(selected.date) &&
                entry.timestamp > selectedTimestamp
            )
            .sort((a, b) => a.timestamp - b.timestamp)[0];

        if (!next) {
            alert('Não encontrei uma próxima aula futura para esta mesma série e turma. O adiamento só pode ser feito para uma data posterior a hoje.');
            return;
        }

        const target = next.item;
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
        const { data, error } = await supabase.from('planner').select('*');
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
        const nextUpcoming = plans
            .filter(item => String(item.id) !== String(id) && sameSeriesAndTeam(item))
            .map(item => ({ item, timestamp: parseDateTime(item.date, item.time), dateKey: getDateKey(item.date) }))
            .filter(entry =>
                Number.isFinite(entry.timestamp) &&
                entry.dateKey >= todayKey &&
                entry.dateKey !== getDateKey(selected.date) &&
                entry.timestamp >= now &&
                entry.timestamp < selectedTimestamp
            )
            .sort((a, b) => a.timestamp - b.timestamp)[0];

        if (!nextUpcoming) {
            alert('Não encontrei uma próxima aula futura desta mesma série e turma antes da data selecionada. A antecipação não pode levar a aula para uma data passada nem adiantar para depois da aula original.');
            return;
        }

        const target = nextUpcoming.item;
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
    const types = { 0: 'Aula regular', 1: 'Aula especial', 2: 'Folga', 3: 'Prova', 4: 'Aula adaptada' };
    const fields = [
        { label: 'Data', value: p.date || 'Não informada' },
        { label: 'Horário', value: p.time || 'Não informado' },
        { label: 'Dia da semana', value: p.day || 'Não informado' },
        { label: 'Turma', value: formatPlannerGrade(p) || 'Não informada' },
        { label: 'Duração', value: p.duration || 'Não informada' },
        { label: 'Tipo', value: types[p.special] || 'Aula regular' },
        { label: 'Tag', value: p.tag || 'Nenhuma' }
    ];
    const grid = document.getElementById('planner-details-grid');
    grid.innerHTML = '<article class="detail-mini-card full-width planner-detail-title"><h4>Título da aula</h4><h2>' + escapePlannerHtml(getPlannerTitle(p)) + '</h2></article>' +
        fields.map(field => '<article class="detail-mini-card"><h4>' + escapePlannerHtml(field.label) + '</h4><p>' + escapePlannerHtml(field.value) + '</p></article>').join('') +
        '<article class="detail-mini-card full-width"><h4>Habilidades BNCC</h4><div class="planner-markdown-content">' + (p.skills ? renderPlannerMarkdown(p.skills) : '<p>Não informado</p>') + '</div></article>' +
        '<article class="detail-mini-card full-width planner-detail-activities"><h4>Atividades</h4><div class="planner-markdown-content">' + (p.activities ? renderPlannerMarkdown(p.activities) : '<p>Não informado</p>') + '</div></article>';
    document.getElementById('planner-details-modal').showModal();
};

window.editPlanner = (p) => {
    const detailsModal = document.getElementById('planner-details-modal');
    if (detailsModal && detailsModal.open) detailsModal.close();
    document.getElementById('plan-id').value = p.id;
    
    setSelectValueWithCustom('plan-day', p.day || '');
    document.getElementById('plan-date').value = p.date || '';
    setSelectValueWithCustom('plan-time', p.time || '');
    setPlannerGradeSelect(p.serie, p.team);

    document.getElementById('plan-skills').value = p.skills || '';
    document.getElementById('plan-activities').value = p.activities || '';
    if (window.updatePlannerActivitiesPreview) window.updatePlannerActivitiesPreview();
    document.getElementById('plan-duration').value = p.duration || '';
    
    document.getElementById('cb-adaptado').checked = p.special == 4;
    document.getElementById('cb-especial').checked = p.special == 1;
    document.getElementById('cb-folga').checked = p.special == 2;
    document.getElementById('cb-prova').checked = p.special == 3;
    document.getElementById('plan-end-date').value = '';
    
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
    html = html.replace(new RegExp(mark + '([^' + mark + ']+)' + mark, 'g'), '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    return html;
}

function renderPlannerMarkdown(value) {
    const lines = String(value == null ? '' : value).replace(/\r/g, '').split('\n');
    const output = [];
    let index = 0;

    // Every parsing branch must consume at least one line. In particular, an
    // empty heading such as "## " is valid while the user is still typing.
    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
            index++;
            continue;
        }

        const heading = line.match(/^(#{1,6})[ \t]+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            output.push('<h' + level + '>' + renderPlannerInlineMarkdown(heading[2]) + '</h' + level + '>');
            index++;
            continue;
        }

        if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
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
                quote.push(renderPlannerInlineMarkdown(lines[index].replace(/^\s*>\s?/, '')));
                index++;
            }
            output.push('<blockquote>' + quote.join('<br>') + '</blockquote>');
            continue;
        }

        const paragraph = [];
        while (index < lines.length && lines[index].trim()) {
            const currentLine = lines[index];
            const beginsBlock = /^(#{1,6})[ \t]+/.test(currentLine)
                || /^\s*[-*+]\s+/.test(currentLine)
                || /^\s*\d+[.)]\s+/.test(currentLine)
                || /^\s*>\s?/.test(currentLine)
                || /^\s*([-*_])\1\1+\s*$/.test(currentLine);
            if (beginsBlock) break;
            paragraph.push(renderPlannerInlineMarkdown(currentLine));
            index++;
        }

        // Defensive fallback: malformed or future Markdown syntax must never
        // leave the parser stuck on the same line.
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
    if (!editor || !preview || !toolbar) return;

    const updatePreview = () => {
        preview.innerHTML = editor.value.trim() ? renderPlannerMarkdown(editor.value)
            : '<span class="preview-placeholder">A pré-visualização aparecerá aqui.</span>';
    };
    window.updatePlannerActivitiesPreview = updatePreview;

    toolbar.addEventListener('click', event => {
        const button = event.target.closest('[data-format]');
        if (!button) return;
        const format = button.dataset.format;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selected = editor.value.slice(start, end);
        let before = '';
        let after = '';
        let inserted = selected;

        if (format === 'bold') { before = '**'; after = '**'; inserted = selected || 'texto em negrito'; }
        else if (format === 'italic') { before = '*'; after = '*'; inserted = selected || 'texto em itálico'; }
        else if (format === 'code') { before = String.fromCharCode(96); after = before; inserted = selected || 'código'; }
        else if (format === 'divider') { before = '\n---\n'; inserted = ''; }

        if (['heading', 'bullet', 'number', 'quote'].includes(format)) {
            const lineStart = editor.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
            const lineEnd = editor.value.indexOf('\n', end);
            const actualEnd = lineEnd === -1 ? editor.value.length : lineEnd;
            const block = editor.value.slice(lineStart, actualEnd);
            const prefix = format === 'heading' ? '# ' : format === 'bullet' ? '- ' : format === 'number' ? '1. ' : '> ';
            const replacement = block.split('\n').map(line => prefix + line.replace(/^(#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|>[ \t]?)/, '')).join('\n');
            editor.value = editor.value.slice(0, lineStart) + replacement + editor.value.slice(actualEnd);
            editor.focus();

            // Leave the caret after the heading marker when starting from an
            // empty line, instead of selecting "## " and replacing it on type.
            const contentStart = lineStart + prefix.length;
            if (!block.trim()) {
                editor.setSelectionRange(contentStart, contentStart);
            } else {
                editor.setSelectionRange(contentStart, lineStart + replacement.length);
            }
        } else {
            editor.value = editor.value.slice(0, start) + before + inserted + after + editor.value.slice(end);
            editor.focus();
            const cursorStart = start + before.length;
            editor.setSelectionRange(cursorStart, cursorStart + inserted.length);
        }
        updatePreview();
    });
    editor.addEventListener('input', () => {
        const firstLine = editor.value.split(/\r?\n/, 1)[0] || '';
        if (/^#\s+\S.*$/.test(firstLine) || (!editor.required && !editor.value.trim())) editor.setCustomValidity('');
        updatePreview();
    });
    updatePreview();
}
