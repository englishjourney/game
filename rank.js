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
        const { data: rawUsers, error } = await runWithLoader(async () => {
            return await supabase
                .from('users')
                .select('*')
                .neq('username', 'micael.svg'); // Remove o usuário micael.svg do ranking
        });

        if (error) throw error;

        if (!rawUsers || rawUsers.length === 0) {
            modalContent.innerHTML = `<h2 style="text-align:center; color: var(--primary-color);">Nenhum usuário encontrado!</h2>`;
            return; 
        }

        // Garante a ordenação correta convertendo para Número (corrige o bug do rank aleatório)
        const users = rawUsers.sort((a, b) => {
            const scoreA = Number(a.score) || 0;
            const scoreB = Number(b.score) || 0;
            const estrelasA = Number(a.estrelas) || 0;
            const estrelasB = Number(b.estrelas) || 0;

            // 1ª Regra: Maior Score
            if (scoreB !== scoreA) {
                return scoreB - scoreA; 
            }
            
            // 2ª Regra (Desempate): Maior quantidade de Estrelas
            return estrelasB - estrelasA; 
        });

        let html = `
            <div class="ranking-container">
                <h2 class="ranking-title">🏆 Ranking Geral</h2>
                <div class="ranking-list">
        `;

        users.forEach((user, index) => {
            const pos = index + 1;
            const username = user.username || "Usuário";
            const serieTurma = `${user.serie || ''} ${user.turma || ''}`.trim() || 'Geral';
            
            // Variáveis numéricas garantidas para a exibição
            const score = Number(user.score) || 0;
            const estrelas = Number(user.estrelas) || 0;

            let posDisplay = `#${pos}`;
            if (pos === 1) posDisplay = '🥇 #1';
            else if (pos === 2) posDisplay = '🥈 #2';
            else if (pos === 3) posDisplay = '🥉 #3';

            // Opcional: Mostrando as estrelas junto na UI de forma discreta
            html += `
                <div class="ranking-item">
                    <span class="ranking-pos">${posDisplay}</span>
                    <span class="ranking-username" data-username="${username}">${username}</span>
                    <span class="ranking-info">${serieTurma}</span>
                    <span class="ranking-score" style="display: flex; gap: 8px;">
                        <span>${score} pts</span>
                    </span>
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
