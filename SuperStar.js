// SuperStar.js
import { supabase } from './supabaseClient.js';
import { runWithLoader } from './loader.js';
import { openProfileCard } from './profileCard.js';

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
    
    // CORREÇÃO 1: Evita o erro "The element already has an 'open' attribute"
    if (!modal.open) {
        modal.showModal();
    }
    
    contentDiv.innerHTML = `<p style="text-align:center;">Buscando os melhores...</p>`;

    try {
        const { data: users, error } = await runWithLoader(async () => {
            // Trazemos os usuários ordenados por score (do maior para o menor)
            return await supabase
                .from('users')
                .select('username, score, serie, team, avatar_url, rank')
                .order('score', { ascending: false });
        });

        if (error) throw error;
        
        if (!users || users.length === 0) {
            contentDiv.innerHTML = `<p style="text-align:center;">Nenhum jogador encontrado.</p>`;
            return;
        }

        // Lógica para filtrar o melhor de cada turma por série
        const superStarsData = {};
        
        users.forEach(user => {
            if (!user.serie || !user.team) return; // Pula usuários sem série ou turma

            // CORREÇÃO 2: Garante que a série seja tratada como string para dar 'match' com o serieOrder
            const serieStr = String(user.serie).trim();
            const teamStr = String(user.team).trim().toUpperCase();

            if (!superStarsData[serieStr]) {
                superStarsData[serieStr] = {};
            }

            // Como a lista já veio ordenada do maior pro menor, 
            // o primeiro de cada turma que aparecer será o maior score.
            if (!superStarsData[serieStr][teamStr]) {
                superStarsData[serieStr][teamStr] = user;
            }
        });

        // Mapeamento para exibir os nomes das séries corretamente
        const serieNames = {
            '6': '6º Ano', '7': '7º Ano', '8': '8º Ano', '9': '9º Ano',
            '1': '1ª Série', '2': '2ª Série', '3': '3ª Série'
        };

        // Ordem em que as séries devem aparecer na tela
        const serieOrder = ['6', '7', '8', '9', '1', '2', '3'];

        let html = '';

        serieOrder.forEach(serieNum => {
            const turmas = superStarsData[serieNum];
            
            if (turmas && Object.keys(turmas).length > 0) {
                // Se a série não tiver nome mapeado, usa a própria chave como fallback
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
                                <span class="superstar-score">🏆 ${topPlayer.score} pts</span>
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

            // Adiciona o evento de clique nos cards
            const cards = contentDiv.querySelectorAll('.superstar-card');
            cards.forEach(card => {
                card.addEventListener('click', (e) => {
                    e.stopPropagation(); // Impede o clique de fechar o modal
                    const username = card.getAttribute('data-username');
                    
                    // CORREÇÃO 3: Try/Catch caso o Profile Card falhe e evitar que a tela quebre
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
