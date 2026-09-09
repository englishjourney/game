import { supabase } from '../supabaseClient.js';

export function initPlanner() {
    loadPlanners();

    const updateRequiredFields = () => {
        const isEsp = document.getElementById('cb-especial').checked;
        const isFlg = document.getElementById('cb-folga').checked;
        const isPrv = document.getElementById('cb-prova').checked;
        
        document.getElementById('plan-time').required = !(isEsp || isFlg || isPrv);
        document.getElementById('plan-serie').required = !(isEsp || isFlg || isPrv);
        document.getElementById('plan-team').required = !(isEsp || isFlg || isPrv);
        document.getElementById('plan-activities').required = !(isFlg || isPrv);
        document.getElementById('plan-end-date').required = isPrv; // Visualmente requerido se for prova
        
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

    document.getElementById('btn-add-plan').addEventListener('click', () => {
        document.getElementById('planner-form').reset();
        document.getElementById('plan-id').value = '';
        ['cb-especial', 'cb-folga', 'cb-prova'].forEach(id => document.getElementById(id).checked = false);
        updateRequiredFields();
        document.getElementById('planner-modal-title').textContent = 'Adicionar Aula';
        document.getElementById('planner-modal').showModal();
    });

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
            // CORRIGIDO: Parser robusto e seguro de datas
            const parseDateBR = (dStr) => {
                if (!dStr) return null;
                const p = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
                if (p.length !== 3) return null;
                
                let day, month, year;
                if (p[2].length >= 4) { // DD/MM/YYYY
                    day = p[0]; month = p[1]; year = p[2];
                } else if (p[0].length >= 4) { // YYYY/MM/DD
                    year = p[0]; month = p[1]; day = p[2];
                } else { // DD/MM/YY
                    day = p[0]; month = p[1]; year = '20' + p[2];
                }
                return new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T12:00:00`);
            };

            const endDate = document.getElementById('plan-end-date').value;
            let start = parseDateBR(planData.date);
            // Fallback: se data final estiver em branco, usa a data inicial
            let end = parseDateBR(endDate) || new Date(start); 

            if (!start || isNaN(start.getTime()) || isNaN(end.getTime())) {
                alert('Data inicial ou final inválida. Verifique os dados inseridos.');
                return;
            }

            const formatDateBR = (d) => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
            const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
            
            let inserts = [];
            
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                // Todos os campos zerados, exceto data, dia, specia: 3, e o título visual em 'activities'
                inserts.push({
                    day: diasSemana[d.getDay()],
                    date: formatDateBR(new Date(d)),
                    time: '',
                    serie: '',
                    team: '',
                    skills: '',
                    activities: 'Prova', // Insere título nas atividades para garantir legibilidade
                    duration: '',
                    special: 3
                });
            }
            result = await supabase.from('planner').insert(inserts);
        } else {
            result = id ? await supabase.from('planner').update(planData).eq('id', id) : await supabase.from('planner').insert([planData]);
        }

        if (result.error) {
            alert('Erro ao salvar: ' + result.error.message);
        } else {
            document.getElementById('planner-modal').close();
            loadPlanners();
        }
    });

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

    // CORRIGIDO: parse seguro na ordenação, evitando crash com datas inválidas do banco
    data.sort((a, b) => {
        const parseDateTime = (dateStr, timeStr) => {
            if (!dateStr) return 0;
            let parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
            let year = parts[2].length >= 4 ? parts[2] : (parts[0].length >= 4 ? parts[0] : '20'+parts[2]);
            let month = parts[1].padStart(2, '0');
            let day = (parts[2].length >= 4 ? parts[0] : parts[2]).padStart(2, '0');
            
            let time = timeStr ? timeStr.trim() : '00:00';
            if (time.length === 4) time = '0' + time;
            
            return new Date(`${year}-${month}-${day}T${time}:00`).getTime();
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
        <div class="planner-section" style="margin-bottom: 24px; background: var(--bg-card); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
            <h3 class="planner-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px; border-bottom: 2px solid var(--border); padding-bottom: 8px;">
                <span style="color: var(--primary); font-size: 1.2rem;">${title}</span>
                <button class="minimize-btn" style="background: none; border: 1px solid var(--border); color: var(--text-muted); padding: 4px 10px; border-radius: 4px; cursor: pointer;" onclick="this.parentElement.nextElementSibling.classList.toggle('hidden'); this.textContent = this.textContent === 'Minimizar' ? 'Maximizar' : 'Minimizar'">Minimizar</button>
            </h3>
            <div class="planner-section-content" style="display: flex; flex-direction: column; gap: 15px;">
                ${items.map(p => {
                    let cardClass = p.special == 1 ? 'card-special-1' : (p.special == 2 ? 'card-special-2' : (p.special == 3 ? 'card-special-3' : ''));
                    let titleHtml = p.special == 2 ? '<p style="font-size: 1.2rem; text-transform: uppercase; color: #3b82f6;"><strong>FOLGA</strong></p>' : (p.special == 3 ? '<p style="font-size: 1.2rem; text-transform: uppercase; color: #ef4444;"><strong>PROVA</strong></p>' : '');
                    
                    return `
                    <div class="data-card ${cardClass}" id="plan-card-${p.id}" style="padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; border-left: 4px solid ${p.special == 3 ? '#ef4444' : 'var(--primary)'}; display: flex; justify-content: space-between; align-items: center;">
                        <div class="data-card-info" style="flex: 1;">
                            <p style="margin-bottom: 5px;"><strong>${p.time ? `🕒 ${p.time}` : ''}</strong> ${p.duration ? `| ⏱ ${p.duration}` : ''}</p>
                            ${titleHtml}
                            ${p.serie || p.team ? `<p style="margin-bottom: 5px;"><strong>Turma:</strong> ${p.serie || ''} ${p.team || ''}</p>` : ''}
                            ${p.activities && p.special != 3 ? `<p style="margin-bottom: 5px;"><strong>Atividades:</strong> ${p.activities}</p>` : ''}
                            ${p.skills ? `<p style="margin-bottom: 5px;"><strong>BNCC:</strong> ${p.skills}</p>` : ''}
                        </div>
                        <div class="data-card-actions" style="display: flex; flex-direction: column; gap: 8px;">
                            <button class="btn-small btn-secondary" onclick='window.editPlanner(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Editar</button>
                            <button class="btn-small" style="background-color: #ff4444; color: white; border: none; cursor: pointer;" onclick='window.deletePlanner("${p.id}")'>Excluir</button>
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
