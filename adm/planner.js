import { supabase } from '../supabaseClient.js';

export function initPlanner() {
    loadPlanners();

    // Lógica das Caixas de Seleção e Obrigatoriedade
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

    // Abrir Modal
    document.getElementById('btn-add-plan').addEventListener('click', () => {
        document.getElementById('planner-form').reset();
        document.getElementById('plan-id').value = '';
        ['cb-especial', 'cb-folga', 'cb-prova'].forEach(id => document.getElementById(id).checked = false);
        updateRequiredFields();
        document.getElementById('planner-modal-title').textContent = 'Adicionar Aula';
        document.getElementById('planner-modal').showModal();
    });

    // Salvar Dados
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

        let result;
        if (specialValue === 3 && !id) {
            // Lógica de Múltiplos Dias para PROVA usando puramente TEXTO SIMPLES e conversão de dias inteiros
            const endDateStr = document.getElementById('plan-end-date').value; // Ex: '2026-09-25' ou '25/09/2026'
            const startDateStr = planData.date; // Ex: '21/09/2026'

            // Função puramente textual/matemática para evitar fuso horário
            const dateToDays = (dStr) => {
                if (!dStr) return 0;
                let p = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
                let y = parseInt(p[2].length === 4 ? p[2] : p[0]);
                let m = parseInt(p[1]) - 1;
                let d = parseInt(p[2].length === 4 ? p[0] : p[2]);
                return Math.floor(new Date(y, m, d).getTime() / (1000 * 60 * 60 * 24));
            };

            const daysToDateBR = (totalDays) => {
                let dateObj = new Date(totalDays * 1000 * 60 * 60 * 24);
                let d = String(dateObj.getDate()).padStart(2, '0');
                let m = String(dateObj.getMonth() + 1).padStart(2, '0');
                let y = dateObj.getFullYear();
                return `${d}/${m}/${y}`;
            };

            const getDayOfWeek = (dStr) => {
                let p = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
                let y = parseInt(p[2].length === 4 ? p[2] : p[0]);
                let m = parseInt(p[1]) - 1;
                let d = parseInt(p[2].length === 4 ? p[0] : p[2]);
                const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
                return diasSemana[new Date(y, m, d).getDay()];
            };

            let startDays = dateToDays(startDateStr);
            let endDays = dateToDays(endDateStr);
            if (endDays < startDays) endDays = startDays;

            let inserts = [];
            for (let currentDays = startDays; currentDays <= endDays; currentDays++) {
                let formattedDate = daysToDateBR(currentDays);
                let calculatedDay = getDayOfWeek(formattedDate);

                if (currentDays === startDays) {
                    // Primeiro dia: leva todas as informações preenchidas
                    inserts.push({
                        ...planData,
                        date: formattedDate,
                        day: calculatedDay
                    });
                } else {
                    // Dias seguintes: apenas data, dia e o status de prova (texto simples e campos vazios)
                    inserts.push({
                        day: calculatedDay,
                        date: formattedDate,
                        time: '',
                        serie: '',
                        team: '',
                        skills: '',
                        activities: '',
                        duration: '',
                        special: 3
                    });
                }
            }
            result = await supabase.from('planner').insert(inserts);
        } else {
            result = id ? await supabase.from('planner').update(planData).eq('id', id) : await supabase.from('planner').insert([planData]);
        }

        if (result.error) alert('Erro ao salvar: ' + result.error.message);
        else {
            document.getElementById('planner-modal').close();
            loadPlanners();
        }
    });

    // Pesquisa Local no Planner
    const searchInput = document.getElementById('planner-search');
    const resultsContainer = document.getElementById('planner-search-results');
    
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

    container.innerHTML = Object.entries(groups).map(([title, items]) => `
        <div class="planner-section" style="margin-bottom: 24px;">
            <h3 class="planner-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; border-bottom: 2px solid #ccc; padding-bottom: 4px;">
                <span>${title}</span>
                <button class="minimize-btn" style="color:var(--text-muted);" onclick="this.parentElement.nextElementSibling.classList.toggle('hidden'); this.textContent = this.textContent === 'Minimizar' ? 'Maximizar' : 'Minimizar'">Minimizar</button>
            </h3>
            <div class="planner-section-content">
                ${items.map(p => {
                    let cardClass = p.special == 1 ? 'card-special-1' : (p.special == 2 ? 'card-special-2' : (p.special == 3 ? 'card-special-3' : ''));
                    let titleHtml = p.special == 2 ? '<p style="font-size: 1.2rem; text-transform: uppercase;"><strong>FOLGA</strong></p>' : (p.special == 3 ? '<p style="font-size: 1.2rem; text-transform: uppercase;"><strong>PROVA</strong></p>' : '');
                    
                    return `
                    <div class="data-card ${cardClass}" id="plan-card-${p.id}">
                        <div class="data-card-info">
                            <p><strong>${p.day} - ${p.date} ${p.time ? `(${p.time})` : ''}</strong> ${p.duration ? `| Duração: ${p.duration}` : ''}</p>
                            ${titleHtml}
                            ${p.serie || p.team ? `<p><strong>Turma:</strong> ${p.serie || ''} ${p.team || ''}</p>` : ''}
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
    `).join('');
}

window.editPlanner = (p) => {
    document.getElementById('plan-id').value = p.id;
    document.getElementById('plan-day').value = p.day;
    document.getElementById('plan-date').value = p.date;
    document.getElementById('plan-time').value = p.time;
    document.getElementById('plan-serie').value = p.serie;
    document.getElementById('plan-team').value = p.team;
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
