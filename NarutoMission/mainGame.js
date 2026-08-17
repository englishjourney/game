// Configuração Supabase
const { createClient } = window.supabase;
const SUPABASE_URL = 'https://rmsmamzutvxugdbiqsrz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMNCps2v2Odflpq9zDt_dw_Cgb_Jcxx';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MISSION_NAME = "Naruto's health game";
let currentUser = "";
let cardsSorted = 0; // Para rastrear a condição de vitória

// ======================
// LOGIN & INICIALIZAÇÃO
// ======================
document.getElementById('start-btn').addEventListener('click', async () => {
    const userInput = document.getElementById('username-input').value.trim();
    const msgEl = document.getElementById('auth-msg');
    
    if (!userInput) {
        msgEl.innerText = "Por favor, insira um nome de usuário.";
        return;
    }
    
    msgEl.innerText = "Verificando dados da missão...";
    
    try {
        // Busca os dados da Missão
        const { data: missionData, error: missionErr } = await supabase
            .from('missions')
            .select('*')
            .eq('mission_name', MISSION_NAME)
            .single();

        if (missionErr) throw missionErr;

        // Verifica se usuário já está na lista 'done'
        const doneList = missionData.done ? missionData.done.split(',') : [];
        if (doneList.includes(userInput)) {
            msgEl.innerText = "Você já completou esta missão! Não é possível jogar novamente.";
            return;
        }

        // Verifica se o usuário existe na tabela users, se não, cria.
        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('username', userInput)
            .single();

        if (!userData) {
            await supabase.from('users').insert({ username: userInput, score: 0 });
        }

        // Sucesso: Iniciar Game
        currentUser = userInput;
        document.getElementById('current-username').innerText = currentUser;
        
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        
        startGame();

    } catch (error) {
        console.error(error);
        msgEl.innerText = "Erro ao conectar com o banco de dados. Verifique o console.";
    }
});

function startGame() {
    cardsSorted = 0;
    initDeck();
    initSlots();
    setupDropTargets();
}

// ======================
// LÓGICA DE DRAG & DROP
// ======================
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.id);
    e.dataTransfer.setData('category', e.target.dataset.category);
}

function setupDropTargets() {
    const targets = document.querySelectorAll('.target-stack');
    
    targets.forEach(target => {
        target.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necessário para permitir o drop
        });

        target.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            const draggedCategory = e.dataTransfer.getData('category');
            const targetCategory = target.dataset.targetCategory;
            
            // Lógica de validação do stack
            if (draggedCategory === targetCategory) {
                const cardEl = document.getElementById(draggedId);
                target.appendChild(cardEl);
                cardEl.draggable = false; // Trava a carta no lugar
                cardEl.style.position = 'relative'; 
                cardEl.style.marginTop = '-20px'; // Efeito visual de empilhamento
                
                cardsSorted++;
                checkWinCondition();
            } else {
                alert('Categoria incorreta! Pense melhor, a qual grupo essa palavra pertence?');
            }
        });
    });
}

// ======================
// LÓGICA DE FIM DE JOGO
// ======================
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
        const { data: missionData } = await supabase
            .from('missions')
            .select('*')
            .eq('mission_name', MISSION_NAME)
            .single();

        if (isWin) {
            // == VITÓRIA ==
            // 1. Atualizar Score do User (+10)
            const { data: userData } = await supabase
                .from('users')
                .select('score')
                .eq('username', currentUser)
                .single();
                
            const newScore = (userData.score || 0) + 10;
            await supabase.from('users').update({ score: newScore }).eq('username', currentUser);

            // 2. Adicionar na lista 'done'
            let doneList = missionData.done ? missionData.done.split(',') : [];
            if (!doneList.includes(currentUser)) {
                doneList.push(currentUser);
                await supabase.from('missions').update({ done: doneList.join(',') }).eq('mission_name', MISSION_NAME);
            }
            alert(`Você ganhou 10 pontos! Seu novo score é: ${newScore}`);
            
        } else {
            // == DERROTA / DESISTÊNCIA ==
            // Adicionar na lista 'fail'
            let failList = missionData.fail ? missionData.fail.split(',') : [];
            if (!failList.includes(currentUser)) {
                failList.push(currentUser);
                await supabase.from('missions').update({ fail: failList.join(',') }).eq('mission_name', MISSION_NAME);
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
