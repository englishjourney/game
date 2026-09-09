import { supabase } from '../supabaseClient.js';

export function initPlanner() {
    const btnAdd = document.getElementById('btn-add-plan');
    const modal = document.getElementById('planner-modal');
    const form = document.getElementById('planner-form');
    const searchInput = document.getElementById('planner-search');
    const resultsContainer = document.getElementById('planner-search-results');

    const cbEspecial = document.getElementById('cb-especial');
    const cbFolga = document.getElementById('cb-folga');
    const cbProva = document.getElementById('cb-prova');
    const labelEndDate = document.getElementById('label-end-date');

    // Exclusividade entre caixas de seleção (especial, folga, prova) e controle do campo de data final
    [cbEspecial, cbFolga, cbProva].forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (e.target.checked) {
                [cbEspecial, cbFolga, cbProva].forEach(other => {
                    if (other !== e.target) other.checked = false;
                });
            }
            // Se for Prova (cbProva), exibe o campo de Data Final e o botão Replicar
            if (cbProva.checked) {
                labelEndDate.classList.remove('hidden');
            } else {
                labelEndDate.classList.add('hidden');
                const endDateInput = document.getElementById('plan-end-date');
                if (endDateInput) endDateInput.value = '';
            }
        });
    });

    // Garantir que o botão "Replicar" exista perto do campo Data Final
    let btnReplicate = document.getElementById('btn-replicate');
    if (!btnReplicate) {
        btnReplicate = document.createElement('button');
        btnReplicate.type = 'button';
        btnReplicate.id = 'btn-replicate';
        btnReplicate.textContent = 'Replicar';
        btnReplicate.className = 'btn-secondary';
        btnReplicate.style.marginLeft = '10px';
        btnReplicate.style.padding = '5px 10px';
        
        // Inserir após o input de data final
        const endDateInput = document.getElementById('plan-end-date');
        if (endDateInput && endDateInput.parentNode) {
            endDateInput.parentNode.appendChild(btnReplicate);
        }
    }

    // Ação do Botão Replicar
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
            alert('Por favor, preencha a Data inicial e a Data Final para replicar.');
            return;
        }

        // Converter datas no formato DD/MM/YYYY para objetos Date
        const parseDate = (str) => {
            const parts = str.split('/');
            if (parts.length !== 3) return null;
            return new Date(parts[2], parts[1] - 1, parts[0]);
        };

        const formatDate = (dateObj) => {
            const d = String(dateObj.getDate()).padStart(2, '0');
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const y = dateObj.getFullYear();
            return `${d}/${m}/${y}`;
        };

        const getDayName = (dateObj) => {
            const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
            return days[dateObj.getDay()];
        };

        const startDate = parseDate(startDateStr);
        const endDate = parseDate(endDateStr);

        if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            alert('Formato de data inválido. Use DD/MM/YYYY.');
            return;
        }

        if (startDate > endDate) {
            alert('A data inicial não pode ser posterior à data final.');
            return;
        }

        let currDate = new Date(startDate);
        currDate.setDate(currDate.getDate() + 1); // Próximas após a data do registro atual

        const rowsToInsert = [];
        while (currDate <= endDate) {
            rowsToInsert.push({
                day: getDayName(currDate),
                date: formatDate(currDate),
                time: timeVal,
                serie: serieVal,
                team: teamVal,
                duration: durationVal,
                skills: skillsVal,
                activities: activitiesVal,
                special: '3' // Prova
            });
            currDate.setDate(currDate.getDate() + 1);
        }

        if (rowsToInsert.length === 0) {
            alert('Nenhuma data adicional encontrada no intervalo.');
            return;
        }

        try {
            const { error } = await supabase.from('planner').insert(rowsToInsert);
            if (error) throw error;
            alert(`${rowsToInsert.length} novas aulas de prova replicadas com sucesso!`);
            modal.close();
            loadPlanner();
        } catch (err) {
            console.error('Erro ao replicar aulas:', err);
            alert('Erro ao replicar aulas. Verifique o console.');
        }
    });

    btnAdd.addEventListener('click', () => {
        document.getElementById('planner-modal-title').textContent = 'Adicionar Aula';
        form.reset();
        document.getElementById('plan-id').value = '';
        labelEndDate.classList.add('hidden');
        modal.showModal();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('plan-id').value;
        
        let specialVal = '';
        if (cbEspecial.checked) specialVal = '1';
        else if (cbFolga.checked) specialVal = '2';
        else if (cbProva.checked) specialVal = '3';

        const planData = {
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
            if (id) {
                const { error } = await supabase.from('planner').update(planData).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('planner').insert([planData]);
                if (error) throw error;
            }
            modal.close();
            loadPlanner();
        } catch (err) {
            console.error('Erro ao salvar planejamento:', err);
            alert('Erro ao salvar planejamento.');
        }
    });

    // Pesquisa no planner
    if (searchInput && resultsContainer) {
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) {
                resultsContainer.classList.add('hidden');
                return;
            }

            resultsContainer.innerHTML = '<div class="search-item">Buscando...</div>';
            resultsContainer.classList.remove('hidden');

            try {
                const { data } = await supabase.from('planner')
                    .select('*')
                    .or(`date.ilike.%${query}%,time.ilike.%${query}%,team.ilike.%${query}%,serie.ilike.%${query}%`)
                    .limit(5);

                let html = '';
                if (data && data.length) {
                    data.forEach(p => {
                        html += `<div class="search-item" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border);" data-id="${p.id}">
                            <strong>${p.serie} ${p.team}</strong> - ${p.date} (${p.time})
                        </div>`;
                    });
                } else {
                    html = '<div class="search-item" style="padding: 8px 12px;">Nenhum planejamento encontrado.</div>';
                }
                resultsContainer.innerHTML = html;

                resultsContainer.querySelectorAll('.search-item[data-id]').forEach(item => {
                    item.addEventListener('click', () => {
                        const planId = item.dataset.id;
                        resultsContainer.classList.add('hidden');
                        searchInput.value = '';
                        editPlannerById(planId);
                    });
                });
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

    loadPlanner();
}

