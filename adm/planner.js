import { supabase } from '../supabaseClient.js';

const plannerItemsById = new Map();
let selectedPlannerItem = null;
let mergeSourceItem = null;
let mergeTargetItem = null;
let mergeIsSaving = false;

export function initPlanner() {
    setupCustomOptions();
    setupDatePickers();
    setupLastTeamToggle();
    loadPlanners();
    loadCompletedPlanners();
    setupPlannerMerge();
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
        document.getElementById('plan-serie').required = !(isEsp || isFlg || isPrv);
        document.getElementById('plan-team').required = !(isEsp || isFlg || isPrv);
        document.getElementById('plan-activities').required = !(isFlg || isPrv);
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

        const planData = {
            day: document.getElementById('plan-day').value,
            date: document.getElementById('plan-date').value,
            time: document.getElementById('plan-time').value,
            serie: document.getElementById('plan-serie').value,
            team: document.getElementById('plan-team').value,
            skills: document.getElementById('plan-skills').value,
            activities: document.getElementById('plan-activities').value,
            duration: document.getElementById('plan-duration').value,
            special: specialValue
        };

        // Salvar última turma no cache se o toggle estiver ativo
        const isLastTeamEnabled = localStorage.getItem('planner_last_team_enabled') === 'true';
        if (isLastTeamEnabled) {
            if (planData.serie && planData.serie !== '__ADD_NEW__') localStorage.setItem('planner_last_serie', planData.serie);
            if (planData.team && planData.team !== '__ADD_NEW__') localStorage.setItem('planner_last_team', planData.team);
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

    // Pesquisa no Planner
    const searchInput = document.getElementById('planner-search');
    const resultsContainer = document.getElementById('planner-search-results');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            resultsContainer.innerHTML = '';
            if (q.length < 2) { resultsContainer.classList.add('hidden'); return; }
            
            let found = false;
            document.querySelectorAll('#planner-list .data-card').forEach(card => {
                if (card.innerText.toLowerCase().includes(q)) {
                    found = true;
                    const info = card.querySelector('.data-card-info').innerText.split('\n')[0];
                    const div = document.createElement('div');
                    div.className = 'search-item';
                    div.innerText = info.substring(0, 50) + '...';
                    div.onclick = () => {
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        card.style.outline = '4px solid var(--primary)';
                        setTimeout(() => card.style.outline = 'none', 2000);
                        resultsContainer.classList.add('hidden');
                    };
                    resultsContainer.appendChild(div);
                }
            });
            resultsContainer.classList.toggle('hidden', !found);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#planner-search') && !e.target.closest('#planner-search-results')) {
                resultsContainer.classList.add('hidden');
            }
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
    document.getElementById('plan-serie').value = '';
    document.getElementById('plan-team').value = '';
    document.getElementById('plan-time').value = '';
    document.getElementById('plan-day').value = '';
}

