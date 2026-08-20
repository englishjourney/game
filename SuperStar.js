// SuperStar.js
import { supabase } from './supabaseClient.js';
import { runWithLoader } from './loader.js';
import { openProfileCard } from './profileCard.js';

// Função auxiliar para sanitizar e converter pontuações e stars para números válidos
function parseNumber(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (typeof val === 'string') {
        const clean = val.trim().toLowerCase();
        if (clean === '' || clean === 'null' || clean === 'empty' || clean === 'undefined' || clean === 'none') {
            return 0;
        }
        const parsed = Number(clean);
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

export async function openSuperStars() {
    let modal = document.getElementById('superstar-modal');
    
    // 1. CRIAÇÃO DO MODAL (Só ocorre uma vez)
    if (!modal) {
        modal = document.createElement('dialog');
        modal.id = 'superstar-modal';
        modal.className = 'superstar-dialog';
        modal.innerHTML = `
            <div class="superstar-wrapper">
                <button class="superstar-close" id="close-superstar">×</button>
                <h2 class="superstar-title">⭐ Super Stars ⭐</h2>
                <p class="superstar-subtitle">Os melhores jogadores de cada turma!</p>
                <div id="superstar-content">Carregando os astros...</div>
            </div>
        `;
        document.body.appendChild(modal);

        // Fecha ao clicar no botão X
        modal.querySelector('#close-superstar').addEventListener('click', () => {
            modal.close();
        });

        // Fecha ao clicar fora da janela (no backdrop)
        modal.addEventListener('click', (e) => {
            const rect = modal.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                modal.close();
            }
        });
    }

    const contentDiv = modal.querySelector('#superstar-content');
    
    if (!modal.open) {
        modal.showModal();
    }
    
    contentDiv.innerHTML = `<p style="text-align:center;">Buscando os melhores...</p>`;

    try {
        const { data: rawUsers, error } = await runWithLoader(async () => {
            return await supabase
                .from('users')
                .select('username, score, stars, serie, team, avatar_url, rank')
                .neq('username', 'micael.svg'); // Remove o admin da busca
        });

        if (error) throw error;
        
        // Filtra nulos e garante a remoção do admin
        const validUsers = (rawUsers || []).filter(u => u && u.username && u.username !== 'micael.svg');

        if (validUsers.length === 0) {
            contentDiv.innerHTML = `<p style="text-align:center;">Nenhum jogador encontrado.</p>`;
            return;
        }

        // Ordena os usuários por Score (Maior -> Menor) e por stars como desempate
        const sortedUsers = validUsers.sort((a, b) => {
            const scoreA = parseNumber(a.score);
            const scoreB = parseNumber(b.score);
            const starsA = parseNumber(a.stars);
            const starsB = parseNumber(b.stars);

            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }
            return starsB - starsA;
        });

        // Lógica para separar o melhor de cada turma por série
        const superStarsData = {};
        
        sortedUsers.forEach(user => {
            if (!user.serie || !user.team) return; // Pula usuários sem série ou turma

            const serieStr = String(user.serie).trim();
            const teamStr = String(user.team).trim().toUpperCase();

            if (!superStarsData[serieStr]) {
                superStarsData[serieStr] = {};
            }

            // Como a lista já está ordenada do maior para o menor,
            // o primeiro aluno a ser inserido na turma será o líder absoluto.
            if (!superStarsData[serieStr][teamStr]) {
                superStarsData[serieStr][teamStr] = {
                    ...user,
                    realScore: parseNumber(user.score) // Pontuação limpa e numérica
                };
            }
        });

        // Mapeamento para exibir os nomes das séries corretamente
        const serieNames = {
            '6': '6º Ano', '7': '7º Ano', '8': '8º Ano', '9': '9º Ano',
            '1': '1ª Série', '2': '2ª Série', '3': '3ª Série'
        };

        // Ordem prioritária de exibição na tela
        const defaultSerieOrder = ['6', '7', '8', '9', '1', '2', '3'];
        
        // Inclui quaisquer outras séries que existam no banco e não estejam no array padrão
        const extraSeries = Object.keys(superStarsData).filter(s => !defaultSerieOrder.includes(s));
        const serieOrder = [...defaultSerieOrder, ...extraSeries];

        let html = '';

        serieOrder.forEach(serieNum => {
            const turmas = superStarsData[serieNum];
            
            if (turmas && Object.keys(turmas).length > 0) {
                const tituloSerie = serieNames[serieNum] || `Série ${serieNum}`;
                
                html += `
                    <div class="superstar-section">
                        <h3 class="superstar-grade-title">${tituloSerie}</h3>
                        <div class="superstar-list">
                `;

                // Ordena as turmas alfabeticamente (A, B, C...)
                const turmasOrdenadas = Object.keys(turmas).sort();

                turmasOrdenadas.forEach(team => {
                    const topPlayer = turmas[team];
                    const avatar = topPlayer.avatar_url || 'https://via.placeholder.com/50';
                    const rankImage = `shields/${(topPlayer.rank || 'dirt').toLowerCase().trim()}.png`;

                    html += `
                        <div class="superstar-card" data-username="${topPlayer.username}">
                            <div class="superstar-team-badge">${serieNum}${team}</div>
                            <div class="superstar-avatar-container">
                                <img src="${avatar}" alt="Avatar" class="superstar-avatar">
                                <img src="${rankImage}" alt="Rank" class="superstar-rank-mini" onerror="this.style.display='none'">
                            </div>
                            <div class="superstar-info">
                                <span class="superstar-username">${topPlayer.username}</span>
                                <span class="superstar-score">🏆 ${topPlayer.realScore} pts</span>
                            </div>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            }
        });

        if (html === '') {
            contentDiv.innerHTML = `<p style="text-align:center; color: #333;">Nenhuma estrela encontrada para as séries cadastradas.</p>`;
        } else {
            contentDiv.innerHTML = html;

            // Adiciona o evento de clique nos cards dos jogadores
            const cards = contentDiv.querySelectorAll('.superstar-card');
            cards.forEach(card => {
                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const username = card.getAttribute('data-username');
                    
                    try {
                        openProfileCard(username);
                    } catch (err) {
                        console.error("Erro ao abrir perfil:", err);
                        alert("Não foi possível abrir o perfil no momento.");
                    }
                });
            });
        }
    } catch (err) {
        console.error("Erro na busca de SuperStars:", err);
        contentDiv.innerHTML = `<p style="text-align:center; color: red;">Erro ao carregar as Super Stars.</p>`;
    }
}
