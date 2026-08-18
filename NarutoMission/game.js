// ==========================================
// 1. BANCO DE PALAVRAS (VOCABULÁRIO)
// ==========================================
const vocabularyList = [
    { word: 'Asthma', category: 'disease' },
    { word: 'Diabetes', category: 'disease' },
    { word: 'Hypertension', category: 'disease' },
    { word: 'Flu', category: 'disease' },
    { word: 'Cancer', category: 'disease' },
    { word: 'Diarrhea', category: 'disease' },
    { word: 'Headache', category: 'disease' },
    { word: 'Backache', category: 'disease' },
    { word: 'Stomach ache', category: 'disease' },
    { word: 'Arthritis', category: 'disease' },
    { word: 'Antibiotic', category: 'medication' },
    { word: 'Ibuprofen', category: 'medication' },
    { word: 'Paracetamol', category: 'medication' },
    { word: 'Vaccine', category: 'medication' },
    { word: 'Insulin', category: 'medication' },
    { word: 'Antihistamine', category: 'medication' },
    { word: 'Dipyrone', category: 'medication' },
    { word: 'Surgery', category: 'treatment' },
    { word: 'X-Ray', category: 'treatment' },
    { word: 'Blood Test', category: 'treatment' },
    { word: 'Magnetic resonance', category: 'treatment' },
    { word: 'Biopsy', category: 'treatment' },
    { word: 'Ultrasound', category: 'treatment' }
];

// ==========================================
// 2. VARIÁVEIS GLOBAIS E ESTADO DO JOGO
// ==========================================
let mainDeck = [];
let totalCardsInGame = 0;
let gameSlots = [null, null, null, null];
let currentUser = "";
let cardsSorted = 0;

// ==========================================
// 3. CONFIGURAÇÃO DO SUPABASE
// ==========================================
const { createClient } = window.supabase;
const SUPABASE_URL = 'https://rmsmamzutvxugdbiqsrz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMNCps2v2Odflpq9zDt_dw_Cgb_Jcxx';
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
const MISSION_NAME = "Naruto's health game";

// ==========================================
// 4. LÓGICA DO BARALHO E SLOTS
// ==========================================
function initDeck() {
    mainDeck = [...vocabularyList];
    mainDeck.sort(() => Math.random() - 0.5); // Embaralha as cartas
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
    const deckCountEl = document.getElementById('deck-count');
    const deckEl = document.getElementById('deck');
    
    if (deckCountEl) deckCountEl.innerText = mainDeck.length;
    
    if(mainDeck.length === 0 && deckEl) {
        deckEl.style.opacity = '0.5';
        deckEl.style.cursor = 'default';
    }
}

function initSlots() {
    // Sorteia 3 cartas e deixa o slot 4 (index 3) vazio
    for(let i = 0; i < 3; i++) {
        gameSlots[i] = drawCard();
        renderCardInSlot(i, gameSlots[i]);
    }
    gameSlots[3] = null;
    renderCardInSlot(3, null);
}

function renderCardInSlot(index, cardData) {
    const slotEl = document.getElementById(`slot-${index}`);
    if (!slotEl) return;
    
    slotEl.innerHTML = ''; // Limpa o slot atual
    
    if (cardData) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        cardEl.innerText = cardData.word;
        cardEl.dataset.category = cardData.category;
        cardEl.id = `card-${cardData.word.replace(/\s+/g, '-')}`;
        cardEl.draggable = true;
        
        // Atrela o evento de arrastar
        cardEl.addEventListener('dragstart', handleDragStart);
        
        slotEl.appendChild(cardEl);
    }
}

