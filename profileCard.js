// profileCard.js
import { supabase } from './supabaseClient.js';
import { runWithLoader } from './loader.js';

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

        cardModal.addEventListener('click', (e) => {
            const rect = cardModal.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                cardModal.close();
            }
        });
    }

    const contentDiv = cardModal.querySelector('#profile-card-content');
    cardModal.showModal();
    contentDiv.innerHTML = `<div style="padding: 2rem; text-align:center;">Buscando dados...</div>`;

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
            contentDiv.innerHTML = `<div style="padding: 2rem; text-align:center;">Usuário não encontrado.</div>`;
            return;
        }

        const avatar = data.avatar_url || 'https://via.placeholder.com/150';
        const score = data.score || 0;
        const stars = data.stars || 0;
        const hearts = data.hearts || 5;
        const rank = data.rank || getRankByScore(score);

        const classSymbols = {
            "Archer": "፠", "Explorer": "᪥", "Builder": "ᚙ", "Farmer": "࿊",
            "Redstone Engineer": "᪣", "Wizard": "߷", "Witch": "߷",
            "Summoner": "֍", "Warrior": "࿇", "Fairy": "ΐ", "Miner": "፨"
        };
        const userClass = data.class || ''; 
        const symbolDisplay = classSymbols[userClass] || '';

        const rankClean = rank.toLowerCase().replace(/\s+/g, '');
        const rankEmblem = `shields/${rankClean}.png`;

        // Limpa o nome da classe removendo espaços (ex: "Redstone Engineer" vira "redstoneengineer")
        const classClean = userClass.toLowerCase().replace(/\s+/g, '');

        // Aplica o background
        const bgStyle = classClean 
            ? `background-image: url('bg/${classClean}.png'); background-size: cover; background-position: center; background-repeat: no-repeat;` 
            : `background-color: #2c3e50;`; // Cor fallback caso não tenha classe

        contentDiv.innerHTML = `
            <div class="vertical-profile-card" style="${bgStyle}">
                <h2 class="card-username">${data.username}</h2>
                
                <div class="card-avatar-container">
                    <img src="${avatar}" alt="Avatar" class="card-avatar">
                    ${rankEmblem ? `<img src="${rankEmblem}" alt="Patente ${rank}" class="card-rank-emblem" title="Patente: ${rank}">` : ''}
                    ${symbolDisplay ? `<div class="card-class-symbol" title="Classe: ${userClass}">${symbolDisplay}</div>` : ''}
                </div>

                ${userClass ? `<div class="profile-class-text">Classe: ${userClass}</div>` : ''}

                <div class="card-stats">
                    <div class="stat-item"><span class="stat-icon">🏆</span> Score: <strong>${score}</strong></div>
                    <div class="stat-item"><span class="stat-icon">⭐</span> Estrelas: <strong>${stars}</strong></div>
                    <div class="stat-item"><span class="stat-icon">🎖️</span> Patente: <strong>${rank}</strong></div>
                    <div class="stat-item"><span class="stat-icon">❤️</span> Corações: <strong>${hearts}</strong></div>
                </div>
            </div>
        `;
        
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
        contentDiv.innerHTML = `<div style="padding: 2rem; text-align:center;">Erro ao carregar o perfil.</div>`;
    }
}
