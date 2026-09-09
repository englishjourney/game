import { initAuth, isAdmLoggedIn, logout } from './auth.js';
import { initPlanner } from './planner.js';
import { initUsers } from './users.js';
import { initMissions } from './missions.js';
import { initFlashcardsAdm } from './flashcardsAdm.js';
import { supabase } from '../supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const loggedIn = await isAdmLoggedIn();
    if (!loggedIn) {
        initAuth();
    } else {
        showAdmPanel();
    }
});

export function showAdmPanel() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('adm-panel').classList.remove('hidden');
    
    setupNavigation();
    setupDashboard();
    initPlanner();
    initUsers();
    initMissions();
    initFlashcardsAdm();
    
    document.getElementById('btn-logout').addEventListener('click', logout);
}

function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.content-section');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.add('hidden'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.remove('hidden');
        });
    });
}

async function setupDashboard() {
    const searchInput = document.getElementById('global-search');
    const resultsContainer = document.getElementById('search-results');

    if (searchInput && resultsContainer) {
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (query.length < 3) {
                resultsContainer.classList.add('hidden');
                return;
            }

            resultsContainer.innerHTML = '<div class="search-item">Buscando...</div>';
            resultsContainer.classList.remove('hidden');

            try {
                const { data: users } = await supabase.from('users').select('name, username, team').ilike('name', `%${query}%`).limit(3);
                const { data: planners } = await supabase.from('planner').select('serie, team, activities').ilike('activities', `%${query}%`).limit(3);

                let html = '';
                if (users && users.length) {
                    html += '<div style="padding: 5px 10px; color: var(--primary); font-size: 0.8em">Alunos</div>';
                    users.forEach(u => html += `<div class="search-item">${u.name} (${u.username}) - ${u.team}</div>`);
                }
                if (planners && planners.length) {
                    html += '<div style="padding: 5px 10px; color: var(--primary); font-size: 0.8em">Planejamentos</div>';
                    planners.forEach(p => html += `<div class="search-item">${p.serie} ${p.team}: ${p.activities.substring(0,30)}...</div>`);
                }

                if (!html) html = '<div class="search-item">Nenhum resultado.</div>';
                resultsContainer.innerHTML = html;
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

    // Garante o carregamento dos horários do Supabase no Dashboard
    await loadSchedule();
}

async function loadSchedule() {
    const container = document.getElementById('schedule-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Carregando horários semanais...</div>';

    try {
        const { data: rows, error } = await supabase.from('schedule').select('*');
        
        if (error) throw error;
        
        if (!rows || rows.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum horário encontrado na tabela "schedule".</div>';
            return;
        }

        // Pega a linha preenchida ou a primeira linha da tabela
        const data = rows.find(r => r.seg_mat || r.seg_ves || r.ter_mat || r.ter_ves || r.qua_mat || r.qua_ves) || rows[0];

        const dias = [
            { id: 'seg', nome: 'Segunda-Feira' },
            { id: 'ter', nome: 'Terça-Feira' },
            { id: 'qua', nome: 'Quarta-Feira' },
            { id: 'qui', nome: 'Quinta-Feira' },
            { id: 'sex', nome: 'Sexta-Feira' }
        ];

        let html = '';
        
        dias.forEach(dia => {
            const mat = data[`${dia.id}_mat`];
            const ves = data[`${dia.id}_ves`];

            // Se o dia inteiro estiver totalmente vazio, pula
            if (!mat && !ves) return;

            // Card principal do dia da semana
            html += `<div class="schedule-card" style="margin-bottom: 25px; border: 1px solid var(--border); padding: 20px; border-radius: 10px; background: var(--bg-card); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h3 style="text-align: center; border-bottom: 2px solid var(--border); padding-bottom: 12px; margin-bottom: 20px; color: var(--primary); font-size: 1.4rem;">${dia.nome}</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">`;

            const renderTurno = (turnoStr, turnoNome) => {
                let turnoHtml = `<div style="background: var(--bg-dark); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column;">
                    <strong style="display: block; margin-bottom: 12px; text-align: center; color: var(--primary); font-size: 1.1rem; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 6px;">${turnoNome}</strong>`;

                // Se a coluna estiver totalmente vazia, exibe "Sem horários"
                if (!turnoStr || turnoStr.trim() === '') {
                    turnoHtml += `<div style="text-align: center; padding: 20px; color: #888; font-style: italic; margin: auto;">Sem horários</div></div>`;
                    return turnoHtml;
                }
                
                // Quebra o texto por vírgulas e remove colchetes e espaços extras
                const items = turnoStr.split(',').map(item => item.replace(/[\[\]]/g, '').trim()).filter(item => item !== '');

                if (items.length === 0) {
                    turnoHtml += `<div style="text-align: center; padding: 20px; color: #888; font-style: italic; margin: auto;">Sem horários</div></div>`;
                    return turnoHtml;
                }

                turnoHtml += `<ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">`;

                items.forEach(text => {
                    let bg = 'rgba(255, 255, 255, 0.05)';
                    let color = 'white';
                    let borderColor = 'rgba(255,255,255,0.1)';

                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('vago')) {
                        bg = '#eab308'; // Amarelo
                        color = '#000';
                        borderColor = '#ca8a04';
                    } else if (lowerText.includes('intervalo')) {
                        bg = '#ef4444'; // Vermelho
                        color = '#fff';
                        borderColor = '#b91c1c';
                    }

                    turnoHtml += `<li style="background-color: ${bg}; color: ${color}; padding: 10px; border-radius: 6px; text-align: center; font-weight: 500; border: 1px solid ${borderColor};">${text}</li>`;
                });

                turnoHtml += `</ul></div>`;
                return turnoHtml;
            };

            // Renderiza as seções Matutino e Vespertino lado a lado
            html += renderTurno(mat, 'Matutino');
            html += renderTurno(ves, 'Vespertino');
            
            html += `</div></div>`;
        });

        if (!html) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum dia da semana cadastrado possui horários preenchidos.</div>';
            return;
        }

        container.innerHTML = html;
    } catch (err) {
        console.error("Erro ao carregar horários do schedule:", err);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">Erro ao carregar os horários. Verifique a conexão com o Supabase e a tabela "schedule".</div>';
    }
}
