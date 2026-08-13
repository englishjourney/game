// rank.js
import { supabase } from './supabaseClient.js';
import { runWithLoader } from './loader.js';
import { openProfileCard } from './profileCard.js';

export async function openRanking() {
    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('content-modal');
    
    modalContent.innerHTML = `<h3 style="text-align:center; color: var(--primary-color);">Carregando Ranking...</h3>`;
    modal.showModal();

    try {
        const { data: users, error } = await runWithLoader(async () => {
            return await supabase
                .from('users')
                .select('*')
                .order('score', { ascending: false });
        });

        if (error) throw error;

        if (!users || users.length === 0) {
            modalContent.innerHTML = `<h2 style="text-align:center; color: var(--primary-color);">Nenhum usuário encontrado!</h2>`;
            return; 
        }

        let html = `
            <div class="ranking-container">
                <h2 class="ranking-title">🏆 Ranking Geral</h2>
                <div class="ranking-list">
        `;

        users.forEach((user, index) => {
            const pos = index + 1;
            const username = user.username || "Usuário";
            const serieTurma = `${user.serie || ''} ${user.turma || ''}`.trim() || 'Geral';
            const score = user.score || 0;

            let posDisplay = `#${pos}`;
            if (pos === 1) posDisplay = '🥇 #1';
            else if (pos === 2) posDisplay = '🥈 #2';
            else if (pos === 3) posDisplay = '🥉 #3';

            html += `
                <div class="ranking-item">
                    <span class="ranking-pos">${posDisplay}</span>
                    <span class="ranking-username" data-username="${username}">${username}</span>
                    <span class="ranking-info">${serieTurma}</span>
                    <span class="ranking-score">${score} pts</span>
                </div>
            `;
        });

        html += `</div></div>`;
        modalContent.innerHTML = html;

        // Adiciona evento de clique nos nomes de usuário para abrir o card
        modalContent.querySelectorAll('.ranking-username').forEach(el => {
            el.addEventListener('click', (e) => {
                const targetUser = e.target.getAttribute('data-username');
                openProfileCard(targetUser);
            });
        });

    } catch (err) {
        console.error(err);
        modalContent.innerHTML = `<h3>Erro ao carregar o ranking. Verifique o console.</h3>`;
    }
}
