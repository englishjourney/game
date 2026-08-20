// flashcards.js
import { supabase } from './supabase.js'; // Mantenha a importação como você já usava

let currentDeckCards = [];
let currentCardIndex = 0;

// Escutador global para a tecla de seta direita
document.addEventListener('keydown', (e) => {
    const deckView = document.getElementById('fc-deck-view');
    // Verifica se o modal de flashcards e a visualização do baralho estão ativos
    if (deckView && deckView.style.display !== 'none') {
        if (e.key === 'ArrowRight') {
            nextCard();
        }
    }
});

export async function openFlashcards() {
    const modal = document.getElementById('content-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = modal.querySelector('.modal-body') || modal; 
    
    if (modalTitle) modalTitle.textContent = "Flashcards";

    // Estrutura HTML Injetada: View 1 (Menu de Stacks) e View 2 (Cartas Empilhadas)
    modalBody.innerHTML = `
        <div id="flashcards-container" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
            
            <!-- View 1: Stacks Menu -->
            <div id="fc-stacks-view" style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center; padding: 20px;">
                <p>Carregando seus stacks...</p>
            </div>

            <!-- View 2: Active Deck (Cartas Empilhadas) -->
            <div id="fc-deck-view" style="display: none; flex-direction: column; align-items: center; justify-content: center; flex: 1; position: relative; width: 100%; height: 100%; min-height: 400px; padding: 20px;">
                
                <div id="fc-card-area" class="flashcard-container">
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
                
                <p style="margin-top: 25px; font-size: 0.9em; opacity: 0.7; pointer-events: none;">
                    Clique na carta para virar.<br>Clique fora ou aperte ➡️ para próxima carta.
                </p>
            </div>
        </div>
    `;

    modal.showModal();

    // Lógicas de clique na área do Deck
    const deckView = document.getElementById('fc-deck-view');
    const cardInner = document.getElementById('fc-card-inner');
    const btnAudio = document.getElementById('fc-btn-audio');

    // Clicar numa área vazia (fora da carta) passa para a próxima
    deckView.addEventListener('click', (e) => {
        if (e.target === deckView) {
            nextCard();
        }
    });

    // Clicar na carta faz o flip
    cardInner.addEventListener('click', () => {
        cardInner.classList.toggle('flipped');
    });

    // Clicar no áudio
    btnAudio.addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que a carta vire ao clicar no áudio
        const card = currentDeckCards[currentCardIndex];
        
        if (card && card.audio && card.audio.trim() !== '') {
            try {
                const audio = new Audio(card.audio);
                const playPromise = audio.play();
                
                // Tratamento seguro da Promessa de áudio (Resolve o erro "NotSupportedError")
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn("Erro ao reproduzir áudio (formato não suportado ou URL inválida):", err);
                    });
                }
            } catch (err) {
                console.warn("Erro ao instanciar áudio:", err);
            }
        } else {
            console.warn("Esta carta não possui áudio válido.");
        }
    });

    // Buscar dados do banco
    try {
        const { data: cards, error } = await supabase.from('flashcards').select('*');
        if (error) throw error;

        // Agrupar as cartas espalhadas por Stack
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

    // Criar botões em formato de carta para cada Stack
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
    
    // Esconde os Stacks e mostra a área das cartas
    document.getElementById('fc-stacks-view').style.display = 'none';
    document.getElementById('fc-deck-view').style.display = 'flex';
    
    renderCurrentCard();
}

function renderCurrentCard() {
    if (!currentDeckCards || currentDeckCards.length === 0) return;
    
    const cardInner = document.getElementById('fc-card-inner');
    const wordEl = document.getElementById('fc-word');
    const translationEl = document.getElementById('fc-translation');
    
    // Garante que a carta inicie mostrando a frente
    cardInner.classList.remove('flipped');
    
    // Um leve delay para que o texto só mude após a carta desvirar (efeito mais natural)
    setTimeout(() => {
        const currentCard = currentDeckCards[currentCardIndex];
        wordEl.textContent = currentCard.word || '';
        translationEl.textContent = currentCard.translation || '';
    }, 150);
}

function nextCard() {
    if (!currentDeckCards || currentDeckCards.length === 0) return;
    
    currentCardIndex++;
    
    // Se chegou ao fim do deck, volta para a primeira carta criando um loop infinito
    if (currentCardIndex >= currentDeckCards.length) {
        currentCardIndex = 0;
    }
    
    renderCurrentCard();
}
