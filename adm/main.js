import { initAuth, isAdmLoggedIn, logout } from './auth.js';
import { initPlanner } from './planner.js';
import { initUsers } from './users.js';
import { initMissions } from './missions.js';
import { initFlashcardsAdm } from './flashcardsAdm.js';
import { supabase } from '../supabaseClient.js'; // Adjust path if necessary

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

// Global Search & Schedule
async function setupDashboard() {
    const searchInput = document.getElementById('global-search');
    const resultsContainer = document.getElementById('search-results');

    // Trava de segurança: se a barra de pesquisa global não existir nesta página, para a função aqui
    if (!searchInput || !resultsContainer) {
        // O loadSchedule precisa ser carregado mesmo que a pesquisa global não exista
        loadSchedule();
        return;
    }

    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 3) {
            resultsContainer.classList.add('hidden');
            return;
        }

        resultsContainer.innerHTML = '<div class="search-item">Buscando...</div>';
        resultsContainer.classList.remove('hidden');

        try {
            // Busca em users
            const { data: users } = await supabase.from('users').select('name, username, team').ilike('name', `%${query}%`).limit(3);
            // Busca em planner
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

    // Fechar busca ao clicar fora
    document.addEventListener('click', (e) => {
        if (e.target !== searchInput && e.target !== resultsContainer) {
            resultsContainer.classList.add('hidden');
        }
    });

    // Carregar Horários
    loadSchedule();
}

async function loadSchedule() {
    const container = document.getElementById('schedule-container');
    container.innerHTML = 'Carregando horários...';

    // Removemos o `.limit(1).single()` para poder puxar todas as rows do supabase
    const { data, error } = await supabase.from('schedule').select('*');
    if (error || !data || data.length === 0) {
        container.innerHTML = 'Nenhum horário encontrado.';
        return;
    }

    // Agrupa as rows pelo mesmo dia e data
    const grouped = data.reduce((acc, row) => {
        const dia = row.dia || row.day || '';
        const dataVal = row.data || row.date || '';
        const key = dia || dataVal ? `${dia} - ${dataVal}` : 'Outros';
        
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
    }, {});

    let html = '';
    // Monta os cards separados
    Object.keys(grouped).forEach(key => {
        const items = grouped[key];
        html += `<div class="schedule-card">
            <h3>${key}</h3>
            <ul>
                ${items.map(item => {
                    let info = [];
                    // Extrai campos padronizados caso existam na sua row (hora, turma, disciplina, etc)
                    if (item.hora || item.time) info.push(item.hora || item.time);
                    if (item.turma || item.team || item.serie) info.push(`${item.serie || ''} ${item.turma || item.team || ''}`.trim());
                    if (item.disciplina || item.activities) info.push(item.disciplina || item.activities);
                    
                    // Fallback: se os nomes das colunas da tabela "schedule" forem diferentes, lista o resto dos valores presentes
                    if (info.length === 0) {
                        Object.keys(item).forEach(k => {
                            if (k !== 'id' && k !== 'dia' && k !== 'data' && k !== 'day' && k !== 'date' && item[k]) {
                                info.push(item[k]);
                            }
                        });
                    }
                    return `<li>${info.join(' | ')}</li>`;
                }).join('')}
            </ul>
        </div>`;
    });

    container.innerHTML = html;
}
