// flashcards.js
import { supabase } from './supabaseClient.js';

let currentDeckCards = [];
let currentCardIndex = 0;

// Escutador global para os comandos de teclado
document.addEventListener('keydown', (e) => {
    const deckView = document.getElementById('fc-deck-view');
    // Verifica se o modal de flashcards e a visualização do baralho estão ativos
    if (deckView && deckView.style.display !== 'none') {
        const cardInner = document.getElementById('fc-card-inner');

        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (cardInner) cardInner.classList.toggle('flipped');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            changeCardWithAnimation('down'); // Próxima carta (desliza para cima, entra de baixo)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            changeCardWithAnimation('up'); // carta anterior (desliza para baixo, entra de cima)
        } else if (e.key === 'Enter') {
            e.preventDefault();
            playCurrentAudio();
        }
    }
});

export async function openFlashcards() {
    const modal = document.getElementById('content-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = modal.querySelector('.modal-body') || modal; 
    
    if (modalTitle) modalTitle.textContent = "Flashcards";

    // Estrutura HTML Injetada com as novas instruções de teclado
    modalBody.innerHTML = `
        <div id="flashcards-container" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
            <button id="fc-btn-close-modal" style="position: absolute; top: 0px; right: 0px; background: #e74c3c; color: white; border: 3px solid #c0392b; border-radius: 50%; width: 40px; height: 40px; font-weight: bold; cursor: pointer; z-index: 20; display: flex; align-items: center; justify-content: center;">✕</button>
            <!-- View 1: Stacks Menu -->
            <div id="fc-stacks-view" style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center; padding: 20px;">
                <p>Carregando seus stacks...</p>
            </div>

            <!-- View 2: Active Deck (Cartas Empilhadas) -->
            <div id="fc-deck-view" style="display: none; flex-direction: column; align-items: center; justify-content: center; flex: 1; position: relative; width: 100%; height: 100%; min-height: 400px; padding: 20px; overflow: hidden;">
                <button id="fc-btn-back-to-stacks" style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.1); border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em; z-index: 10;">
                    ⬅ Voltar aos Stacks
                </button>
                <div id="fc-card-area" class="flashcard-container vertical-card">
                    <div id="fc-card-inner" class="flashcard-inner">
                        <div class="flashcard-front">
                            <button id="fc-btn-audio" class="fc-audio-btn">🔊</button>
                            <h2 id="fc-word" class="fc-text"></h2>
                        </div>
                        <div class="flashcard-back">
                            <h2 id="fc-translation" class="fc-text"></h2>
                        </div>
                    </div>
                </div>
                
                <p style="margin-top: 25px; font-size: 0.85em; opacity: 0.8; text-align: center; pointer-events: none; line-height: 1.4;">
                    ⬆ ⬇ Setas Cima / Baixo: Próxima / Anterior carta<br>
                    ⬅ ➡️ Setas Esquerda / Direita: Virar carta<br>
                    ⏎ Enter: Ouvir áudio
                </p>
            </div>
        </div>
    `;

    modal.showModal();

    const btnAudio = document.getElementById('fc-btn-audio');
    const btnBackToStacks = document.getElementById('fc-btn-back-to-stacks');

    if (btnBackToStacks) {
        btnBackToStacks.addEventListener('click', () => {
            document.getElementById('fc-deck-view').style.display = 'none';
            document.getElementById('fc-stacks-view').style.display = 'flex';
        });
    }

    // Clicar no botão de áudio
    btnAudio.addEventListener('click', (e) => {
        e.stopPropagation();
        playCurrentAudio();
    });

    // Buscar dados do banco
    try {
        const { data: cards, error } = await supabase.from('flashcards').select('*');
        if (error) throw error;

        const stacks = {};
        cards.forEach(card => {
            const stackName = card.stack || 'Geral'; 
            if (!stacks[stackName]) stacks[stackName] = [];
            stacks[stackName].push(card);
        });

        renderStacks(stacks);
    } catch (err) {
        console.error("Erro ao buscar flashcards:", err);
        document.getElementById('fc-stacks-view').innerHTML = `<p>Erro ao carregar flashcards.</p>`;
    }
}

function renderStacks(stacks) {
    const stacksView = document.getElementById('fc-stacks-view');
    stacksView.innerHTML = ''; 

    if (Object.keys(stacks).length === 0) {
        stacksView.innerHTML = `<p>Nenhum flashcard encontrado.</p>`;
        return;
    }

    for (const [stackName, cards] of Object.entries(stacks)) {
        const stackBtn = document.createElement('div');
        stackBtn.className = 'stack-card-btn';
        stackBtn.innerHTML = `
            <h3>${stackName}</h3>
            <p>${cards.length} cartas</p>
        `;
        
        stackBtn.addEventListener('click', () => {
            openDeck(cards);
        });

        stacksView.appendChild(stackBtn);
    }
}

function openDeck(cards) {
    currentDeckCards = cards;
    currentCardIndex = 0;
    
    document.getElementById('fc-stacks-view').style.display = 'none';
    document.getElementById('fc-deck-view').style.display = 'flex';
    
    renderCurrentCard();
}

function renderCurrentCard() {
    if (!currentDeckCards || currentDeckCards.length === 0) return;
    
    const cardInner = document.getElementById('fc-card-inner');
    const wordEl = document.getElementById('fc-word');
    const translationEl = document.getElementById('fc-translation');
    
    cardInner.classList.remove('flipped');
    
    const currentCard = currentDeckCards[currentCardIndex];
    wordEl.textContent = currentCard.word || '';
    translationEl.textContent = currentCard.translation || '';
}

function changeCardWithAnimation(direction) {
    if (!currentDeckCards || currentDeckCards.length === 0) return;

    const cardArea = document.getElementById('fc-card-area');
    if (!cardArea) return;

    // Define a animação de saída dependendo da tecla (Cima = sai subindo, Baixo = sai descendo)
    const slideOutClass = direction === 'up' ? 'slide-out-down' : 'slide-out-up';
    cardArea.classList.add(slideOutClass);

    setTimeout(() => {
        if (direction === 'up') {
            currentCardIndex--;
            if (currentCardIndex < 0) currentCardIndex = currentDeckCards.length - 1;
        } else {
            currentCardIndex++;
            if (currentCardIndex >= currentDeckCards.length) currentCardIndex = 0;
        }

        renderCurrentCard();

        // Remove a classe de saída e aplica a classe de entrada correspondente
        cardArea.classList.remove(slideOutClass);
        const slideInClass = direction === 'up' ? 'slide-in-up' : 'slide-in-down';
        cardArea.classList.add(slideInClass);

        setTimeout(() => {
            cardArea.classList.remove(slideInClass);
        }, 300);
    }, 300);
}

function playCurrentAudio() {
    if (!currentDeckCards || currentDeckCards.length === 0) return;
    const card = currentDeckCards[currentCardIndex];
    
    if (card.audio && card.audio.includes('translate.google.com')) {
        const utterance = new SpeechSynthesisUtterance(card.word);
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
        return;
    }

    if (card.audio && card.audio.trim() !== '') {
        try {
            const audio = new Audio(card.audio);
            const playPromise = audio.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn("Erro ao reproduzir link de áudio, usando voz nativa:", err);
                    const utterance = new SpeechSynthesisUtterance(card.word);
                    utterance.lang = 'en-US';
                    window.speechSynthesis.speak(utterance);
                });
            }
        } catch (err) {
            console.warn("Erro ao instanciar áudio:", err);
        }
    } else if (card.word) {
        const utterance = new SpeechSynthesisUtterance(card.word);
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
    }
}
