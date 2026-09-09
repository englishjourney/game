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

    if (!searchInput || !resultsContainer) return;

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

    loadSchedule();
}

async function loadSchedule() {
    const container = document.getElementById('schedule-container');
    container.innerHTML = 'Carregando horários...';

    const { data: rows, error } = await supabase.from('schedule').select('*');
    
    if (error || !rows || rows.length === 0) {
        container.innerHTML = 'Nenhum horário encontrado na base de dados.';
        return;
    }

    // Pega a linha que efetivamente possui algum dia preenchido
    const data = rows.find(r => r.seg_mat || r.seg_ves || r.ter_mat || r.ter_ves) || rows[0];

    const dias = [
        { id: 'seg', nome: 'Segunda-feira' },
        { id: 'ter', nome: 'Terça-feira' },
        { id: 'qua', nome: 'Quarta-feira' },
        { id: 'qui', nome: 'Quinta-feira' },
        { id: 'sex', nome: 'Sexta-feira' }
    ];

    let html = '';
    
    dias.forEach(dia => {
        const mat = data[`${dia.id}_mat`];
        const ves = data[`${dia.id}_ves`];

        if (!mat && !ves) return; // Pula dias 100% vazios

        // Container unificado para o Dia (Manhã e Tarde na mesma tabela/cartão)
        html += `<div class="schedule-card" style="margin-bottom: 20px; border: 1px solid var(--border); padding: 20px; border-radius: 8px; background: var(--bg-card); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h3 style="text-align: center; border-bottom: 2px solid var(--border); padding-bottom: 10px; margin-bottom: 20px; color: var(--primary); font-size: 1.4rem;">${dia.nome}</h3>
            <div style="display: grid; grid-template-columns: ${mat && ves ? '1fr 1fr' : '1fr'}; gap: 20px;">`;

        const renderTurno = (turnoStr, turnoNome) => {
            if (!turnoStr || turnoStr.trim() === '') return '';
            
            // Extrai as matérias isolando o que está entre chaves (ou quebra por vírgula se n for possível)
            const items = turnoStr.match(/\[.*?\]/g) || turnoStr.split(',');

            let turnoHtml = `<div style="background: var(--bg-dark); padding: 15px; border-radius: 8px;">
                <strong style="display: block; margin-bottom: 12px; text-align: center; color: var(--primary); font-size: 1.1rem;">${turnoNome}</strong>
                <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">`;

            items.forEach(item => {
                // Remove os colchetes para exibir só o texto
                let text = item.trim().replace(/^\[|\]$/g, '');
                if (!text) return;

                let bg = 'rgba(255, 255, 255, 0.05)';
                let color = 'white';

                // Aplica cores baseadas no texto simples
                if (text.toLowerCase().includes('vago')) {
                    bg = '#eab308'; // Amarelo
                    color = 'black';
                } else if (text.toLowerCase().includes('intervalo')) {
                    bg = '#ef4444'; // Vermelho
                    color = 'white';
                }

                turnoHtml += `<li style="background-color: ${bg}; color: ${color}; padding: 10px; border-radius: 6px; text-align: center; font-weight: 500; border: 1px solid rgba(255,255,255,0.1);">${text}</li>`;
            });

            turnoHtml += `</ul></div>`;
            return turnoHtml;
        };

        if (mat) html += renderTurno(mat, 'Manhã');
        if (ves) html += renderTurno(ves, 'Tarde');
        
        html += `</div></div>`;
    });

    container.innerHTML = html;
}
