let gameSlots = [null, null, null, null];

function initSlots() {
    // Coloca 3 cartas e deixa 1 vazio, conforme regra solicitada
    for(let i = 0; i < 3; i++) {
        gameSlots[i] = drawCard();
        renderCardInSlot(i, gameSlots[i]);
    }
    gameSlots[3] = null;
    renderCardInSlot(3, null);
}

function renderCardInSlot(index, cardData) {
    const slotEl = document.getElementById(`slot-${index}`);
    slotEl.innerHTML = ''; // Limpa o slot
    
    if (cardData) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        cardEl.innerText = cardData.word;
        cardEl.dataset.category = cardData.category;
        cardEl.id = `card-${cardData.word.replace(/\s+/g, '-')}`;
        cardEl.draggable = true;
        
        // Evento de Drag
        cardEl.addEventListener('dragstart', handleDragStart);
        
        slotEl.appendChild(cardEl);
    }
}

// Quando o jogador clica no baralho, ele tenta preencher os slots vazios
window.fillEmptySlots = function() {
    if (mainDeck.length === 0) return;
    
    let filledAny = false;
    for(let i = 0; i < 4; i++) {
        const slotEl = document.getElementById(`slot-${i}`);
        // Se o slot estiver vazio no DOM
        if (slotEl.children.length === 0) {
            const newCard = drawCard();
            if (newCard) {
                renderCardInSlot(i, newCard);
                filledAny = true;
            }
        }
    }
    
    if(!filledAny && mainDeck.length > 0) {
        alert("Não há slots vazios! Tente mover as cartas para os stacks corretos primeiro.");
    }
};
