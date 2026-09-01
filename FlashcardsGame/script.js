// script.js
import { checkUserExists, checkActiveSession } from './auth.js';
import { GameEngine } from './game.js';

// ATENÇÃO: Insira suas credenciais do Supabase aqui
const SUPABASE_URL = 'https://rmsmamzutvxugdbiqsrz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMNCps2v2Odflpq9zDt_dw_Cgb_Jcxx';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado Global
let currentUser = null;
let currentRoom = null;
let availableStacks = [];
let gameEngine = null;
let roomSubscription = null;

// Elementos da UI (Utilitário)
const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
};

// ==========================================
// 1. LOGIN
// ==========================================
document.getElementById('login-btn').addEventListener('click', async () => {
    const username = document.getElementById('username-input').value.trim();
    if (!username) return;

    const user = await checkUserExists(supabaseClient, username);
    if (!user) {
        document.getElementById('login-error').classList.remove('hidden');
        return;
    }

    currentUser = user;
    document.getElementById('welcome-msg').innerText = `Welcome, ${user.username}!`;
    
    // Verifica se já está numa sala
    const activeRoom = await checkActiveSession(supabaseClient, user.username);
    if (activeRoom) {
        currentRoom = activeRoom;
        if(activeRoom.status === 'playing') joinGameScreen();
        else joinWaitingRoom();
    } else {
        showScreen('menu-screen');
    }
});

// ==========================================
// 2. MENU PRINCIPAL
// ==========================================
document.getElementById('show-create-btn').addEventListener('click', async () => {
    document.getElementById('room-name-display').innerText = `${currentUser.username}'s room`;
    document.getElementById('new-room-id').value = generateRoomID();
    await loadStacksToForm();
    showScreen('create-room-screen');
});

document.getElementById('show-join-btn').addEventListener('click', () => {
    showScreen('join-room-screen');
});

function generateRoomID() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    return letters.charAt(Math.floor(Math.random() * 26)) +
           letters.charAt(Math.floor(Math.random() * 26)) +
           numbers.charAt(Math.floor(Math.random() * 10)) +
           numbers.charAt(Math.floor(Math.random() * 10));
}

// ==========================================
// 3. CRIAR SALA
// ==========================================
async function loadStacksToForm() {
    const { data } = await supabaseClient.from('flashcards').select('stack');
    availableStacks = [...new Set(data.map(item => item.stack))];
    
    const container = document.getElementById('stacks-container');
    container.innerHTML = '';
    for(let i=0; i<4; i++) addStackDropdown(container);
}

function addStackDropdown(container) {
    const select = document.createElement('select');
    select.className = 'stack-select';
    availableStacks.forEach(s => {
        let opt = document.createElement('option');
        opt.value = s; opt.innerText = s;
        select.appendChild(opt);
    });
    container.appendChild(select);
}

document.getElementById('add-stack-btn').addEventListener('click', () => {
    addStackDropdown(document.getElementById('stacks-container'));
});

document.getElementById('create-room-btn').addEventListener('click', async () => {
    const roomID = document.getElementById('new-room-id').value;
    const roomPW = document.getElementById('new-room-pw').value;
    const selects = document.querySelectorAll('.stack-select');
    
    if (roomPW.length < 4 || roomPW.length > 6) return alert("Password must be 4 to 6 digits.");
    
    let selectedStacks = [];
    selects.forEach(s => selectedStacks.push(s.value));
    selectedStacks = [...new Set(selectedStacks)]; // Remove duplicadas

    if (selectedStacks.length < 4) return alert("Select at least 4 distinct stacks.");

    const imPlayer = document.getElementById('im-player-check').checked;
    const players = imPlayer ? [currentUser.username] : [];

    const { data, error } = await supabaseClient.from('flashcardsGame').insert([{
        roomID,
        roomPW,
        stacks: selectedStacks,
        host: currentUser.username,
        players: players,
        status: 'waiting'
    }]).select().single();

    if (error) return console.error(error);
    currentRoom = data;
    joinWaitingRoom();
});

