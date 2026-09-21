import { supabase } from '../supabaseClient.js';

export function initPlanner() {
    setupCustomOptions();
    setupDatePickers();
    setupLastTeamToggle();
    loadPlanners();

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

    ['cb-especial', 'cb-folga', 'cb-prova'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            if (e.target.checked) {
                ['cb-especial', 'cb-folga', 'cb-prova'].forEach(other => {
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
        ['cb-especial', 'cb-folga', 'cb-prova'].forEach(id => document.getElementById(id).checked = false);
        
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
        const specialValue = document.getElementById('cb-especial').checked ? 1 :
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
            document.querySelectorAll('.data-card').forEach(card => {
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
    ['cb-especial', 'cb-folga', 'cb-prova'].forEach(id => document.getElementById(id).checked = false);

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

async function loadPlanners() {
    const container = document.getElementById('planner-list');
    container.innerHTML = 'Carregando...';

    const { data, error } = await supabase.from('planner').select('*').order('id', { ascending: false });
    if (error) return container.innerHTML = 'Erro ao carregar planos.';
    if (!data.length) return container.innerHTML = 'Nenhuma aula planejada.';

    data.sort((a, b) => {
        const parseDateTime = (dateStr, timeStr) => {
            if (!dateStr) return 0;
            let parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
            let year = parts[2].length === 4 ? parts[2] : parts[0];
            let month = parts[1];
            let day = parts[2].length === 4 ? parts[0] : parts[2];
            return new Date(`${year}/${month}/${day} ${timeStr || '00:00'}`).getTime();
        };
        return parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time);
    });

    const groups = data.reduce((acc, item) => {
        const title = item.day ? `${item.day} - ${item.date}` : item.date;
        if (!acc[title]) acc[title] = [];
        acc[title].push(item);
        return acc;
    }, {});

    container.innerHTML = Object.entries(groups).map(([title, items]) => {
        const isHidden = localStorage.getItem(`planner_state_${title}`) === 'true';
        const displayClass = isHidden ? 'hidden' : '';
        const btnText = isHidden ? 'Maximizar' : 'Minimizar';

        const firstItem = items[0] || {};
        const itemDay = firstItem.day || '';
        const itemDate = firstItem.date || '';

        return `
        <div class="planner-section" style="margin-bottom: 24px;">
            <h3 class="planner-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; border-bottom: 2px solid #ccc; padding-bottom: 4px;">
                <span>${title}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn-small btn-primary" onclick="window.addPlanForDay('${itemDay}', '${itemDate}')">+ Nova aula</button>
                    <button class="minimize-btn" style="color:var(--text-muted);" onclick="window.togglePlannerSection(this, '${title}')">${btnText}</button>
                </div>
            </h3>
            <div class="planner-section-content ${displayClass}">
                ${items.map(p => {
                    let cardClass = p.special == 1 ? 'card-special-1' : (p.special == 2 ? 'card-special-2' : (p.special == 3 ? 'card-special-3' : ''));
                    let titleHtml = p.special == 2 ? '<p style="font-size: 1.2rem; text-transform: uppercase;"><strong>FOLGA</strong></p>' : (p.special == 3 ? '<p style="font-size: 1.2rem; text-transform: uppercase;"><strong>PROVA</strong></p>' : '');
                    
                    return `
                    <div class="data-card ${cardClass}" id="plan-card-${p.id}">
                        <div class="data-card-info">
                            <p><strong>${p.day} - ${p.date}${p.time ? `(${p.time})` : ''}</strong> ${p.duration ? `| Duração: ${p.duration}` : ''}</p>
                            ${titleHtml}${p.serie || p.team ? `<p><strong>Turma:</strong> ${p.serie || ''} ${p.team || ''}</p>` : ''}
                            ${p.activities ? `<p><strong>Atividades:</strong> ${p.activities}</p>` : ''}
                            ${p.skills ? `<p><strong>BNCC:</strong> ${p.skills}</p>` : ''}
                        </div>
                        <div class="data-card-actions">
                            <button class="btn-small btn-secondary" onclick='window.editPlanner(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Editar</button>
                            <button class="btn-small" style="background-color: #ff4444; color: white; border: none;" onclick='window.deletePlanner("${p.id}")'>Excluir</button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    }).join('');
}

window.editPlanner = (p) => {
    document.getElementById('plan-id').value = p.id;
    
    setSelectValueWithCustom('plan-day', p.day || '');
    document.getElementById('plan-date').value = p.date || '';
    setSelectValueWithCustom('plan-time', p.time || '');
    setSelectValueWithCustom('plan-serie', p.serie || '');
    setSelectValueWithCustom('plan-team', p.team || '');

    document.getElementById('plan-skills').value = p.skills || '';
    document.getElementById('plan-activities').value = p.activities || '';
    document.getElementById('plan-duration').value = p.duration || '';
    
    document.getElementById('cb-especial').checked = p.special == 1;
    document.getElementById('cb-folga').checked = p.special == 2;
    document.getElementById('cb-prova').checked = p.special == 3;
    document.getElementById('plan-end-date').value = '';
    
    window.updateRequiredFields();

    document.getElementById('planner-modal-title').textContent = 'Editar Aula';
    document.getElementById('planner-modal').showModal();
};
                            
window.deletePlanner = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta aula? Esta ação não pode ser desfeita.')) {
        return; 
    }

    const { error } = await supabase.from('planner').delete().eq('id', id);

    if (error) {
        alert('Erro ao excluir a aula: ' + error.message);
    } else {
        loadPlanners();
    }
};
