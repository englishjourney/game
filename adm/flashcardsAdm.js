// flashcardsAdm.js
import { supabase } from '../supabaseClient.js';

let flashcardRecords = new Map();

const GOOGLE_TTS_BASE_URL = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=';

function buildFlashcardAudioLink(word) {
    const spokenText = String(word ?? '').trim().toLocaleLowerCase('en-US').replace(/\s+/g, '-');
    return GOOGLE_TTS_BASE_URL + encodeURIComponent(spokenText);
}

function escapeFlashcardHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

export function initFlashcardsAdm() {
    const flashcardsList = document.getElementById('flashcards-list');
    const btnAddFlashcard = document.getElementById('btn-add-flashcard');
    const flashcardModal = document.getElementById('flashcard-modal');
    const flashcardForm = document.getElementById('flashcard-form');

    if (!flashcardsList || !btnAddFlashcard || !flashcardModal || !flashcardForm) return;

    loadFlashcards();

    if (flashcardsList.dataset.stackToggleInitialized !== 'true') {
        flashcardsList.dataset.stackToggleInitialized = 'true';
        flashcardsList.addEventListener('click', async event => {
            const toggle = event.target.closest('[data-flashcard-stack-toggle]');
            if (toggle) {
                const content = document.getElementById(toggle.getAttribute('aria-controls'));
                if (!content) return;
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', String(!expanded));
                content.hidden = expanded;
                const chevron = toggle.querySelector('.flashcard-stack-chevron');
                if (chevron) {
                    chevron.classList.toggle('fa-chevron-up', !expanded);
                    chevron.classList.toggle('fa-chevron-down', expanded);
                }
                return;
            }

            const editButton = event.target.closest('.btn-edit-fc');
            if (editButton) {
                event.preventDefault();
                event.stopPropagation();
                const card = flashcardRecords.get(String(editButton.dataset.id));
                if (!card) return;

                document.getElementById('flashcard-modal-title').textContent = 'Editar Flashcard';
                document.getElementById('flashcard-id').value = card.id;
                document.getElementById('fc-word').value = card.word || '';
                document.getElementById('fc-translation').value = card.translation || '';
                document.getElementById('fc-stack').value = card.stack || '';
                if (!flashcardModal.open) flashcardModal.showModal();
                return;
            }

            const deleteButton = event.target.closest('.btn-delete-fc');
            if (deleteButton) {
                event.preventDefault();
                event.stopPropagation();
                if (!confirm('Deseja realmente excluir este flashcard?')) return;
                const { error: deleteError } = await supabase
                    .from('flashcards')
                    .delete()
                    .eq('id', deleteButton.dataset.id);
                if (deleteError) {
                    alert('Erro ao excluir: ' + deleteError.message);
                    return;
                }
                await loadFlashcards();
            }
        });
    }

    btnAddFlashcard.addEventListener('click', () => {
        document.getElementById('flashcard-modal-title').textContent = 'Adicionar Flashcard';
        document.getElementById('flashcard-id').value = '';
        flashcardForm.reset();
        flashcardModal.showModal();
    });

    flashcardForm.addEventListener('submit', async event => {
        event.preventDefault();

        const id = document.getElementById('flashcard-id').value;
        const payload = {
            word: document.getElementById('fc-word').value.trim(),
            translation: document.getElementById('fc-translation').value.trim(),
            audio_link: buildFlashcardAudioLink(document.getElementById('fc-word').value),
            stack: document.getElementById('fc-stack').value.trim()
        };

        const result = id
            ? await supabase.from('flashcards').update(payload).eq('id', id)
            : await supabase.from('flashcards').insert([payload]);

        if (result.error) {
            alert('Não foi possível salvar o flashcard: ' + result.error.message);
            return;
        }

        flashcardModal.close();
        await loadFlashcards();
    });
}

async function loadFlashcards() {
    const container = document.getElementById('flashcards-list');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Carregando flashcards...</p>';

    const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .order('stack', { ascending: true });

    if (error) {
        flashcardRecords = new Map();
        container.innerHTML = '<p class="empty-state">Erro ao carregar flashcards.</p>';
        return;
    }

    flashcardRecords = new Map((data || []).map(card => [String(card.id), card]));

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum flashcard cadastrado.</p>';
        return;
    }

    const stacks = new Map();
    data.forEach(card => {
        const stackName = card.stack || 'Geral';
        if (!stacks.has(stackName)) stacks.set(stackName, []);
        stacks.get(stackName).push(card);
    });

    container.innerHTML = Array.from(stacks.entries()).map(([stackName, cards], index) => {
        const stackContentId = 'flashcard-stack-content-' + index;
        return '<section class="flashcard-stack-group" data-flashcard-stack="' + index + '">' +
            '<button type="button" class="flashcard-stack-title" data-flashcard-stack-toggle aria-expanded="false" aria-controls="' + stackContentId + '">' +
                '<span class="flashcard-stack-heading"><i class="fa-solid fa-layer-group" aria-hidden="true"></i>' + escapeFlashcardHtml(stackName) + '</span>' +
                '<span class="flashcard-stack-count">' + cards.length + ' cartas</span>' +
                '<i class="fa-solid fa-chevron-down flashcard-stack-chevron" aria-hidden="true"></i>' +
            '</button>' +
            '<div class="flashcard-stack-content" id="' + stackContentId + '" hidden>' +
            '<div class="flashcard-stack-grid">' +
                cards.map(card =>
                    '<article id="flashcard-card-' + escapeFlashcardHtml(card.id) + '" class="data-card flashcard-card">' +
                        '<div class="flashcard-card-content">' +
                            '<strong>' + escapeFlashcardHtml(card.word) + '</strong>' +
                            '<p>' + escapeFlashcardHtml(card.translation) + '</p>' +
                            '<a class="flashcard-audio-link" href="' + escapeFlashcardHtml(buildFlashcardAudioLink(card.word)) + '" target="_blank" rel="noopener noreferrer">' +
                                '<i class="fa-solid fa-volume-high" aria-hidden="true"></i> Ouvir pronúncia' +
                            '</a>' +
                        '</div>' +
                        '<div class="data-card-actions">' +
                            '<button type="button" class="btn-small btn-secondary btn-edit-fc" data-id="' + escapeFlashcardHtml(card.id) +
                                '" data-word="' + escapeFlashcardHtml(card.word) +
                                '" data-translation="' + escapeFlashcardHtml(card.translation) +
                                '" data-stack="' + escapeFlashcardHtml(card.stack || '') + '">' +
                                '<i class="fa-solid fa-pen" aria-hidden="true"></i> Editar</button>' +
                            '<button type="button" class="btn-small btn-danger btn-delete-fc" data-id="' + escapeFlashcardHtml(card.id) + '">' +
                                '<i class="fa-solid fa-trash" aria-hidden="true"></i> Excluir</button>' +
                        '</div>' +
                    '</article>'
                ).join('') +
            '</div>' +
            '</div>' +
        '</section>';
    }).join('');

}
