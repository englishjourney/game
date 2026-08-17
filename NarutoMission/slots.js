const Slots = {
    slotsCards: [[], [], [], []], // 4 slots

    distribute(deckArray) {
        // Coloca 3 cartas nos 3 primeiros slots, o 4º fica vazio
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (deckArray.length > 0) {
                    this.slotsCards[i].push(deckArray.pop());
                }
            }
        }
    },

    renderInitial(createCardElement) {
        for (let i = 0; i < 4; i++) {
            const slotEl = document.getElementById(`slot-${i+1}`);
            slotEl.innerHTML = ""; // Limpa visualmente
            
            this.slotsCards[i].forEach((cardObj, index) => {
                const cardEl = createCardElement(cardObj);
                // Dá um espaçamento vertical para parecer empilhado
                cardEl.style.top = `${index * 30}px`; 
                slotEl.appendChild(cardEl);
            });
        }
    }
};
