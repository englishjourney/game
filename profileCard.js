// profileCard.js
import { supabase } from './supabaseClient.js';
import { runWithLoader } from './loader.js';

export async function openProfileCard(username) {
    let cardModal = document.getElementById('profile-card-modal');
    if (!cardModal) {
        cardModal = document.createElement('dialog');
        cardModal.id = 'profile-card-modal';
        cardModal.className = 'profile-card-dialog';
        cardModal.innerHTML = `
            <div class="profile-card-wrapper">
                <button class="profile-card-close" id="close-profile-card">×</button>
                <div id="profile-card-content">Carregando perfil...</div>
            </div>
        `;
        document.body.appendChild(cardModal);

        cardModal.querySelector('#close-profile-card').addEventListener('click', () => {
            cardModal.close();
        });

        // Fecha ao clicar fora do card
        cardModal.addEventListener('click', (e) => {
            const rect = cardModal.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                cardModal.close();
            }
        });
    }

    const contentDiv = cardModal.querySelector('#profile-card-content');
    cardModal.showModal();
    contentDiv.innerHTML = `<p style="text-align:center;">Buscando dados...</p>`;

    try {
        const { data, error } = await runWithLoader(async () => {
            return await supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .single();
        });

        if (error) throw error;
        if (!data) {
            contentDiv.innerHTML = `<p style="text-align:center;">Usuário não encontrado.</p>`;
            return;
        }

        const avatar = data.avatar_url || 'https://via.placeholder.com/150';
        const score = data.score || 0;
        const stars = data.stars || 0;
        const rank = data.rank || 'dirt'; 
        const hearts = data.hearts || 5;

        // Mapeia a classe para o símbolo correspondente
        const classSymbols = {
            "Archer": "፠", "Explorer": "᪥", "Builder": "ᚙ", "Farmer": "࿊",
            "Redstone Engineer": "᪣", "Wizard": "߷", "Witch": "߷",
            "Summoner": "֍", "Warrior": "࿇", "Fairy": "ΐ", "Miner": "፨"
        };
        const userClass = data.class || ''; 
        const symbolDisplay = classSymbols[userClass] || '';

        // Mapeia o nome do rank para o arquivo de escudo correspondente
        const rankClean = rank.toLowerCase().trim();
        const rankEmblem = `shields/${rankClean}.png`;

        contentDiv.innerHTML = `
            <div class="vertical-profile-card">
                <h2 class="card-username">${data.username}</h2>
                
                <div class="card-avatar-container">
                    <img src="${avatar}" alt="Avatar" class="card-avatar">
                    
                    <!-- Imagem do Rank solta -->
                    ${rankEmblem ? `<img src="${rankEmblem}" alt="Patente ${rank}" class="card-rank-emblem" title="Patente: ${rank}">` : ''}
                    
                    <!-- Símbolo da Classe solto (sem container em volta) -->
                    ${symbolDisplay ? `<div class="card-class-symbol" title="Classe: ${userClass}">${symbolDisplay}</div>` : ''}
                </div>

                <!-- Nome da classe limpo abaixo do avatar -->
                ${userClass ? `<div class="profile-class-text">Classe: ${userClass}</div>` : ''}

                <div class="card-stats">
                    <div class="stat-item"><span class="stat-icon">🏆</span> Score: <strong>${score}</strong></div>
                    <div class="stat-item"><span class="stat-icon">⭐</span> Estrelas: <strong>${stars}</strong></div>
                    <div class="stat-item"><span class="stat-icon">🎖️</span> Patente: <strong>${rank}</strong></div>
                    <div class="stat-item"><span class="stat-icon">❤️</span> Corações: <strong>${hearts}</strong></div>
                </div>
            </div>
        `;
        
        // ========================================================
        // TELA CHEIA MÁGICA: Totalmente solta e independente do cartão!
        // ========================================================
        const rankImg = contentDiv.querySelector('.card-rank-emblem');
        const classSym = contentDiv.querySelector('.card-class-symbol');

        [rankImg, classSym].forEach(el => {
            if (el) {
                el.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    
                    // ALTERAÇÃO AQUI: Cria um elemento <dialog> ao invés de <div>
                    const overlay = document.createElement('dialog');
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100vw';
                    overlay.style.height = '100vh';
                    overlay.style.maxWidth = '100vw'; // Necessário no dialog
                    overlay.style.maxHeight = '100vh'; // Necessário no dialog
                    overlay.style.margin = '0'; // Tira as margens padrão do dialog
                    overlay.style.padding = '0'; // Tira o espaçamento padrão
                    overlay.style.border = 'none'; // Sem borda
                    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.95)'; // Fundo super escuro
                    overlay.style.display = 'flex'; // Exibe as coisas no centro
                    overlay.style.alignItems = 'center';
                    overlay.style.justifyContent = 'center';
                    overlay.style.cursor = 'zoom-out';
                    
                    // Clona a imagem/símbolo clicado
                    const clone = el.cloneNode(true);
                    
                    // A mágica: apaga as classes do cartão pra não herdar molduras!
                    clone.className = ''; 
                    
                    if (clone.tagName === 'IMG') {
                        // Se for a imagem do Rank
                        clone.style.maxWidth = '80vw';
                        clone.style.maxHeight = '80vh';
                        clone.style.objectFit = 'contain';
                        clone.style.filter = 'drop-shadow(0 0 30px rgba(0,0,0,0.5))';
                    } else {
                        // Se for o símbolo da classe em texto (O Builder das 3 bolinhas)
                        clone.style.fontSize = '40vw'; // Fica Gigante
                        clone.style.color = '#ffffff'; // Branco para destacar no fundo preto
                        clone.style.background = 'transparent'; // Arranca qualquer cor de fundo
                        clone.style.border = 'none'; // Arranca bordas
                        clone.style.boxShadow = 'none';
                        clone.style.textShadow = '0 0 20px rgba(255, 255, 255, 0.2)';
                    }

                    // Cola a imagem no dialog e adiciona ao site
                    overlay.appendChild(clone);
                    document.body.appendChild(overlay);

                    // ALTERAÇÃO AQUI: Abre o overlay nativamente no Top Layer
                    overlay.showModal();

                    // Clica em qualquer lugar para sumir com tudo
                    overlay.addEventListener('click', () => {
                        overlay.close(); // Fecha o dialog
                        overlay.remove(); // Remove o html do site
                    });
                });
            }
        });
    } catch (err) {
        console.error(err);
        contentDiv.innerHTML = `<p style="text-align:center;">Erro ao carregar o perfil.</p>`;
    }
}
