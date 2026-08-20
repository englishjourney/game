import { supabase } from '../supabaseClient.js';

export function initPlanner() {
    loadPlanners();

    document.getElementById('btn-add-plan').addEventListener('click', () => {
        document.getElementById('planner-form').reset();
        document.getElementById('plan-id').value = '';
        document.getElementById('planner-modal-title').textContent = 'Adicionar Aula';
        document.getElementById('planner-modal').showModal();
    });

    document.getElementById('planner-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('plan-id').value;
        const planData = {
            day: document.getElementById('plan-day').value,
            date: document.getElementById('plan-date').value,
            time: document.getElementById('plan-time').value,
            serie: document.getElementById('plan-serie').value,
            team: document.getElementById('plan-team').value,
            skills: document.getElementById('plan-skills').value,
            activities: document.getElementById('plan-activities').value,
            duration: document.getElementById('plan-duration').value
        };

        let result;
        if (id) {
            result = await supabase.from('planner').update(planData).eq('id', id);
        } else {
            result = await supabase.from('planner').insert([planData]);
        }

        if (result.error) {
            alert('Erro ao salvar: ' + result.error.message);
        } else {
            document.getElementById('planner-modal').close();
            loadPlanners();
        }
    });
}

async function loadPlanners() {
    const container = document.getElementById('planner-list');
    container.innerHTML = 'Carregando...';

    const { data, error } = await supabase.from('planner').select('*').order('id', { ascending: false });
    
    if (error) {
        container.innerHTML = 'Erro ao carregar planos.';
        return;
    }

    if (!data.length) {
        container.innerHTML = 'Nenhuma aula planejada.';
        return;
    }

    // Ordena as aulas por data e hora em ordem crescente (mais próximas primeiro)
    data.sort((a, b) => {
        const parseDateTime = (dateStr, timeStr) => {
            if (!dateStr) return 0;
            let year, month, day;
            
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts[2].length === 4) { year = parts[2]; month = parts[1]; day = parts[0]; }
                else { year = parts[0]; month = parts[1]; day = parts[2]; }
            } else if (dateStr.includes('-')) {
                const parts = dateStr.split('-');
                if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; }
                else { year = parts[2]; month = parts[1]; day = parts[0]; }
            } else {
                return 0; 
            }

            const time = timeStr || '00:00';
            return new Date(`${year}/${month}/${day} ${time}`).getTime();
        };

        return parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time);
    });

    // Agrupa as aulas por data/dia da semana
    const groups = data.reduce((acc, item) => {
        const title = item.day ? `${item.day} - ${item.date}` : item.date;
        if (!acc[title]) {
            acc[title] = [];
        }
        acc[title].push(item);
        return acc;
    }, {});

    // Renderiza as seções agrupadas com seus respectivos títulos
    container.innerHTML = Object.entries(groups).map(([title, items]) => `
        <div class="planner-section" style="margin-bottom: 24px;">
            <h3 class="planner-section-title" style="margin-bottom: 12px; border-bottom: 2px solid #ccc; padding-bottom: 4px;">${title}</h3>
            ${items.map(p => `
                <div class="data-card">
                    <div class="data-card-info">
                        <p><strong>${p.day} - ${p.date} (${p.time})</strong> | Duração: ${p.duration}</p>
                        <p><strong>Turma:</strong> ${p.serie} ${p.team}</p>
                        <p><strong>Atividades:</strong> ${p.activities}</p>
                        ${p.skills ? `<p><strong>BNCC:</strong> ${p.skills}</p>` : ''}
                    </div>
                    <div class="data-card-actions">
                        <button class="btn-small btn-secondary" onclick='window.editPlanner(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Editar</button>
                        <!-- BOTÃO EXCLUIR ADICIONADO AQUI -->
                        <button class="btn-small" style="background-color: #ff4444; color: white; border: none;" onclick='window.deletePlanner("${p.id}")'>Excluir</button>
                    </div>
                </div>
            `).join('')}
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
    
    document.getElementById('planner-modal-title').textContent = 'Editar Aula';
    document.getElementById('planner-modal').showModal();
};

// FUNÇÃO DE EXCLUSÃO ADICIONADA AQUI
window.deletePlanner = async (id) => {
    // Confirmação para evitar exclusões acidentais
    if (!confirm('Tem certeza que deseja excluir esta aula? Esta ação não pode ser desfeita.')) {
        return; 
    }

    // Exclui a linha do Supabase usando o ID
    const { error } = await supabase.from('planner').delete().eq('id', id);

    if (error) {
        alert('Erro ao excluir a aula: ' + error.message);
    } else {
        // Recarrega a lista para mostrar a exclusão na hora
        loadPlanners();
    }
};
