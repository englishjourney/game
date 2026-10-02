// profileCard.js
import { supabase } from './supabaseClient.js';
import { runWithLoader } from './loader.js';

// Escala progressiva de pontos para fallback
const ranksScale = [
    { name: "Dirt", min: 0 },
    { name: "Wood", min: 101 },
    { name: "Cobblestone", min: 501 },
    { name: "Stone", min: 1001 },
    { name: "Copper", min: 2001 },
    { name: "Iron", min: 4001 },
    { name: "Gold", min: 5001 },
    { name: "Redstone", min: 6001 },
    { name: "Lapislazulli", min: 7001 },
    { name: "Emerald", min: 8001 },
    { name: "Diamond", min: 9001 },
    { name: "Netherite", min: 10001 }
];

// Função para calcular o rank caso a coluna 'rank' no banco esteja vazia
function getRankByScore(score) {
    let currentRank = ranksScale[0];
    for (let i = 0; i < ranksScale.length; i++) {
        if (score >= ranksScale[i].min) {
            currentRank = ranksScale[i];
        } else {
            break;
        }
    }
    return currentRank.name;
}

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
        const hearts = data.hearts || 5;

        // 1. Busca primeiro da coluna 'rank'; se estiver vazia/nula, calcula com base no score
        const rank = data.rank || getRankByScore(score);

        // Mapeia a classe para o símbolo correspondente
        const classSymbols = {
            "Archer": "፠", "Explorer": "᪥", "Builder": "ᚙ", "Farmer": "࿊",
            "Redstone Engineer": "᪣", "Wizard": "߷", "Witch": "߷",
            "Summoner": "֍", "Warrior": "࿇", "Fairy": "ΐ", "Miner": "፨"
        };
        const userClass = data.class || ''; 
        const symbolDisplay = classSymbols[userClass] || '';

        // Mapeia o nome do rank limpo (sem espaços e em minúsculas) para a imagem
        const rankClean = rank.toLowerCase().replace(/\s+/g, '');
        const rankEmblem = `shields/${rankClean}.png`;

        // Define o fundo do card com base na classe do usuário
        const bgStyle = userClass 
            ? `background-image: url('bg/${userClass.toLowerCase()}.png'); background-size: cover; background-position: center; background-repeat: no-repeat;` 
            : `background-color: white;`;

        contentDiv.innerHTML = `
            <div class="vertical-profile-card" style="${bgStyle}">
                <h2 class="card-username">${data.username}</h2>
                
                <div class="card-avatar-container">
                    <img src="${avatar}" alt="Avatar" class="card-avatar">
                    
                    <!-- Imagem do Rank solta -->
                    ${rankEmblem ? `<img src="${rankEmblem}" alt="Patente ${rank}" class="card-rank-emblem" title="Patente: ${rank}">` : ''}
                    
                    <!-- Símbolo da Classe solto -->
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
        
        // Tela cheia para rank/classe
        const rankImg = contentDiv.querySelector('.card-rank-emblem');
        const classSym = contentDiv.querySelector('.card-class-symbol');

        [rankImg, classSym].forEach(el => {
            if (el) {
                el.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    
                    const overlay = document.createElement('dialog');
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100vw';
                    overlay.style.height = '100vh';
                    overlay.style.maxWidth = '100vw';
                    overlay.style.maxHeight = '100vh';
                    overlay.style.margin = '0';
                    overlay.style.padding = '0';
                    overlay.style.border = 'none';
                    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
                    overlay.style.display = 'flex';
                    overlay.style.alignItems = 'center';
                    overlay.style.justifyContent = 'center';
                    overlay.style.cursor = 'zoom-out';
                    
                    const clone = el.cloneNode(true);
                    clone.className = ''; 
                    
                    if (clone.tagName === 'IMG') {
                        clone.style.maxWidth = '80vw';
                        clone.style.maxHeight = '80vh';
                        clone.style.objectFit = 'contain';
                        clone.style.filter = 'drop-shadow(0 0 30px rgba(0,0,0,0.5))';
                    } else {
                        clone.style.fontSize = '40vw';
                        clone.style.color = '#ffffff';
                        clone.style.background = 'transparent';
                        clone.style.border = 'none';
                        clone.style.boxShadow = 'none';
                        clone.style.textShadow = '0 0 20px rgba(255, 255, 255, 0.2)';
                    }

                    overlay.appendChild(clone);
                    document.body.appendChild(overlay);
                    overlay.showModal();

                    overlay.addEventListener('click', () => {
                        overlay.close();
                        overlay.remove();
                    });
                });
            }
        });
    } catch (err) {
        console.error(err);
        contentDiv.innerHTML = `<p style="text-align:center;">Erro ao carregar o perfil.</p>`;
    }
}
