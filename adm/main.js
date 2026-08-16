import { initAuth, isAdmLoggedIn, logout } from './auth.js';
import { initPlanner } from './planner.js';
import { initUsers } from './users.js';
import { initMissions } from './missions.js';
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

    const { data, error } = await supabase.from('schedule').select('*').limit(1).single();
    if (error || !data) {
        container.innerHTML = 'Nenhum horário encontrado.';
        return;
    }

    // Filtra apenas colunas que terminam com _mat ou _ves
    const columns = Object.keys(data).filter(k => k.includes('_mat') || k.includes('_ves'));
    
    // Organiza para mostrar (poderia ser ordenado baseado na data atual, mas faremos simples)
    let html = '';
    columns.forEach(col => {
        if (!data[col]) return;
        const items = data[col].replace(/[\[\]]/g, '').split(',');
        
        const friendlyName = col.replace('_mat', ' - Manhã').replace('_ves', ' - Tarde').toUpperCase();
        
        html += `<div class="schedule-card">
            <h3>${friendlyName}</h3>
            <ul>
                ${items.map(item => `<li>${item.trim()}</li>`).join('')}
            </ul>
        </div>`;
    });

    container.innerHTML = html;
}
