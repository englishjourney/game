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

async function setupDashboard() {
    const searchInput = document.getElementById('global-search');
    const resultsContainer = document.getElementById('search-results');

    if (!searchInput || !resultsContainer) {
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

    // REMOVIDO: o .single() quebrava a lógica e deixava o painel vazio se houvessem múltiplos (ou nenhum) registros. 
    // CORRIGIDO: usando apenas .limit(1) para buscar o primeiro sem disparar o erro nativo do supabase (PGRST116).
    const { data: rows, error } = await supabase.from('schedule').select('*').limit(1);
    if (error || !rows || rows.length === 0) {
        container.innerHTML = 'Nenhum horário encontrado.';
        return;
    }

    const data = rows[0];

    // Dias da semana para estruturar 1 cartão por dia
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

        // Se o dia não tiver informações nem de manhã nem a tarde, pula a criação do cartão
        if (!mat && !ves) return;

        html += `<div class="schedule-card" style="margin-bottom: 20px; border: 1px solid var(--border); padding: 15px; border-radius: 8px; background: var(--bg-card);">
            <h3 style="text-align: center; border-bottom: 2px solid var(--border); padding-bottom: 10px; margin-bottom: 15px; color: var(--primary);">${dia.nome}</h3>
            <div style="display: flex; flex-direction: column; gap: 15px;">`;

      // Substitua a lógica de leitura dos horários no arquivo onde o Dashboard é renderizado (provavelmente main.js ou dashboard.js):

const renderTurno = (turnoStr, turnoNome) => {
    if (!turnoStr) return '';
    
    // CORREÇÃO: Trata como texto simples, dividindo por vírgulas.
    // Isso evita que erros de digitação como [Intervalo} façam o dado sumir da tela.
    const items = turnoStr.split(',');

    let turnoHtml = `<div>
        <strong style="display: block; margin-bottom: 8px;">${turnoNome}</strong>
        <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px;">`;

    items.forEach(item => {
        let text = item.trim();
        if (!text) return;

        let bg = 'var(--bg-dark)';
        let color = 'white';
        let textLower = text.toLowerCase();

        // Localiza Vago e Intervalo independente de colchetes quebrados
        if (textLower.includes('vago')) {
            bg = '#eab308'; // Faixa Amarela
            color = 'black';
        } else if (textLower.includes('intervalo')) {
            bg = '#ef4444'; // Faixa Vermelha
            color = 'white';
        }

        // Remove colchetes ou chaves das pontas [ ou } para exibição limpa (Texto Simples)
        text = text.replace(/^[\[{(]\vert{}[\]})]$/g, '').trim();

        turnoHtml += `<li style="background-color: ${bg}; color: ${color}; padding: 8px; border-radius: 4px; text-align: center; font-weight: 500;">${text}</li>`;
    });

    turnoHtml += `</ul></div>`;
    return turnoHtml;
};

        html += renderTurno(mat, 'Manhã');
        html += renderTurno(ves, 'Tarde');
        html += `</div></div>`;
    });

    container.innerHTML = html;
}