// --- LÓGICA DE GERENCIAMENTO DE DROPDOWNS CUSTOMIZADOS COM PROMPT ---
function setupCustomOptions() {
    loadCustomOptionsForSelect('plan-serie', 'planner_custom_series');
    loadCustomOptionsForSelect('plan-team', 'planner_custom_teams');
    loadCustomOptionsForSelect('plan-time', 'planner_custom_times');

    setupCustomAddListener('plan-serie', 'planner_custom_series', 'Série');
    setupCustomAddListener('plan-team', 'planner_custom_teams', 'Turma');
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
        if (select.value === '__ADD_NEW__') {
            const newVal = prompt(`Digite o novo valor para ${labelName}:`);
            if (newVal && newVal.trim() !== '') {
                const cleanVal = newVal.trim();
                setSelectValueWithCustom(selectId, cleanVal);

                const customItems = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (!customItems.includes(cleanVal)) {
                    customItems.push(cleanVal);
                    localStorage.setItem(storageKey, JSON.stringify(customItems));
                }

                // Salva se "Última turma" estiver ativo
                if ((selectId === 'plan-serie' || selectId === 'plan-team') && localStorage.getItem('planner_last_team_enabled') === 'true') {
                    if (selectId === 'plan-serie') localStorage.setItem('planner_last_serie', cleanVal);
                    if (selectId === 'plan-team') localStorage.setItem('planner_last_team', cleanVal);
                }
            } else {
                select.value = '';
            }
        } else {
            if ((selectId === 'plan-serie' || selectId === 'plan-team') && localStorage.getItem('planner_last_team_enabled') === 'true') {
                if (selectId === 'plan-serie') localStorage.setItem('planner_last_serie', select.value);
                if (selectId === 'plan-team') localStorage.setItem('planner_last_team', select.value);
            }
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

    const isEnabled = localStorage.getItem('planner_last_team_enabled') === 'true';
    toggle.checked = isEnabled;

    toggle.addEventListener('change', () => {
        if (toggle.checked) {
            localStorage.setItem('planner_last_team_enabled', 'true');
        } else {
            localStorage.setItem('planner_last_team_enabled', 'false');
            localStorage.removeItem('planner_last_serie');
            localStorage.removeItem('planner_last_team');
        }
    });
}

function applyLastTeamIfEnabled() {
    const isEnabled = localStorage.getItem('planner_last_team_enabled') === 'true';
    if (isEnabled) {
        const lastSerie = localStorage.getItem('planner_last_serie');
        const lastTeam = localStorage.getItem('planner_last_team');
        if (lastSerie) setSelectValueWithCustom('plan-serie', lastSerie);
        if (lastTeam) setSelectValueWithCustom('plan-team', lastTeam);
    }
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

function renderMergePreviewCard(item, label) {
    if (!item) {
        return '<div class="merge-empty-card"><i class="fa-regular fa-square-plus"></i><p>Selecione uma aula para receber as atividades</p><button type="button" class="btn-primary" id="btn-open-merge-picker">Selecionar aula</button></div>';
    }

    return '<article class="merge-preview-card">' +
        '<div class="merge-preview-card-label">' + escapePlannerHtml(label) + '</div>' +
        '<h4>' + escapePlannerHtml(item.day || 'Aula') + ' — ' + escapePlannerHtml(item.date || 'Sem data') + '</h4>' +
        '<p><strong>Horário:</strong> ' + escapePlannerHtml(item.time || 'Não informado') + '</p>' +
        '<p><strong>Turma:</strong> ' + escapePlannerHtml(item.serie || '') + ' ' + escapePlannerHtml(item.team || '') + '</p>' +
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
            '<span>' + escapePlannerHtml(item.time || 'Sem horário') + ' · ' + escapePlannerHtml(item.serie || '') + ' ' + escapePlannerHtml(item.team || '') + '</span>' +
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

                const sourceClass = normalizePlannerClassValue(currentSource.serie) + '::' + normalizePlannerClassValue(currentSource.team);
                const targetClass = normalizePlannerClassValue(currentTarget.serie) + '::' + normalizePlannerClassValue(currentTarget.team);
                if (sourceClass !== targetClass) {
                    throw new Error('As duas aulas precisam pertencer à mesma turma.');
                }

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
    list.innerHTML = '<div class="empty-state">Carregando aulas da mesma turma...</div>';

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

    const sourceClass = normalizePlannerClassValue(mergeSourceItem.serie) + '::' + normalizePlannerClassValue(mergeSourceItem.team);
    const candidates = (data || []).filter(item =>
        String(item.id) !== String(mergeSourceItem.id) &&
        normalizePlannerClassValue(item.serie) + '::' + normalizePlannerClassValue(item.team) === sourceClass
    );

    if (!candidates.length) {
        list.innerHTML = '<div class="empty-state">Não há outras aulas planejadas e não concluídas para esta turma.</div>';
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
        (p.special == 1 ? 'card-special-1' : (p.special == 2 ? 'card-special-2' :
        (p.special == 3 ? 'card-special-3' : '')));
    const titleHtml = p.special == 4
        ? '<p class="adapted-label"><i class="fa-solid fa-puzzle-piece" aria-hidden="true"></i> <strong>ADAPTADO</strong></p>'
        : (p.special == 2
            ? '<p class="planner-special-label"><strong>FOLGA</strong></p>'
            : (p.special == 3 ? '<p class="planner-special-label"><strong>PROVA</strong></p>' : ''));
    const actions = mode === 'completed'
        ? '<button class="btn-small btn-danger" onclick="window.deleteCompletedPlanner(\'' + p.id + '\')">Excluir</button>'
        : '<button class="btn-small btn-secondary" onclick=\'window.editPlanner(' + JSON.stringify(p).replace(/'/g, "&#39;") + ')\'>Editar</button>' +
          '<button class="btn-small btn-postpone" onclick="window.deferPlanner(\'' + p.id + '\')" title="Mover esta aula para a data e hora da próxima aula">Adiar</button>' +
          '<button class="btn-small btn-advance" onclick="window.advancePlanner(\'' + p.id + '\')" title="Trazer esta aula para a próxima data futura da turma">Adiantar</button>' +
          '<button class="btn-small btn-complete" onclick="window.completePlanner(\'' + p.id + '\')" title="Mover esta aula para Aulas passadas">Concluída</button>' +
          '<button class="btn-small btn-danger" onclick="window.deletePlanner(\'' + p.id + '\')" title="Excluir definitivamente este planejamento">Excluir</button>' +
          '<button class="btn-small btn-merge" onclick="window.openPlannerMerge(\'' + p.id + '\')" title="Unir esta aula a outra aula da mesma turma">Merge</button>';

    return '<div class="data-card ' + cardClass + ' ' + (mode === 'completed' ? 'completed-card' : '') + '"' +
        ' id="plan-card-' + p.id + '" data-plan-id="' + p.id + '" role="button" tabindex="0" aria-label="Ver detalhes da aula">' +
        '<div class="data-card-info">' +
            '<p><strong>' + escapePlannerHtml(p.day || '') + ' - ' + escapePlannerHtml(p.date || '') +
            (p.time ? ' (' + escapePlannerHtml(p.time) + ')' : '') + '</strong>' +
            (p.duration ? ' | Duração: ' + escapePlannerHtml(p.duration) : '') + '</p>' +
            titleHtml +
            (p.tag ? '<p class="planner-card-tag"><strong>Tag:</strong> ' + escapePlannerHtml(p.tag) + '</p>' : '') +
            (p.serie || p.team ? '<p><strong>Turma:</strong> ' + escapePlannerHtml(p.serie || '') + ' ' + escapePlannerHtml(p.team || '') + '</p>' : '') +
            (p.activities ? '<div class="planner-card-activities"><strong>Atividades:</strong>' + renderPlannerMarkdown(p.activities) + '</div>' : '') +
            (p.skills ? '<p><strong>BNCC:</strong> ' + escapePlannerHtml(p.skills) + '</p>' : '') +
            (mode === 'completed' && p.completed_at ? '<p class="completed-at"><i class="fa-solid fa-circle-check"></i> Concluída em ' + new Date(p.completed_at).toLocaleString('pt-BR') + '</p>' : '') +
        '</div>' + (actions ? '<div class="data-card-actions">' + actions + '</div>' : '') + '</div>';
}

function setupPlannerCardInteractions(container) {
    container.querySelectorAll('.data-card[data-plan-id]').forEach(card => {
        card.addEventListener('click', event => {
            if (event.target.closest('button, a')) return;
            window.viewPlanner(card.dataset.planId);
        });
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                window.viewPlanner(card.dataset.planId);
            }
        });
    });
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
    if (!data || !data.length) {
        container.innerHTML = '<div class="empty-state">Nenhuma aula planejada.</div>';
        return;
    }

    const parseDateTime = (dateStr, timeStr) => {
        if (!dateStr) return 0;
        const parts = String(dateStr).split(/[/-]/);
        if (parts.length !== 3) return 0;
        const [year, month, day] = parts[0].length === 4
            ? parts
            : [parts[2], parts[1], parts[0]];
        return new Date(year + '/' + month + '/' + day + ' ' + (timeStr || '00:00')).getTime();
    };
    data.sort((a, b) => parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time));

    const groups = data.reduce((acc, item) => {
        const title = item.day ? item.day + ' - ' + item.date : item.date;
        if (!acc[title]) acc[title] = [];
        acc[title].push(item);
        return acc;
    }, {});

    container.innerHTML = Object.entries(groups).map(([title, items]) => {
        const isHidden = localStorage.getItem('planner_state_' + title) === 'true';
        const displayClass = isHidden ? 'hidden' : '';
        const btnText = isHidden ? 'Maximizar' : 'Minimizar';
        const firstItem = items[0] || {};

        return '<div class="planner-section">' +
            '<h3 class="planner-section-title"><span>' + escapePlannerHtml(title) + '</span>' +
                '<div class="planner-section-heading-actions">' +
                    '<button class="btn-small btn-primary" onclick="window.addPlanForDay(\'' + escapePlannerHtml(firstItem.day || '') + '\', \'' + escapePlannerHtml(firstItem.date || '') + '\')">+ Nova aula</button>' +
                    '<button class="minimize-btn" onclick="window.togglePlannerSection(this, \'' + escapePlannerHtml(title) + '\')">' + btnText + '</button>' +
                '</div>' +
            '</h3>' +
            '<div class="planner-section-content ' + displayClass + '">' +
                items.map(item => renderPlannerCard(item, 'active')).join('') +
            '</div></div>';
    }).join('');

    data.forEach(item => plannerItemsById.set(String(item.id), item));
    setupPlannerCardInteractions(container);
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
    const typeLabels = { 0: 'Aula regular', 1: 'Aula especial', 2: 'Folga', 3: 'Prova', 4: 'Aula adaptada' };
    const fields = [
        { label: 'Dia', value: p.day || 'Não informado' },
        { label: 'Data', value: p.date || 'Não informada' },
        { label: 'Horário', value: p.time || 'Não informado' },
        { label: 'Série', value: p.serie || 'Não informada' },
        { label: 'Turma', value: p.team || 'Não informada' },
        { label: 'Duração', value: p.duration || 'Não informada' },
        { label: 'Tipo', value: typeLabels[p.special] || 'Aula regular' },
        { label: 'Tag', value: p.tag || 'Nenhuma' }
    ];
    const grid = document.getElementById('planner-details-grid');
    grid.innerHTML = fields.map(field => '<article class="detail-mini-card"><h4>' + escapePlannerHtml(field.label) + '</h4><p>' + escapePlannerHtml(field.value) + '</p></article>').join('') +
        '<article class="detail-mini-card full-width"><h4>Habilidades BNCC</h4><div class="planner-markdown-content">' + (p.skills ? renderPlannerMarkdown(p.skills) : '<p>Não informado</p>') + '</div></article>' +
        '<article class="detail-mini-card full-width"><h4>Atividades</h4><div class="planner-markdown-content">' + (p.activities ? renderPlannerMarkdown(p.activities) : '<p>Não informado</p>') + '</div></article>';
    document.getElementById('planner-details-modal').showModal();
};