// Função chamada pelo HTML ao clicar no baralho
window.fillEmptySlots = function() {
    if (mainDeck.length === 0) return;
    
    let filledAny = false;
    for(let i = 0; i < 4; i++) {
        const slotEl = document.getElementById(`slot-${i}`);
        if (slotEl && slotEl.children.length === 0) {
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

// ==========================================
// 5. INICIALIZAÇÃO E AUTENTICAÇÃO
// ==========================================
document.getElementById('start-btn').addEventListener('click', async () => {
    const userInput = document.getElementById('username-input').value.trim();
    const msgEl = document.getElementById('auth-msg');
    
    if (!userInput) {
        msgEl.innerText = "Por favor, insira um nome de usuário.";
        return;
    }
    
    msgEl.innerText = "Verificando dados da missão...";
    
    try {
        const { data: missionData, error: missionErr } = await supabaseClient
            .from('missions')
            .select('*')
            .eq('mission_name', MISSION_NAME)
            .single();

        if (missionErr) throw missionErr;

        const doneList = missionData.done ? missionData.done.split(',') : [];
        if (doneList.includes(userInput)) {
            msgEl.innerText = "Você já completou esta missão! Não é possível jogar novamente.";
            return;
        }

        const { data: userData } = await supabaseClient
            .from('users')
            .select('*')
            .eq('username', userInput)
            .single();

        if (!userData) {
            await supabaseClient.from('users').insert({ username: userInput, score: 0 });
        }

        // Tudo certo, iniciar!
        currentUser = userInput;
        const nameDisplay = document.getElementById('current-username');
        if (nameDisplay) nameDisplay.innerText = currentUser;
        
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        
        startGame();

    } catch (error) {
        console.error(error);
        msgEl.innerText = "Erro ao conectar com o banco. Verifique o console.";
    }
});

function startGame() {
    cardsSorted = 0;
    initDeck();
    initSlots();
    setupDropTargets();
}

// ==========================================
// 6. LÓGICA DE DRAG & DROP
// ==========================================
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.id);
    e.dataTransfer.setData('category', e.target.dataset.category);
}

function setupDropTargets() {
    const targets = document.querySelectorAll('.target-stack');
    
    targets.forEach(target => {
        target.addEventListener('dragover', (e) => {
            e.preventDefault(); 
        });

        target.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            const draggedCategory = e.dataTransfer.getData('category');
            const targetCategory = target.dataset.targetCategory;
            
            if (draggedCategory === targetCategory) {
                const cardEl = document.getElementById(draggedId);
                if (cardEl) {
                    target.appendChild(cardEl);
                    cardEl.draggable = false;
                    cardEl.style.position = 'relative'; 
                    cardEl.style.marginTop = '-20px'; 
                    
                    cardsSorted++;
                    checkWinCondition();
                }
            } else {
                alert('Categoria incorreta! Pense melhor, a qual grupo essa palavra pertence?');
            }
        });
    });
}

// ==========================================
// 7. CONDIÇÕES DE VITÓRIA E DESISTÊNCIA
// ==========================================
async function checkWinCondition() {
    if (cardsSorted === totalCardsInGame) {
        alert("Parabéns! Você organizou todas as palavras nos stacks corretos!");
        await handleGameEnd(true);
    }
}

document.getElementById('giveup-btn').addEventListener('click', async () => {
    const confirmGiveUp = confirm("Tem certeza que deseja desistir da missão?");
    if (confirmGiveUp) {
        await handleGameEnd(false);
    }
});

async function handleGameEnd(isWin) {
    try {
        // Busca o estado atualizado da missão
        const { data: missionData } = await supabaseClient
            .from('missions')
            .select('*')
            .eq('mission_name', MISSION_NAME)
            .single();

        if (isWin) {
            // == VITÓRIA ==
            // 1. Atualizar Score do User (+10)
            const { data: userData } = await supabaseClient
                .from('users')
                .select('score')
                .eq('username', currentUser)
                .single();
                
            // CORREÇÃO: Forçar a transformação do score atual para NÚMERO (Number)
            const scoreAtual = Number(userData.score) || 0;
            const newScore = scoreAtual + 10;
            
            await supabaseClient.from('users').update({ score: newScore }).eq('username', currentUser);

            // 2. Adicionar na lista 'done'
            let doneList = missionData.done ? missionData.done.split(',') : [];
            if (!doneList.includes(currentUser)) {
                doneList.push(currentUser);
                await supabaseClient.from('missions').update({ done: doneList.join(',') }).eq('mission_name', MISSION_NAME);
            }
            alert(`Você ganhou 10 pontos! Seu novo score é: ${newScore}`);
            
        } else {
            // == DERROTA / DESISTÊNCIA ==
            // Adicionar na lista 'fail'
            let failList = missionData.fail ? missionData.fail.split(',') : [];
            if (!failList.includes(currentUser)) {
                failList.push(currentUser);
                await supabaseClient.from('missions').update({ fail: failList.join(',') }).eq('mission_name', MISSION_NAME);
            }
            alert("Você não concluiu a missão. Seu nome foi registrado na lista de falhas.");
        }

        // Retorna para a tela de login
        window.location.reload();

    } catch (error) {
        console.error("Erro ao atualizar banco no final do jogo:", error);
        alert("Ocorreu um erro ao salvar o progresso.");
    }
}
