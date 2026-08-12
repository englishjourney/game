// profile.js
import { getSession } from './auth.js';
import { supabase } from './supabaseClient.js'; 

// Cole aqui a URL do seu Web App do Apps Script
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyHXT2Mf61oX0d_zxLG7_jLLutG20Ez1o0k8mPP0Cr7aSIDMeREOpaGpr-WA4u3m72p/exec";

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
    "Fairy": "ΐ",
    "Miner": "፨"
};

// Escala progressiva de pontos
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
            break;
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
    
    modalContent.innerHTML = `<h2 style="text-align:center;">Carregando perfil...</h2>`;
    modal.showModal();

    try {
        const { data, error } = await supabase
            .from('users')
            .select('username, score, stars, hearts, class, avatar_url')
            .eq('username', session.username)
            .single();
            
        if (error) throw error;

        // Tratamento de valores nulos
        const userData = {
            username: data.username,
            score: data.score || 0,
            stars: data.stars || 0,
            hearts: data.hearts !== null && data.hearts !== undefined ? data.hearts : 3,
            class: data.class || null,
            avatar_url: data.avatar_url || "https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcS-55RgG38bJTopB10KrZknHMZMf94R5cEbUh8ZqWe8wiBmCyJE"
        };

        // Cálculos
        const userRank = getRankByScore(userData.score);
        const shieldImg = `shields/${userRank.toLowerCase().replace(" ", "")}.png`; 
        
        let starsHTML = '';
        for (let i = 0; i < userData.stars; i++) {
            starsHTML += `<img src="star.png" alt="Star" class="profile-star-icon">`;
        }

        let heartsHTML = '';
        for (let i = 0; i < 3; i++) {
            if (i < userData.hearts) {
                heartsHTML += `<span class="heart-icon active">❤️</span>`;
            } else {
                heartsHTML += `<span class="heart-icon empty">🖤</span>`;
            }
        }

        let classOptions = `<option value="" disabled ${!userData.class ? 'selected' : ''}>Escolha sua Classe</option>`;
        for (const [className, symbol] of Object.entries(classesMap)) {
            const isSelected = userData.class === className ? 'selected' : '';
            classOptions += `<option value="${className}" ${isSelected}>${symbol} ${className}</option>`;
        }

        // 4. Constrói o HTML da Janela
        modalContent.innerHTML = `
            <div class="profile-layout">
                <!-- Coluna Esquerda: Avatar -->
                <div class="profile-left">
                    <div class="avatar-wrapper">
                        <img src="${userData.avatar_url}" id="profile-modal-avatar" alt="Avatar">
                    </div>
                    <button id="btn-edit-avatar" class="btn-small">Editar Imagem</button>
                    <!-- Input oculto para upload -->
                    <input type="file" id="avatar-upload-input" class="hidden" accept="image/png, image/jpeg">
                </div>

                <!-- Coluna Direita: Dados -->
                <div class="profile-right">
                    <h2 class="profile-username">${userData.username}</h2>
                    
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
                            <span class="stat-value">${userData.score}</span>
                        </div>
                    </div>

                    <div class="profile-items">
                        <div class="item-group">
                            <span class="stat-label">Health</span>
                            <div class="hearts-container">${heartsHTML}</div>
                        </div>
                        
                        <div class="item-group">
                            <span class="stat-label">Stars (${userData.stars})</span>
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

        // 5. Adiciona Event Listeners

        // Mudança de Classe
        document.getElementById('class-select').addEventListener('change', async (e) => {
            const newClass = e.target.value;
            const { error: updateError } = await supabase
                .from('users')
                .update({ class: newClass })
                .eq('username', session.username);

            if (updateError) {
                alert("Erro ao salvar a classe.");
                console.error(updateError);
                return;
            }
            alert(`Sua classe agora é ${classesMap[newClass]} ${newClass}!`);
        });

        // Clique no botão "Editar Imagem" aciona o input file oculto
        document.getElementById('btn-edit-avatar').addEventListener('click', () => {
            document.getElementById('avatar-upload-input').click();
        });

        // Quando o aluno escolhe um arquivo de imagem
        document.getElementById('avatar-upload-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            modalContent.innerHTML += `<div id="uploading-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;color:white;font-size:1.5rem;z-index:99;">Enviando imagem para o Drive...</div>`;

            // Converte a imagem para Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Image = reader.result;

                try {
                    // Envia para o Web App do Apps Script
                    const response = await fetch(APPS_SCRIPT_URL, {
                        method: "POST",
                        body: JSON.stringify({
                            type: "avatar_upload",
                            image: base64Image,
                            mimeType: file.type,
                            filename: `${session.username}_avatar.${file.type.split('/')[1]}`
                        })
                    });

                    const result = await response.json();
                    if (!result.success) throw new Error(result.error);

                    const newAvatarUrl = result.url;

                    // Salva o link do Google Drive na tabela users do Supabase
                    const { error: dbError } = await supabase
                        .from('users')
                        .update({ avatar_url: newAvatarUrl })
                        .eq('username', session.username);

                    if (dbError) throw dbError;

                    // Atualiza a imagem na tela em tempo real (tanto no modal quanto no cabeçalho principal)
                    document.getElementById('profile-modal-avatar').src = newAvatarUrl;
                    const mainAvatar = document.getElementById('user-avatar');
                    if (mainAvatar) mainAvatar.src = newAvatarUrl;

                    alert("Avatar atualizado com sucesso!");
                    
                    // Remove o aviso de carregamento
                    const overlay = document.getElementById('uploading-overlay');
                    if (overlay) overlay.remove();

                } catch (err) {
                    console.error("Erro no upload:", err);
                    alert("Erro ao enviar a imagem. Verifique o console.");
                    const overlay = document.getElementById('uploading-overlay');
                    if (overlay) overlay.remove();
                }
            };
        });

    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
        modalContent.innerHTML = `<h3>Erro ao carregar os dados.</h3>`;
    }
}
