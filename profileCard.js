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
        const rank = data.rank || 'dirt'; // Pega da coluna 'rank' do banco
        const hearts = data.hearts || 5;

        // Mapeia a classe para o símbolo correspondente (use 'userClass' e não 'class')
        const classSymbols = {
            "Archer": "፠", "Explorer": "᪥", "Builder": "ᚙ", "Farmer": "࿊",
            "Redstone Engineer": "᪣", "Wizard": "߷", "Witch": "߷",
            "Summoner": "֍", "Warrior": "࿇", "Fairy": "ΐ", "Miner": "፨"
        };
        const userClass = data.class || ''; // <-- GARANTA QUE ESTÁ USANDO 'userClass'
        const symbolDisplay = classSymbols[userClass] || '';

        // Mapeia o nome do rank para o arquivo de escudo correspondente na pasta shields
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

                <!-- Nome da classe exibido de forma limpa abaixo do avatar -->
                ${userClass ? `<div class="profile-class-text">Classe: ${userClass}</div>` : ''}

                <div class="card-stats">
                    <div class="stat-item"><span class="stat-icon">🏆</span> Score: <strong>${score}</strong></div>
                    <div class="stat-item"><span class="stat-icon">⭐</span> Estrelas: <strong>${stars}</strong></div>
                    <div class="stat-item"><span class="stat-icon">🎖️</span> Patente: <strong>${rank}</strong></div>
                    <div class="stat-item"><span class="stat-icon">❤️</span> Corações: <strong>${hearts}</strong></div>
                </div>
            </div>
        `;
        // Lógica de Tela Cheia para o Rank e o Símbolo da Classe
        const rankImg = contentDiv.querySelector('.card-rank-emblem');
        const classSym = contentDiv.querySelector('.card-class-symbol');

        [rankImg, classSym].forEach(el => {
            if (el) {
                el.addEventListener('click', (e) => {
                    e.stopPropagation(); // Evita fechar o card acidentalmente
                    el.classList.toggle('fullscreen-preview');
                });
            }
        });
    } catch (err) {
        console.error(err);
        contentDiv.innerHTML = `<p style="text-align:center;">Erro ao carregar o perfil.</p>`;
    }
}
