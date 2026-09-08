import { supabase } from '../supabaseClient.js';

export function initUsers() {
    loadUsers();

    // Pesquisa Local em Usuários
    const searchInput = document.getElementById('users-search');
    const resultsContainer = document.getElementById('users-search-results');
    
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        resultsContainer.innerHTML = '';
        if (q.length < 2) { resultsContainer.classList.add('hidden'); return; }
        
        let found = false;
        document.querySelectorAll('.users-table tbody tr').forEach(row => {
            if (row.innerText.toLowerCase().includes(q)) {
                found = true;
                const name = row.cells[0].innerText;
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerText = name;
                div.onclick = () => {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.style.backgroundColor = 'rgba(56, 189, 248, 0.4)';
                    setTimeout(() => row.style.backgroundColor = '', 2000);
                    resultsContainer.classList.add('hidden');
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
}

async function loadUsers() {
    const container = document.getElementById('users-container');
    container.innerHTML = 'Carregando alunos...';

    const { data, error } = await supabase
        .from('users')
        .select('id, name, username, score, class, rank, serie, team, stars, hearts, nota1, nota2, nota3, nota4')
        .neq('username', 'micael.svg')
        .order('serie', { ascending: true })
        .order('team', { ascending: true })
        .order('name', { ascending: true });

    if (error) return container.innerHTML = 'Erro ao carregar alunos.';

    const teams = {};
    data.forEach(u => {
        let groupName = (u.serie || u.team) ? `${u.serie || ''} ${u.team || ''}`.trim() : 'Sem Turma';
        if (!teams[groupName]) teams[groupName] = [];
        teams[groupName].push(u);
    });

    let html = '';
    for (const [team, users] of Object.entries(teams)) {
        html += `
        <div class="team-section">
            <div class="team-header" style="display:flex; justify-content:space-between; align-items:center;">
                <span>Turma: ${team}</span>
                <button class="minimize-btn" style="color:var(--primary);" onclick="this.parentElement.nextElementSibling.classList.toggle('hidden'); this.textContent = this.textContent === 'Minimizar' ? 'Maximizar' : 'Minimizar'">Minimizar</button>
            </div>
            <div class="team-content" style="overflow-x: auto;">
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
