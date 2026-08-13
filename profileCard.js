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
        const ranks = data.ranks || 'Iniciante';
        const hearts = data.hearts || 5;
        const rankEmblem = data.rank_emblem || '';
        const classSymbol = data.class_symbol || '';

        contentDiv.innerHTML = `
            <div class="vertical-profile-card">
                <h2 class="card-username">${data.username}</h2>
                
                <div class="card-avatar-container">
                    <img src="${avatar}" alt="Avatar" class="card-avatar">
                    ${rankEmblem ? `<img src="${rankEmblem}" alt="Emblema" class="card-rank-emblem" title="Emblema de Rank">` : ''}
                    ${classSymbol ? `<img src="${classSymbol}" alt="Classe" class="card-class-symbol" title="Símbolo da Classe">` : ''}
                </div>

                <div class="card-stats">
                    <div class="stat-item"><span class="stat-icon">🏆</span> Score: <strong>${score}</strong></div>
                    <div class="stat-item"><span class="stat-icon">⭐</span> Estrelas: <strong>${stars}</strong></div>
                    <div class="stat-item"><span class="stat-icon">🎖️</span> Patente: <strong>${ranks}</strong></div>
                    <div class="stat-item"><span class="stat-icon">❤️</span> Corações: <strong>${hearts}</strong></div>
                </div>
            </div>
        `;
    } catch (err) {
        console.error(err);
        contentDiv.innerHTML = `<p style="text-align:center;">Erro ao carregar o perfil.</p>`;
    }
}
