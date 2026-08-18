// watch.js
import { supabase } from './supabaseClient.js';

let isWatching = false;
let cheatTimeout = null;
let currentWatchMission = "";
let currentWatchUser = "";

// Inicia a vigilância
export function startWatch(missionName, username) {
    if (!missionName || !username) return;
    
    // Se já estiver vigiando a mesma missão do mesmo usuário, não precisa reiniciar
    if (isWatching && currentWatchMission === missionName && currentWatchUser === username) return;

    isWatching = true;
    currentWatchMission = missionName;
    currentWatchUser = username;
    
    console.log(`[Watch.js] Vigiando aluno: ${currentWatchUser} na missão: ${currentWatchMission}`);

    // Remove ouvintes antigos por segurança antes de adicionar
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("paste", handlePaste);

    // Adiciona os ouvintes de evento
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("paste", handlePaste);
}

// Para a vigilância (ex: ao fechar o modal)
export function stopWatch() {
    isWatching = false;
    currentWatchMission = "";
    currentWatchUser = "";
    
    if (cheatTimeout) {
        clearTimeout(cheatTimeout);
        cheatTimeout = null;
    }

    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("paste", handlePaste);
    
    console.log("[Watch.js] Vigilância encerrada.");
}

function handleVisibilityChange() {
    if (!isWatching) return;

    if (document.hidden) {
        console.log("[Watch.js] Aluno saiu da aba. Contando 2 segundos...");
        cheatTimeout = setTimeout(() => {
            triggerCheatFail();
        }, 2000);
    } else {
        if (cheatTimeout) {
            clearTimeout(cheatTimeout);
            cheatTimeout = null;
            console.log("[Watch.js] Aluno voltou a tempo.");
        }
    }
}

function handlePaste(e) {
    if (!isWatching) return;
    console.log("[Watch.js] Tentativa de cola (Ctrl+V) detectada.");
    triggerCheatFail();
}

async function triggerCheatFail() {
    if (!isWatching) return;
    
    const missionToFail = currentWatchMission;
    const userToFail = currentWatchUser;

    stopWatch(); // Para de vigiar imediatamente

    alert("Falha na missão. Você está proibido de concluir a missão, pois o sistema detectou tentativa de cola.");

    // Tenta fechar o modal aberto na tela
    const modal = document.getElementById('content-modal') || document.querySelector('dialog');
    if (modal && typeof modal.close === 'function') {
        modal.close();
    }

    try {
        // Busca os dados da missão no Supabase
        const { data: missionData, error: fetchError } = await supabase
            .from('missions')
            .select('fail')
            .eq('mission_name', missionToFail)
            .single();

        if (fetchError) throw fetchError;

        let failList = [];
        if (missionData && missionData.fail) {
            if (Array.isArray(missionData.fail)) {
                failList = missionData.fail;
            } else if (typeof missionData.fail === 'string') {
                failList = missionData.fail.split(',').map(s => s.trim());
            }
        }
        
        if (!failList.includes(userToFail)) {
            failList.push(userToFail);
            const updatedFailString = failList.join(',');

            await supabase
                .from('missions')
                .update({ fail: updatedFailString })
                .eq('mission_name', missionToFail);

            console.log(`[Watch.js] Usuário ${userToFail} marcado como FAIL.`);
        }

        // Recarrega a página para atualizar os marcadores do mapa
        window.location.reload();

    } catch (err) {
        console.error("[Watch.js] Erro ao registrar falha no Supabase:", err);
    }
}
