// flashcardsAdm.js
import { supabase } from '../supabaseClient.js';

export function initFlashcardsAdm() {
    const flashcardsList = document.getElementById('flashcards-list');
    const btnAddFlashcard = document.getElementById('btn-add-flashcard');
    const flashcardModal = document.getElementById('flashcard-modal');
    const flashcardForm = document.getElementById('flashcard-form');
    
    if (!flashcardsList) return;

    loadFlashcards();

    btnAddFlashcard.addEventListener('click', () => {
        document.getElementById('flashcard-modal-title').textContent = 'Adicionar Flashcard';
        document.getElementById('flashcard-id').value = '';
        flashcardForm.reset();
        flashcardModal.showModal();
    });

    flashcardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('flashcard-id').value;
        const word = document.getElementById('fc-word').value;
        const translation = document.getElementById('fc-translation').value;
        const audio_link = document.getElementById('fc-audio').value;
        const stack = document.getElementById('fc-stack').value;

        const payload = { word, translation, audio_link, stack };

        if (id) {
            const { error } = await supabase.from('flashcards').update(payload).eq('id', id);
            if (error) alert('Erro ao atualizar: ' + error.message);
        } else {
            const { error } = await supabase.from('flashcards').insert([payload]);
            if (error) alert('Erro ao criar: ' + error.message);
        }

        flashcardModal.close();
        loadFlashcards();
    });
}

async function loadFlashcards() {
    const container = document.getElementById('flashcards-list');
    container.innerHTML = 'Carregando flashcards...';

    const { data, error } = await supabase.from('flashcards').select('*').order('stack', { ascending: true });

    if (error) {
        container.innerHTML = 'Erro ao carregar flashcards.';
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = '<p>Nenhum flashcard cadastrado.</p>';
        return;
    }

    let html = '';
    data.forEach(fc => {
        html += `
            <div class="card-item" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>Stack:</strong> ${fc.stack || 'Geral'} <br>
                    <strong>Palavra:</strong> ${fc.word} | <strong>Tradução:</strong> ${fc.translation} <br>
                    <small>Áudio: ${fc.audio_link || 'Nenhum'}</small>
                </div>
                <div>
                    <button class="btn-secondary btn-edit-fc" data-id="${fc.id}" data-word="${fc.word}" data-translation="${fc.translation}" data-audio="${fc.audio_link || ''}" data-stack="${fc.stack || ''}">Editar</button>
                    <button class="btn-danger btn-delete-fc" data-id="${fc.id}">Excluir</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Ações de editar e excluir
    container.querySelectorAll('.btn-edit-fc').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('flashcard-modal-title').textContent = 'Editar Flashcard';
            document.getElementById('flashcard-id').value = btn.dataset.id;
            document.getElementById('fc-word').value = btn.dataset.word;
            document.getElementById('fc-translation').value = btn.dataset.translation;
            document.getElementById('fc-audio').value = btn.dataset.audio;
            document.getElementById('fc-stack').value = btn.dataset.stack;
            document.getElementById('flashcard-modal').showModal();
        });
    });

    container.querySelectorAll('.btn-delete-fc').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Deseja realmente excluir este flashcard?')) {
                const { error } = await supabase.from('flashcards').delete().eq('id', btn.dataset.id);
                if (error) alert('Erro ao excluir: ' + error.message);
                else loadFlashcards();
            }
        });
    });
}
