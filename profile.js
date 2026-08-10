// profile.js
import { getSession } from './auth.js';
// import { supabase } from './supabaseClient.js'; // Descomente quando configurar o DB

// 1. Configurações de Classes e Ranks
const classesMap = {
    "Archer": "፠",
    "Explorer": "᪥",
    "Builder": "ᚙ",
    "Farmer": "࿊",
    "Redstone Engineer": "᪣",
    "Wizard": "߷",
    "Witch": "߷",
    "Summoner": "֍",
    "Warrior": "࿇",
    "Fairy": "࿓",
    "Miner": "፨"
};

// Escala progressiva de pontos (ajuste os valores conforme achar melhor para o balanço do jogo)
const ranksScale = [
    { name: "Dirt", min: 0 },
    { name: "Wood", min: 300 },
    { name: "Cobblestone", min: 800 },
    { name: "Stone", min: 1500 },
    { name: "Copper", min: 2500 },
    { name: "Iron", min: 3800 },
    { name: "Lapis Lazuli", min: 5000 },
    { name: "Redstone", min: 6500 },
    { name: "Gold", min: 7800 },
    { name: "Emerald", min: 9000 },
    { name: "Diamond", min: 9800 },
    { name: "Netherite", min: 10000 }
];

// 2. Função para descobrir o rank baseado no score
function getRankByScore(score) {
    let currentRank = ranksScale[0];
    for (let i = 0; i < ranksScale.length; i++) {
        if (score >= ranksScale[i].min) {
            currentRank = ranksScale[i];
        } else {
            break; // Se o score for menor que o mínimo do próximo rank, para o loop
        }
    }
    return currentRank.name;
}

// 3. Função Principal para renderizar o perfil
export async function openProfile() {
    const session = getSession();
    if (!session) return;

    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('content-modal');
    
    // Mostra um "Carregando" enquanto busca no Supabase
    modalContent.innerHTML = `<h2 style="text-align:center;">Carregando perfil...</h2>`;
    modal.showModal();

    try {
        // =========================================================
        // AQUI ENTRA A BUSCA NO SUPABASE (Exemplo de como seria)
        // =========================================================
        /*
        const { data, error } = await supabase
            .from('users')
            .select('username, score, stars, hearts, class, avatar_url')
            .eq('username', session.username)
            .single();
            
        if (error) throw error;
        */

        // DADOS MOCKADOS (Remova e use o data acima quando conectar o Supabase)
        const data = {
            username: session.username,
            score: 1250, // Exemplo
            stars: 7,
            hearts: 3,
            class: "Explorer", // Pode vir null no primeiro acesso
            avatar_url: document.getElementById('user-avatar').src // Pega a imagem atual
        };

        // Cálculos
        const userRank = getRankByScore(data.score);
        const shieldImg = `shields/${userRank.toLowerCase().replace(" ", "")}.png`; // Ex: lapis lazuli -> lapislazuli.png
        
        // Gera HTML das estrelas
        let starsHTML = '';
        for (let i = 0; i < data.stars; i++) {
            starsHTML += `<img src="star.png" alt="Star" class="profile-star-icon">`;
        }

        // Gera HTML dos corações (máximo 3)
        let heartsHTML = '';
        for (let i = 0; i < 3; i++) {
            if (i < data.hearts) {
                heartsHTML += `<span class="heart-icon active">❤️</span>`;
            } else {
                heartsHTML += `<span class="heart-icon empty">🖤</span>`;
            }
        }

        // Monta as opções do Select de Classe
        let classOptions = `<option value="" disabled ${!data.class ? 'selected' : ''}>Escolha sua Classe</option>`;
        for (const [className, symbol] of Object.entries(classesMap)) {
            const isSelected = data.class === className ? 'selected' : '';
            classOptions += `<option value="${className}" ${isSelected}>${symbol} ${className}</option>`;
        }

        // 4. Constrói o HTML da Janela
        modalContent.innerHTML = `
            <div class="profile-layout">
                <!-- Coluna Esquerda: Avatar -->
                <div class="profile-left">
                    <div class="avatar-wrapper">
                        <img src="${data.avatar_url}" id="profile-modal-avatar" alt="Avatar">
                    </div>
                    <button id="btn-edit-avatar" class="btn-small">Editar Imagem</button>
                    <!-- Input oculto para upload (vamos integrar com o Apps Script depois) -->
                    <input type="file" id="avatar-upload-input" class="hidden" accept="image/png, image/jpeg">
                </div>

                <!-- Coluna Direita: Dados -->
                <div class="profile-right">
                    <h2 class="profile-username">${data.username}</h2>
                    
                    <div class="profile-stats-grid">
                        <div class="stat-card rank-card">
                            <img src="${shieldImg}" alt="${userRank}" class="rank-shield">
                            <div class="rank-info">
                                <span class="stat-label">Rank Atual</span>
                                <span class="rank-name">${userRank}</span>
                            </div>
                        </div>

                        <div class="stat-card score-card">
                            <span class="stat-label">Score (XP)</span>
                            <span class="stat-value">${data.score}</span>
                        </div>
                    </div>

                    <div class="profile-items">
                        <div class="item-group">
                            <span class="stat-label">Health</span>
                            <div class="hearts-container">${heartsHTML}</div>
                        </div>
                        
                        <div class="item-group">
                            <span class="stat-label">Stars (${data.stars})</span>
                            <div class="stars-container">${starsHTML || '<span style="font-size: 0.8rem;">Nenhuma estrela ainda</span>'}</div>
                        </div>
                    </div>

                    <div class="profile-class-section">
                        <label for="class-select" class="stat-label">Classe do Estudante:</label>
                        <select id="class-select" class="class-dropdown">
                            ${classOptions}
                        </select>
                    </div>
                </div>
            </div>
        `;

        // 5. Adiciona Event Listeners aos novos elementos

        // Listener para mudar de classe e salvar no banco
        document.getElementById('class-select').addEventListener('change', async (e) => {
            const newClass = e.target.value;
            // AQUI: Adicionar código para fazer o UPDATE da classe no Supabase
            console.log(`Classe alterada para: ${newClass}`);
            alert(`Sua classe agora é ${classesMap[newClass]} ${newClass}!`);
        });

        // Listener para o botão de editar avatar (preparando para o Apps Script)
        document.getElementById('btn-edit-avatar').addEventListener('click', () => {
            document.getElementById('avatar-upload-input').click();
        });

    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
        modalContent.innerHTML = `<h3>Erro ao carregar os dados.</h3>`;
    }
}
