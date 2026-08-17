// Vocabulário categorizado
const vocab = [
    // Doenças
    { word: "Diarrhea", type: "disease" }, { word: "Headache", type: "disease" },
    { word: "Stomach ache", type: "disease" }, { word: "Backache", type: "disease" },
    { word: "Depression", type: "disease" }, { word: "Anxiety", type: "disease" },
    { word: "Tachycardia", type: "disease" }, { word: "Sadness", type: "disease" },
    { word: "Stress", type: "disease" }, { word: "Fever", type: "disease" },
    { word: "Cough", type: "disease" },
    // Medicações
    { word: "Dipyrone", type: "medication" }, { word: "Aspirin", type: "medication" },
    { word: "Medicine", type: "medication" }, { word: "Syrup", type: "medication" },
    { word: "Antibiotics", type: "medication" }, { word: "Painkiller", type: "medication" },
    // Tratamentos / Procedimentos
    { word: "Plenty of water", type: "treatment" }, { word: "Doctor", type: "treatment" },
    { word: "Rest", type: "treatment" }, { word: "Surgery", type: "treatment" },
    { word: "Bandage", type: "treatment" }, { word: "Injection", type: "treatment" }
];

const Stack = {
    deck: [],
    waste: [],

    init() {
        this.deck = this.shuffle([...vocab]);
        this.waste = [];
    },

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },

    drawCard() {
        if (this.deck.length === 0) {
            // Se o deck acabou, volta o waste para o deck
            if (this.waste.length === 0) return null;
            this.deck = this.waste.reverse();
            this.waste = [];
            return "reset";
        }
        const card = this.deck.pop();
        this.waste.push(card);
        return card;
    }
};
