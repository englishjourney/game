// profileCard.js
import { supabase } from './supabaseClient.js';

export async function openProfileCard(username) {
    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('content-modal');
    
    modalContent.innerHTML = `<div style="text-align:center; padding: 20px;">Carregando perfil...</div>`;
    modal.showModal();

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error) throw error;
        if (!data) {
            modalContent.innerHTML = `<div style="text-align:center; padding: 20px;">Usuário não encontrado.</div>`;
            return;
        }

        const avatarUrl = data.avatar_url || data.avatar || 'https://via.placeholder.com/150';
        const score = data.score || 0;
        const stars = data.stars || 0;
        const patentes = data.rank || data.patente || 'Iniciante';
        const hearts = data.hearts || data.vidas || 5;

        modalContent.innerHTML = `
            <div class="profile-card-container">
                <button class="profile-card-close" onclick="document.getElementById('content-modal').close()">×</button>
                <h2 class="profile-card-username">${data.username}</h2>
                <div class="profile-card-avatar-wrapper">
                    <img src="${avatarUrl}" alt="Avatar de ${data.username}" class="profile-card-avatar">
                </div>
                <div class="profile-card-info">
                    <div class="info-item">❤️ <span>${hearts} Corações</span></div>
                    <div class="info-item">🏆 <span>${score} Pontos</span></div>
                    <div class="info-item">⭐ <span>${stars} Estrelas</span></div>
                    <div class="info-item">🎖️ <span>Patente: ${patentes}</span></div>
                </div>
            </div>
        `;
    } catch (err) {
        console.error(err);
        modalContent.innerHTML = `<div style="text-align:center; padding: 20px;">Erro ao carregar perfil.</div>`;
    }
}