async function loadPlanner() {
    const container = document.getElementById('planner-list');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Carregando planejamentos...</div>';

    try {
        const { data, error } = await supabase.from('planner').select('*').order('id', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhuma aula planejada cadastrada.</div>';
            return;
        }

        let html = '';
        data.forEach(p => {
            let borderColor = 'var(--border)';
            let bgCard = 'var(--bg-card)';
            let badgeText = '';
            let badgeBg = '';

            if (p.special === '1') {
                borderColor = '#eab308';
                bgCard = 'rgba(234, 179, 8, 0.05)';
                badgeText = 'Especial';
                badgeBg = '#eab308';
            } else if (p.special === '2') {
                borderColor = '#ef4444';
                bgCard = 'rgba(239, 68, 68, 0.05)';
                badgeText = 'Folga';
                badgeBg = '#ef4444';
            } else if (p.special === '3') {
                borderColor = '#f97316'; // Laranja para Prova
                bgCard = 'rgba(249, 115, 22, 0.05)';
                badgeText = 'Prova';
                badgeBg = '#f97316';
            }

            html += `<div class="card" style="border: 1px solid ${borderColor}; background: ${bgCard}; padding: 20px; border-radius: 10px; position: relative; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">`;
            
            if (badgeText) {
                html += `<span style="position: absolute; top: 15px; right: 15px; background: ${badgeBg}; color: ${p.special === '1' ? '#000' : '#fff'}; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">${badgeText}</span>`;
            }

            html += `<h3 style="margin-bottom: 10px; color: var(--primary);">${p.serie || ''} - ${p.team || ''}</h3>
                <p style="margin: 4px 0;"><strong>Dia:</strong> ${p.day || ''} | <strong>Data:</strong> ${p.date || ''} | <strong>Hora:</strong> ${p.time || ''}</p>
                <p style="margin: 4px 0;"><strong>Duração:</strong> ${p.duration || 'N/A'}</p>
                <p style="margin: 8px 0 4px 0;"><strong>Habilidades BNCC:</strong></p>
                <p style="margin: 0 0 8px 0; font-size: 0.9rem; color: var(--text-muted);">${p.skills || 'Nenhuma'}</p>
                <p style="margin: 8px 0 4px 0;"><strong>Atividades:</strong></p>
                <p style="margin: 0 0 15px 0; white-space: pre-wrap; font-size: 0.9rem;">${p.activities || ''}</p>
                
                <div style="display: flex; gap: 10px;">
                    <button class="btn-secondary btn-edit" data-id="${p.id}" style="padding: 6px 12px; font-size: 0.85rem;">Editar</button>
                    <button class="btn-danger btn-delete" data-id="${p.id}" style="padding: 6px 12px; font-size: 0.85rem;">Excluir</button>
                </div>
            </div>`;
        });

        container.innerHTML = html;

        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                await editPlannerById(id);
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (confirm('Tem certeza que deseja excluir este planejamento?')) {
                    const { error } = await supabase.from('planner').delete().eq('id', id);
                    if (!error) loadPlanner();
                    else alert('Erro ao excluir planejamento.');
                }
            });
        });

    } catch (err) {
        console.error('Erro ao carregar planejamentos:', err);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">Erro ao carregar planejamentos.</div>';
    }
}

async function editPlannerById(id) {
    const modal = document.getElementById('planner-modal');
    const cbEspecial = document.getElementById('cb-especial');
    const cbFolga = document.getElementById('cb-folga');
    const cbProva = document.getElementById('cb-prova');
    const labelEndDate = document.getElementById('label-end-date');

    try {
        const { data, error } = await supabase.from('planner').select('*').eq('id', id).single();
        if (error) throw error;
        if (!data) return;

        document.getElementById('planner-modal-title').textContent = 'Editar Aula';
        document.getElementById('plan-id').value = data.id;
        document.getElementById('plan-day').value = data.day || '';
        document.getElementById('plan-date').value = data.date || '';
        document.getElementById('plan-time').value = data.time || '';
        document.getElementById('plan-serie').value = data.serie || '';
        document.getElementById('plan-team').value = data.team || '';
        document.getElementById('plan-duration').value = data.duration || '';
        document.getElementById('plan-skills').value = data.skills || '';
        document.getElementById('plan-activities').value = data.activities || '';

        cbEspecial.checked = (data.special === '1');
        cbFolga.checked = (data.special === '2');
        cbProva.checked = (data.special === '3');

        if (cbProva.checked) {
            labelEndDate.classList.remove('hidden');
        } else {
            labelEndDate.classList.add('hidden');
            document.getElementById('plan-end-date').value = '';
        }

        modal.showModal();
    } catch (err) {
        console.error('Erro ao buscar planejamento para edição:', err);
    }
}