window.editPlanner = (p) => {
    const detailsModal = document.getElementById('planner-details-modal');
    if (detailsModal && detailsModal.open) detailsModal.close();
    document.getElementById('plan-id').value = p.id;
    
    setSelectValueWithCustom('plan-day', p.day || '');
    document.getElementById('plan-date').value = p.date || '';
    setSelectValueWithCustom('plan-time', p.time || '');
    setSelectValueWithCustom('plan-serie', p.serie || '');
    setSelectValueWithCustom('plan-team', p.team || '');

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
    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) { index++; continue; }
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            output.push('<h' + level + '>' + renderPlannerInlineMarkdown(heading[2]) + '</h' + level + '>');
            index++;
            continue;
        }
        if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
            output.push('<hr>'); index++; continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
            const items = [];
            while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
                items.push('<li>' + renderPlannerInlineMarkdown(lines[index].replace(/^\s*[-*+]\s+/, '')) + '</li>');
                index++;
            }
            output.push('<ul>' + items.join('') + '</ul>'); continue;
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
            const items = [];
            while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
                items.push('<li>' + renderPlannerInlineMarkdown(lines[index].replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
                index++;
            }
            output.push('<ol>' + items.join('') + '</ol>'); continue;
        }
        if (/^\s*>\s?/.test(line)) {
            const quote = [];
            while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
                quote.push(renderPlannerInlineMarkdown(lines[index].replace(/^\s*>\s?/, '')));
                index++;
            }
            output.push('<blockquote>' + quote.join('<br>') + '</blockquote>'); continue;
        }
        const paragraph = [];
        while (index < lines.length && lines[index].trim() &&
            !/^(#{1,3})\s+/.test(lines[index]) &&
            !/^\s*[-*+]\s+/.test(lines[index]) &&
            !/^\s*\d+[.)]\s+/.test(lines[index]) &&
            !/^\s*>\s?/.test(lines[index]) &&
            !/^\s*([-*_])\1\1+\s*$/.test(lines[index])) {
            paragraph.push(renderPlannerInlineMarkdown(lines[index]));
            index++;
        }
        output.push('<p>' + paragraph.join('<br>') + '</p>');
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
            const prefix = format === 'heading' ? '## ' : format === 'bullet' ? '- ' : format === 'number' ? '1. ' : '> ';
            const replacement = block.split('\n').map(line => prefix + line.replace(/^(#{1,3}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, '')).join('\n');
            editor.value = editor.value.slice(0, lineStart) + replacement + editor.value.slice(actualEnd);
            editor.focus();
            editor.setSelectionRange(lineStart, lineStart + replacement.length);
        } else {
            editor.value = editor.value.slice(0, start) + before + inserted + after + editor.value.slice(end);
            editor.focus();
            const cursorStart = start + before.length;
            editor.setSelectionRange(cursorStart, cursorStart + inserted.length);
        }
        updatePreview();
    });
    editor.addEventListener('input', updatePreview);
    updatePreview();
}
