// missions.js
import { supabase } from '../supabaseClient.js';

export function initMissions() {
    loadMissions();

    // Botão de adicionar missão
    document.getElementById('btn-add-mission').addEventListener('click', () => {
        document.getElementById('mission-form').reset();
        document.getElementById('mission-id').value = '';
        document.getElementById('mission-modal-title').textContent = 'Adicionar Missão';
        document.getElementById('mission-modal').showModal();
    });

    // Salvar missão (Criar ou Editar)
    document.getElementById('mission-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('mission-id').value;
        const missionData = {
            mission_name: document.getElementById('mission-name').value,
            mission_link: document.getElementById('mission-link').value,
            mission_score: parseInt(document.getElementById('mission-score').value) || 0
        };

        let result;
        if (id) {
            // Se tem ID, apenas atualiza o nome, link e score
            result = await supabase.from('missions').update(missionData).eq('id', id);
        } else {
            // Se é nova missão, define como não concluída e não falha por padrão
            missionData.done = false;
            missionData.fail = false;
            result = await supabase.from('missions').insert([missionData]);
        }

        if (result.error) {
            alert('Erro ao salvar missão: ' + result.error.message);
        } else {
            document.getElementById('mission-modal').close();
            loadMissions();
        }
    });
}

// Carregar lista de missões
async function loadMissions() {
    const container = document.getElementById('missions-list');
    container.innerHTML = 'Carregando...';

    const { data, error } = await supabase.from('missions').select('*').order('id', { ascending: false });
    
    if (error) {
        container.innerHTML = 'Erro ao carregar missões.';
        return;
    }

    if (!data || !data.length) {
        container.innerHTML = 'Nenhuma missão encontrada.';
        return;
    }

    container.innerHTML = data.map(m => `
        <div class="data-card" style="${m.done ? 'border-left: 4px solid var(--success);' : m.fail ? 'border-left: 4px solid var(--danger);' : ''}">
            <div class="data-card-info">
                <p><strong>${m.mission_name}</strong></p>
                <p>Score: ${m.mission_score} | Link: ${m.mission_link || 'Nenhum'}</p>
                <p>Status: ${m.done ? '<span style="color:var(--success)">Concluída</span>' : m.fail ? '<span style="color:var(--danger)">Falhou</span>' : 'Pendente'}</p>
            </div>
            <div class="data-card-actions">
                <button class="btn-small btn-secondary" onclick='window.editMission(${JSON.stringify(m).replace(/'/g, "&#39;")})'>Editar</button>
            </div>
        </div>
    `).join('');
}

// Função global para abrir modal de edição
window.editMission = (m) => {
    document.getElementById('mission-id').value = m.id;
    document.getElementById('mission-name').value = m.mission_name || '';
    document.getElementById('mission-link').value = m.mission_link || '';
    document.getElementById('mission-score').value = m.mission_score || 0;
    
    document.getElementById('mission-modal-title').textContent = 'Editar Missão';
    document.getElementById('mission-modal').showModal();
};
