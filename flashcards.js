import { supabase } from './supabaseClient.js';
import { runWithLoader } from './loader.js';

export async function openFlashcards() {
    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('content-modal');
    
    modalContent.innerHTML = `<h3 style="text-align:center; color: var(--primary-color);">Carregando Flashcards...</h3>`;
    modal.showModal();

    try {
        const { data: flashcards, error } = await runWithLoader(async () => {
            return await supabase.from('flashcards').select('*');
        });

        if (error) throw error;

        // Agrupar por Stack
        const grouped = flashcards.reduce((acc, card) => {
            const stack = card.stack || 'Geral';
            if (!acc[stack]) acc[stack] = [];
            acc[stack].push(card);
            return acc;
        }, {});

        let html = `<div class="flashcards-wrapper"><h2>Flashcards</h2>`;

        for (const [stackName, cards] of Object.entries(grouped)) {
            html += `<h3 class="stack-title">📂 ${stackName}</h3><div class="stack-grid">`;
            
            cards.forEach(card => {
                html += `
                    <div class="flashcard-container" onclick="this.classList.toggle('flipped')">
                        <div class="flashcard-inner">
                            <div class="flashcard-front">
                                <h3>${card.word}</h3>
                                <button class="audio-btn" onclick="event.stopPropagation(); this.querySelector('audio').play()">
                                    🔊 
                                    <audio src="${card.audio_link}" oncanplay="this.parentElement.classList.add('ready')"></audio>
                                </button>
                                <div class="loader-mini">Carregando...</div>
                            </div>
                            <div class="flashcard-back">
                                <p>${card.translation}</p>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }
        html += `</div>`;
        modalContent.innerHTML = html;

    } catch (err) {
        console.error(err);
        modalContent.innerHTML = `<h3>Erro ao carregar flashcards.</h3>`;
    }
}
