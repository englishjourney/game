// ==========================================
// WATCH.JS - SISTEMA ANTI-COLA
// ==========================================

let isWatching = false;
let cheatTimeout = null;
let currentWatchMission = "";
let currentWatchUser = "";

// Função para INICIAR a observação
// Deve ser chamada quando o aluno abre a missão
function startWatch(missionName, username) {
    if (!missionName || !username) return;
    
    isWatching = true;
    currentWatchMission = missionName;
    currentWatchUser = username;
    
    console.log(`[Watch.js] Vigiando aluno: ${currentWatchUser} na missão: ${currentWatchMission}`);

    // Adiciona os ouvintes de evento
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("paste", handlePaste);
}

// Função para PARAR a observação
// Deve ser chamada quando o aluno fecha o dialog/modal da missão
function stopWatch() {
    isWatching = false;
    currentWatchMission = "";
    currentWatchUser = "";
    
    if (cheatTimeout) {
        clearTimeout(cheatTimeout);
        cheatTimeout = null;
    }

    // Remove os ouvintes para não pesar o site
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("paste", handlePaste);
    
    console.log("[Watch.js] Vigilância encerrada.");
}

// Verifica se o aluno saiu da aba (mudou de aba ou minimizou)
function handleVisibilityChange() {
    if (!isWatching) return;

    if (document.hidden) {
        // Aluno saiu da aba. Começa a contar 2 segundos (2000 milissegundos)
        console.log("[Watch.js] Aluno saiu da aba. Iniciando contagem regressiva...");
        cheatTimeout = setTimeout(() => {
            triggerCheatFail(); // Passou de 2 segundos, reprova!
        }, 2000);
    } else {
        // Aluno voltou para a aba
        if (cheatTimeout) {
            clearTimeout(cheatTimeout); // Cancela a contagem se voltou antes de 2 segundos
            cheatTimeout = null;
            console.log("[Watch.js] Aluno voltou rápido o suficiente. Ufa!");
        }
    }
}

// Tenta pegar o atalho de "Colar" na página principal
function handlePaste(e) {
    if (!isWatching) return;
    console.log("[Watch.js] Tentativa de cola (Ctrl+V) detectada.");
    triggerCheatFail();
}

// Função que reprova o aluno e atualiza o Supabase
async function triggerCheatFail() {
    if (!isWatching) return; // Evita que rode duas vezes seguidas
    
    stopWatch(); // Para de vigiar imediatamente

    // Mensagem de alerta exigida
    alert("Falha na missão. Você está proibido de concluir a missão, pois o sistema detectou tentativa de cola.");

    // Fecha o modal da missão (Ajuste o ID 'mission-modal' se o seu for diferente)
    const missionModal = document.getElementById('mission-modal') || document.querySelector('dialog');
    if (missionModal) missionModal.close();

    try {
        // 1. Conecta com o Supabase (garanta que o client esteja acessível, ex: window.supabaseClient)
        // Se no seu main.js a variável for 'supabase', use 'supabase' em vez de 'supabaseClient'
        const db = window.supabaseClient || window.supabase; 

        // 2. Busca os dados atuais da missão
        const { data: missionData, error: fetchError } = await db
            .from('missions')
            .select('fail')
            .eq('mission_name', currentWatchMission)
            .single();

        if (fetchError) throw fetchError;

        // 3. Verifica se o usuário já está na lista fail
        let failList = missionData.fail ? missionData.fail.split(',').map(s => s.trim()) : [];
        
        if (!failList.includes(currentWatchUser)) {
            failList.push(currentWatchUser);
            const updatedFailString = failList.join(',');

            // 4. Atualiza a coluna fail no Supabase
            const { error: updateError } = await db
                .from('missions')
                .update({ fail: updatedFailString })
                .eq('mission_name', currentWatchMission);

            if (updateError) throw updateError;
            console.log(`[Watch.js] Usuário ${currentWatchUser} registrado em FAIL por colar.`);
        }

        // Recarrega a página para atualizar os status das missões do aluno
        window.location.reload();

    } catch (err) {
        console.error("[Watch.js] Erro ao registrar falha no Supabase:", err);
    }
}
