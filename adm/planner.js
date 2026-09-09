import { supabase } from '../supabaseClient.js';

export function initPlanner() {
    loadPlanners();
    setupPlannerModal();
    setupPlannerSearch();
}

async function loadPlanners() {
    const container = document.getElementById('planner-list');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Carregando planejamentos...</div>';

    try {
        const { data, error } = await supabase
            .from('planner')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum planejamento cadastrado.</div>';
            return;
        }

        renderPlannersList(data);
    } catch (err) {
        console.error('Erro ao carregar planejamentos:', err);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">Erro ao carregar os planejamentos.</div>';
    }
}

function renderPlannersList(planners) {
    const container = document.getElementById('planner-list');
    let html = '';

    planners.forEach(p => {
        let badge = '';
        if (p.special === '1' || p.special === 1) badge = '<span style="background: var(--primary); color: #000; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">Especial</span>';
        if (p.special === '2' || p.special === 2) badge = '<span style="background: #3b82f6; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">Folga</span>';
        if (p.special === '3' || p.special === 3) badge = '<span style="background: #ef4444; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">Prova</span>';

        html += `
            <div class="card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 12px; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <span style="color: var(--primary); font-weight: bold; font-size: 1.1rem;">${p.serie || ''} - Turma ${p.team || ''}</span>
                        <div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 2px;">${p.day || ''} | ${p.date || ''} (${p.time || ''})</div>
                    </div>
                    ${badge}
                </div>
                
                <div style="background: var(--bg-dark); padding: 12px; border-radius: 6px; font-size: 0.95rem; border: 1px solid rgba(255,255,255,0.05);">
                    <strong>Atividades:</strong><br>
                    <p style="margin-top: 4px; white-space: pre-line; color: #ddd;">${p.activities || 'Nenhuma atividade descrita.'}</p>
                </div>

                ${p.skills ? `<div style="font-size: 0.85em; color: var(--text-muted);"><strong>Habilidades BNCC:</strong> ${p.skills}</div>` : ''}

                <div style="display: flex; gap: 10px; margin-top: auto; justify-content: flex-end;">
                    <button class="btn-secondary btn-edit" data-id="${p.id}" style="padding: 6px 12px; font-size: 0.9rem;">Editar</button>
                    <button class="btn-danger btn-delete" data-id="${p.id}" style="padding: 6px 12px; font-size: 0.9rem;">Excluir</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Ações de Editar e Excluir
    container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id, planners));
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => deletePlanner(btn.dataset.id));
    });
}

function setupPlannerModal() {
    const modal = document.getElementById('planner-modal');
    const btnAdd = document.getElementById('btn-add-plan');
    const form = document.getElementById('planner-form');
    
    const cbEspecial = document.getElementById('cb-especial');
    const cbFolga = document.getElementById('cb-folga');
    const cbProva = document.getElementById('cb-prova');
    const labelEndDate = document.getElementById('label-end-date');
    const btnReplicate = document.getElementById('btn-replicate');

    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            document.getElementById('planner-modal-title').textContent = 'Adicionar Aula';
            form.reset();
            document.getElementById('plan-id').value = '';
            labelEndDate.classList.add('hidden');
            modal.showModal();
        });
    }

    // Controle de exibição do campo de Data Final quando a opção Prova for marcada
    if (cbProva) {
        cbProva.addEventListener('change', (e) => {
            if (e.target.checked) {
                labelEndDate.classList.remove('hidden');
                cbEspecial.checked = false;
                cbFolga.checked = false;
            } else {
                labelEndDate.classList.add('hidden');
            }
        });
    }

    if (cbEspecial) {
        cbEspecial.addEventListener('change', (e) => {
            if (e.target.checked) {
                cbProva.checked = false;
                cbFolga.checked = false;
                labelEndDate.classList.add('hidden');
            }
        });
    }

    if (cbFolga) {
        cbFolga.addEventListener('change', (e) => {
            if (e.target.checked) {
                cbProva.checked = false;
                cbEspecial.checked = false;
                labelEndDate.classList.add('hidden');
            }
        });
    }

    // Ação do Botão Replicar para gerador de Provas por intervalo de datas
    if (btnReplicate) {
        btnReplicate.addEventListener('click', async () => {
            const startDateStr = document.getElementById('plan-date').value.trim();
            const endDateStr = document.getElementById('plan-end-date').value.trim();
            const timeVal = document.getElementById('plan-time').value.trim();
            const serieVal = document.getElementById('plan-serie').value.trim();
            const teamVal = document.getElementById('plan-team').value.trim();
            const durationVal = document.getElementById('plan-duration').value.trim();
            const skillsVal = document.getElementById('plan-skills').value.trim();
            const activitiesVal = document.getElementById('plan-activities').value.trim();

            if (!startDateStr || !endDateStr) {
                alert('Preencha a data inicial (no campo Data) e a Data Final (Prova) para replicar.');
                return;
            }

            const startDate = parseDate(startDateStr);
            const endDate = parseDate(endDateStr);

            if (!startDate || !endDate) {
                alert('Formato de data inválido. Utilize o formato DD/MM/AAAA.');
                return;
            }

            if (startDate > endDate) {
                alert('A data inicial não pode ser maior que a data final.');
                return;
            }

            const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
            let currentDate = new Date(startDate);
            // Avança para o dia seguinte ao inicial para iniciar a replicação conforme solicitado
            currentDate.setDate(currentDate.getDate() + 1);

            const newRecords = [];

            while (currentDate <= endDate) {
                const dayName = diasSemana[currentDate.getDay()];
                const formattedDate = formatDateToString(currentDate);

                newRecords.push({
                    day: dayName,
                    date: formattedDate,
                    time: timeVal,
                    serie: serieVal,
                    team: teamVal,
                    duration: durationVal,
                    skills: skillsVal,
                    activities: activitiesVal,
                    special: '3' // Marcado como prova
                });

                // Avança um dia
                currentDate.setDate(currentDate.getDate() + 1);
            }

            if (newRecords.length === 0) {
                alert('Nenhum registro para replicar no intervalo informado.');
                return;
            }

            try {
                const { error } = await supabase.from('planner').insert(newRecords);
                if (error) throw error;

                alert(`${newRecords.length} novas linhas replicadas com sucesso!`);
                modal.close();
                loadPlanners();
            } catch (err) {
                console.error('Erro ao replicar registros:', err);
                alert('Erro ao salvar as replicações no banco de dados.');
            }
        });
    }

    // Salvar normal (Formulário)
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('plan-id').value;

            let specialVal = null;
            if (cbEspecial.checked) specialVal = '1';
            else if (cbFolga.checked) specialVal = '2';
            else if (cbProva.checked) specialVal = '3';

            const payload = {
                day: document.getElementById('plan-day').value.trim(),
                date: document.getElementById('plan-date').value.trim(),
                time: document.getElementById('plan-time').value.trim(),
                serie: document.getElementById('plan-serie').value.trim(),
                team: document.getElementById('plan-team').value.trim(),
                duration: document.getElementById('plan-duration').value.trim(),
                skills: document.getElementById('plan-skills').value.trim(),
                activities: document.getElementById('plan-activities').value.trim(),
                special: specialVal
            };

            try {
                let error;
                if (id) {
                    const res = await supabase.from('planner').update(payload).eq('id', id);
                    error = res.error;
                } else {
                    const res = await supabase.from('planner').insert([payload]);
                    error = res.error;
                }

                if (error) throw error;

                modal.close();
                loadPlanners();
            } catch (err) {
                console.error('Erro ao salvar planejamento:', err);
                alert('Erro ao salvar dados.');
            }
        });
    }
}

async function openEditModal(id, planners) {
    const modal = document.getElementById('planner-modal');
    const form = document.getElementById('planner-form');
    const plan = planners.find(p => String(p.id) === String(id));
    if (!plan) return;

    document.getElementById('planner-modal-title').textContent = 'Editar Aula';
    form.reset();

    document.getElementById('plan-id').value = plan.id;
    document.getElementById('plan-day').value = plan.day || '';
    document.getElementById('plan-date').value = plan.date || '';
    document.getElementById('plan-time').value = plan.time || '';
    document.getElementById('plan-serie').value = plan.serie || '';
    document.getElementById('plan-team').value = plan.team || '';
    document.getElementById('plan-duration').value = plan.duration || '';
    document.getElementById('plan-skills').value = plan.skills || '';
    document.getElementById('plan-activities').value = plan.activities || '';

    const cbEspecial = document.getElementById('cb-especial');
    const cbFolga = document.getElementById('cb-folga');
    const cbProva = document.getElementById('cb-prova');
    const labelEndDate = document.getElementById('label-end-date');

    cbEspecial.checked = (plan.special === '1' || plan.special === 1);
    cbFolga.checked = (plan.special === '2' || plan.special === 2);
    cbProva.checked = (plan.special === '3' || plan.special === 3);

    if (cbProva.checked) {
        labelEndDate.classList.remove('hidden');
    } else {
        labelEndDate.classList.add('hidden');
    }

    modal.showModal();
}

async function deletePlanner(id) {
    if (!confirm('Deseja realmente excluir este planejamento?')) return;

    try {
        const { error } = await supabase.from('planner').delete().eq('id', id);
        if (error) throw error;
        loadPlanners();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir o registro.');
    }
}

function setupPlannerSearch() {
    const searchInput = document.getElementById('planner-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            loadPlanners();
            return;
        }

        try {
            const { data, error } = await supabase
                .from('planner')
                .select('*')
                .or(`date.ilike.%${query}%,time.ilike.%${query}%,team.ilike.%${query}%,serie.ilike.%${query}%,day.ilike.%${query}%`);

            if (error) throw error;
            if (data) renderPlannersList(data);
        } catch (err) {
            console.error('Erro na busca de planejamentos:', err);
        }
    });
}

// Funções auxiliares para manipulação correta de datas DD/MM/AAAA
function parseDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    return date;
}

function formatDateToString(dateObj) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
}
