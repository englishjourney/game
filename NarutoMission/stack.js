// Vocabulário de Saúde expandido (Doenças, Medicações, Tratamentos/Procedimentos)
const vocabularyList = [
    { word: 'Asthma', category: 'disease' },
    { word: 'Diabetes', category: 'disease' },
    { word: 'Hypertension', category: 'disease' },
    { word: 'Flu', category: 'disease' },
    { word: 'Cancer', category: 'disease' },
    { word: 'Arthritis', category: 'disease' },
    { word: 'Antibiotic', category: 'medication' },
    { word: 'Ibuprofen', category: 'medication' },
    { word: 'Paracetamol', category: 'medication' },
    { word: 'Vaccine', category: 'medication' },
    { word: 'Insulin', category: 'medication' },
    { word: 'Antihistamine', category: 'medication' },
    { word: 'Surgery', category: 'treatment' },
    { word: 'X-Ray', category: 'treatment' },
    { word: 'Blood Test', category: 'treatment' },
    { word: 'MRI', category: 'treatment' },
    { word: 'Biopsy', category: 'treatment' },
    { word: 'Ultrasound', category: 'treatment' }
];

let mainDeck = [];
let totalCardsInGame = 0;

function initDeck() {
    // Clona e embaralha o array de palavras
    mainDeck = [...vocabularyList];
    mainDeck.sort(() => Math.random() - 0.5);
    totalCardsInGame = mainDeck.length;
    updateDeckUI();
}

function drawCard() {
    if (mainDeck.length === 0) return null;
    const card = mainDeck.pop();
    updateDeckUI();
    return card;
}

function updateDeckUI() {
    document.getElementById('deck-count').innerText = mainDeck.length;
    if(mainDeck.length === 0) {
        document.getElementById('deck').style.opacity = '0.5';
        document.getElementById('deck').style.cursor = 'default';
    }
}
