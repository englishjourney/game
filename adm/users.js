import { supabase } from '../supabaseClient.js';

export function initUsers() {
    const initialLoad = loadUsers();

    // Pesquisa Local em Usuários
    const searchInput = document.getElementById('users-search');
    const resultsContainer = document.getElementById('users-search-results');
    
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLocaleLowerCase('pt-BR');
        resultsContainer.innerHTML = '';
        if (q.length < 2) { resultsContainer.classList.add('hidden'); return; }

        let found = false;
        document.querySelectorAll('.users-table tbody tr').forEach(row => {
            const teamSection = row.closest('.team-section');
            const grade = teamSection?.querySelector('.team-grade-badge')?.textContent.trim() || '';
            const searchableText = `${row.innerText} ${grade}`.toLocaleLowerCase('pt-BR');

            if (searchableText.includes(q)) {
                found = true;
                const name = row.cells[0].innerText;
                const div = document.createElement('button');
                div.type = 'button';
                div.className = 'search-item search-result-item users-search-result';
                div.innerText = grade ? `${name} — Turma ${grade}` : name;
                div.onclick = () => {
                    const navButton = document.querySelector('.nav-btn[data-target="users-section"]');
                    if (navButton) navButton.click();
                    const teamContent = teamSection && teamSection.querySelector('.team-content');
                    const toggleButton = teamSection && teamSection.querySelector('.team-header .team-toggle');
                    if (teamContent) teamContent.classList.remove('hidden');
                    if (toggleButton) {
                        toggleButton.setAttribute('aria-expanded', 'true');
                        toggleButton.setAttribute('aria-label', 'Recolher turma');
                        toggleButton.title = 'Recolher turma';
                        toggleButton.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
                    }
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.classList.add('search-result-highlight');
                    setTimeout(() => row.classList.remove('search-result-highlight'), 3000);
                    resultsContainer.classList.add('hidden');
                    searchInput.value = '';
                };
                resultsContainer.appendChild(div);
            }
        });
        resultsContainer.classList.toggle('hidden', !found);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#users-search') && !e.target.closest('#users-search-results')) {
            resultsContainer.classList.add('hidden');
        }
    });
    return initialLoad;
}

async function loadUsers() {
    const container = document.getElementById('users-container');
    
    // CORREÇÃO: Verifica se o contêiner existe antes de tentar alterar o HTML
    if (!container) {
        console.error("Erro: O elemento com ID 'users-container' não foi encontrado no HTML.");
        return; // Para a função aqui e evita a tela em branco
    }

    container.innerHTML = 'Carregando alunos...';

    const { data, error } = await supabase
        .from('users')
        .select('id, name, username, score, class, rank, grade, stars, hearts, nota1, nota2, nota3, nota4')
        .neq('username', 'micael.svg')
        .order('grade', { ascending: true })
        .order('name', { ascending: true });

    if (error) return container.innerHTML = 'Erro ao carregar alunos.';
    const teams = {};
    data.forEach(u => {
        let groupName = u.grade ? String(u.grade).trim().toUpperCase() : 'Sem Turma';
        if (!teams[groupName]) teams[groupName] = [];
        teams[groupName].push(u);
    });

    let html = '';
    for (const [team, users] of Object.entries(teams)) {
        html += `
        <div class="team-section">
            <div class="team-header">
                <div class="team-heading">
                    <span class="team-heading-label">Turma</span>
                    <strong class="team-grade-badge">${team}</strong>
                    <span class="team-student-count">${users.length} ${users.length === 1 ? 'aluno' : 'alunos'}</span>
                </div>
                <button type="button" class="minimize-btn team-toggle" aria-label="Expandir turma" title="Expandir turma" aria-expanded="false"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
            </div>
            <div class="team-content hidden" style="overflow-x: auto;">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Nome</th><th>Username</th><th>Class/Rank</th><th>Score</th>
                            <th>Stars</th><th>Hearts</th><th>Bim 1</th><th>Bim 2</th>
                            <th>Bim 3</th><th>Bim 4</th><th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr id="row-${u.id}">
                                <td>${u.name}</td><td>${u.username}</td>
                                <td>${u.class || '-'} <br> <small>${u.rank || '-'}</small></td>
                                <td>${u.score || 0}</td>
                                <td><input type="number" class="editable-input" id="stars-${u.id}" value="${u.stars || 0}"></td>
                                <td><input type="number" class="editable-input" id="hearts-${u.id}" value="${u.hearts || 0}"></td>
                                <td><input type="number" step="0.1" class="editable-input" id="n1-${u.id}" value="${u.nota1 || ''}"></td>
                                <td><input type="number" step="0.1" class="editable-input" id="n2-${u.id}" value="${u.nota2 || ''}"></td>
                                <td><input type="number" step="0.1" class="editable-input" id="n3-${u.id}" value="${u.nota3 || ''}"></td>
                                <td><input type="number" step="0.1" class="editable-input" id="n4-${u.id}" value="${u.nota4 || ''}"></td>
                                <td><button class="btn-small btn-primary" onclick="window.saveUser('${u.id}')">Salvar</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }
    container.innerHTML = html;
    container.querySelectorAll('.team-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.closest('.team-header').nextElementSibling;
            const collapsed = content.classList.toggle('hidden');
            button.setAttribute('aria-expanded', String(!collapsed));
            button.setAttribute('aria-label', collapsed ? 'Expandir turma' : 'Recolher turma');
            button.title = collapsed ? 'Expandir turma' : 'Recolher turma';
            button.innerHTML = '<i class="fa-solid ' + (collapsed ? 'fa-chevron-down' : 'fa-chevron-up') + '" aria-hidden="true"></i>';
        });
    });
}

window.saveUser = async (id) => {
    const updates = {
        stars: parseInt(document.getElementById(`stars-${id}`).value) || 0,
        hearts: parseInt(document.getElementById(`hearts-${id}`).value) || 0,
        nota1: parseFloat(document.getElementById(`n1-${id}`).value) || null,
        nota2: parseFloat(document.getElementById(`n2-${id}`).value) || null,
        nota3: parseFloat(document.getElementById(`n3-${id}`).value) || null,
        nota4: parseFloat(document.getElementById(`n4-${id}`).value) || null
    };

    const { error } = await supabase.from('users').update(updates).eq('id', id);
    if (error) {
        alert('Erro ao salvar: ' + error.message);
    } else {
        const btn = document.querySelector(`#row-${id} button`);
        const originalText = btn.textContent;
        btn.textContent = 'Salvo!';
        btn.style.background = 'var(--success)';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }
};