// ==========================================
// 4. ENTRAR NA SALA
// ==========================================
document.getElementById('join-room-btn').addEventListener('click', async () => {
    const roomID = document.getElementById('join-room-id').value.toUpperCase();
    const roomPW = document.getElementById('join-room-pw').value;

    const { data, error } = await supabaseClient.from('flashcardsGame')
        .select('*')
        .eq('roomID', roomID)
        .eq('roomPW', roomPW)
        .single();

    if (error || !data) {
        document.getElementById('join-error').classList.remove('hidden');
        return;
    }

    let players = [];
    if (Array.isArray(data.players)) {
        players = data.players;
    } else if (typeof data.players === 'string') {
        players = data.players.replace(/[\[\]{}"']/g, '').split(',').map(p => p.trim()).filter(p => p !== '');
    }

    if (!players.includes(currentUser.username)) {
        players.push(currentUser.username);
        await supabaseClient.from('flashcardsGame').update({ players }).eq('roomID', roomID);
    }

    currentRoom = data;
    joinWaitingRoom();
});

// ==========================================
// 5. SALA DE ESPERA E REALTIME (CORRIGIDO)
// ==========================================
async function joinWaitingRoom() {
    showScreen('waiting-screen');
    document.getElementById('wait-room-id').innerText = currentRoom.roomID;
    document.getElementById('wait-room-pw').innerText = currentRoom.roomPW;
    
    if (currentRoom.host === currentUser.username) {
        document.getElementById('host-controls').classList.remove('hidden');
    } else {
        document.getElementById('host-controls').classList.add('hidden');
    }

    subscribeToRoomUpdates();
    await updatePlayersList();
}

async function updatePlayersList() {
    const { data: roomData } = await supabaseClient.from('flashcardsGame').select('players').eq('roomID', currentRoom.roomID).single();
    if(!roomData) return;

    let players = [];
    if (Array.isArray(roomData.players)) {
        players = roomData.players;
    } else if (typeof roomData.players === 'string') {
        players = roomData.players.replace(/[\[\]{}"']/g, '').split(',').map(p => p.trim()).filter(p => p !== '');
    }

    const list = document.getElementById('players-list');
    list.innerHTML = '';

    for (let username of players) {
        const { data: user } = await supabaseClient.from('users').select('avatar_url').eq('username', username).single();
        const div = document.createElement('div');
        div.className = 'player-row';
        div.innerHTML = `<img src="${user?.avatar_url || 'default-avatar.png'}" alt="avatar"> <span>${username}</span>`;
        list.appendChild(div);
    }
}

function subscribeToRoomUpdates() {
    if (roomSubscription) supabaseClient.removeChannel(roomSubscription);
    
    roomSubscription = supabaseClient.channel(`room:${currentRoom.roomID}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'flashcardsGame', filter: `roomID=eq.${currentRoom.roomID}` }, payload => {
            
            // AQUI ESTÁ A CORREÇÃO: Pegamos o status antigo e novo
            const oldStatus = payload.old.status;
            const newStatus = payload.new.status;
            currentRoom = payload.new;

            // Só reinicia telas de carregamento/jogo se houve MUDANÇA de estado
            if (newStatus === 'playing' && oldStatus !== 'playing') {
                joinGameScreen();
            } else if (newStatus === 'ended' && oldStatus !== 'ended') {
                showEndScreen();
            } else if (newStatus === 'waiting' && oldStatus !== 'waiting') {
                joinWaitingRoom(); // Host clicou em Play Again
            } else if (newStatus === 'waiting') {
                updatePlayersList();
            }
            
            // A pontuação atualiza sempre de forma passiva, sem reiniciar o jogo!
            updateScoreboardUI();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'flashcardsGame', filter: `roomID=eq.${currentRoom.roomID}` }, payload => {
            alert("The host closed the room.");
            window.location.reload();
        })
        .subscribe();
}

document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);
document.getElementById('leave-end-btn').addEventListener('click', leaveRoom);

async function leaveRoom() {
    if (currentRoom.host === currentUser.username) {
        await supabaseClient.from('flashcardsGame').delete().eq('roomID', currentRoom.roomID);
    } else {
        const players = currentRoom.players.filter(p => p !== currentUser.username);
        await supabaseClient.from('flashcardsGame').update({ players }).eq('roomID', currentRoom.roomID);
    }
    window.location.reload();
}

// ==========================================
// 6. GAMEPLAY
// ==========================================
document.getElementById('start-game-btn').addEventListener('click', async () => {
    await supabaseClient.from('flashcardsGame').update({ status: 'playing' }).eq('roomID', currentRoom.roomID);
});

async function joinGameScreen() {
    showScreen('game-screen');
    
    // Agora é 100% seguro criar o GameEngine aqui, pois ele rodará UMA única vez por partida!
    gameEngine = new GameEngine(supabaseClient, currentRoom, currentUser);
    
    let players = [];
    if (Array.isArray(currentRoom.players)) players = currentRoom.players;
    else if (typeof currentRoom.players === 'string') players = currentRoom.players.replace(/[\[\]{}"']/g, '').split(',').map(p => p.trim());

    if(!players.includes(currentUser.username)) return; 

    await gameEngine.init();
    
    // Contagem 3, 2, 1
    const countdownEl = document.getElementById('countdown-display');
    countdownEl.classList.remove('hidden');
    let count = 3;
    const countInt = setInterval(() => {
        count--;
        countdownEl.innerText = count > 0 ? count : 'GO!';
        if (count < 0) {
            clearInterval(countInt);
            countdownEl.classList.add('hidden');
            document.getElementById('gameplay-area').classList.remove('hidden');
            renderCard();
        }
    }, 1000);
}

function updateScoreboardUI() {
    if(!currentRoom) return;
    document.getElementById('score-team1').innerText = currentRoom.team1_score;
    document.getElementById('score-team2').innerText = currentRoom.team2_score;
}

async function renderCard() {
    const card = gameEngine.getCurrentCard();
    
    // SE NÃO TEM MAIS CARTA: ESTE JOGADOR TERMINOU, ACABA O JOGO PARA TODOS
    if (!card) return endGame(); 

    const cardInner = document.getElementById('flashcard');
    cardInner.classList.remove('flipped');
    
    const cardBack = document.getElementById('card-translation');
    cardBack.className = 'card-back'; 
    
    document.getElementById('card-word').innerText = card.word;
    cardBack.innerText = card.translation;

    const options = await gameEngine.getOptionsForCurrentCard();
    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = async () => {
            grid.querySelectorAll('button').forEach(b => b.disabled = true);
            
            const isCorrect = await gameEngine.handleAnswer(opt);
            cardInner.classList.add('flipped');
            cardBack.classList.add(isCorrect ? 'correct' : 'wrong');

            setTimeout(() => renderCard(), 1500);
        };
        grid.appendChild(btn);
    });
}

async function endGame() {
    // Quem chegar aqui primeiro encerra a sala (e o Realtime de todo mundo abre a tela final)
    await supabaseClient.from('flashcardsGame').update({ status: 'ended' }).eq('roomID', currentRoom.roomID);
}

function showEndScreen() {
    showScreen('end-screen');
    const msg = document.getElementById('winner-msg');
    
    if (currentRoom.team1_score > currentRoom.team2_score) msg.innerText = "Team RED Wins!";
    else if (currentRoom.team2_score > currentRoom.team1_score) msg.innerText = "Team BLUE Wins!";
    else msg.innerText = "It's a TIE!";
}

// Quando o Host quiser jogar de novo:
document.getElementById('play-again-btn').addEventListener('click', async () => {
    if (currentRoom.host === currentUser.username) {
        // Apenas reseta a sala no banco, o Realtime cuida do resto!
        await supabaseClient.from('flashcardsGame').update({ 
            status: 'waiting', 
            team1_score: 0, 
            team2_score: 0 
        }).eq('roomID', currentRoom.roomID);
    }
});
