/// missions.js
import { supabase } from './supabaseClient.js';
import { getSession } from './auth.js';
import { runWithLoader } from './loader.js'; 

// Função inteligente para corrigir os links do Google automaticamente
function getEmbedUrl(url) {
    if (!url) return "";
    let finalUrl = url;

    // 1. Arquivos do Google Drive
    if (finalUrl.includes("drive.google.com/file/d/")) {
        finalUrl = finalUrl.replace(/\/view.*$/, "/preview");
    }
    // 2. Google Docs, Sheets ou Slides
    else if (finalUrl.includes("docs.google.com/document") || 
             finalUrl.includes("docs.google.com/spreadsheets") || 
             finalUrl.includes("docs.google.com/presentation")) {
        // Troca o /edit por /preview para permitir o iframe
        finalUrl = finalUrl.replace(/\/edit.*$/, "/preview");
    }
    // 3. Google Forms
    else if (finalUrl.includes("docs.google.com/forms")) {
        // Troca /edit por /viewform
        finalUrl = finalUrl.replace(/\/edit.*$/, "/viewform");
        
        // Adiciona o embedded=true do jeito certo (sem duplicar '?')
        if (!finalUrl.includes("embedded=true")) {
            const separator = finalUrl.includes("?") ? "&" : "?";
            finalUrl += separator + "embedded=true";
        }
    }

    return finalUrl;
}

// missions.js (mantenha os imports e a função getEmbedUrl no topo)

export async function openMissions() {
    const session = getSession();
    if (!session) return;

    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('content-modal');
    
    modalContent.innerHTML = `<h3 style="text-align:center; color: var(--primary-color);">Carregando Mapa...</h3>`;
    modal.showModal();

    try {
        const { data: missions, error } = await runWithLoader(async () => {
            return await supabase
                .from('missions')
                .select('*')
                .order('id', { ascending: true });
        });

        if (error) throw error;

        if (!missions || missions.length === 0) {
            modalContent.innerHTML = `<h2 style="text-align:center; color: var(--primary-color);">Nenhuma missão encontrada!</h2>`;
            return; 
        }

        let mapHTML = `<div class="mission-map-container">`;
        let activeMissionHTML = ""; // Formulário ficará guardado aqui
        let activeFound = false;

        const getAsArray = (fieldData) => {
            if (!fieldData) return [];
            if (Array.isArray(fieldData)) return fieldData;
            if (typeof fieldData === 'string') {
                try {
                    const parsed = JSON.parse(fieldData);
                    if (Array.isArray(parsed)) return parsed;
                } catch(e) {}
                return fieldData.split(',').map(s => s.trim());
            }
            return [];
        };

        for (let i = 0; i < missions.length; i++) {
            const mission = missions[i];
            const missionNumber = i + 1;
            const missionName = mission.mission_name || mission.title || "Missão Secreta";
            
            const doneList = getAsArray(mission.done);
            const failList = getAsArray(mission.fail);

            const isDone = doneList.includes(session.username);
            const isFailed = failList.includes(session.username);

            if (isDone) {
                mapHTML += `
                    <div class="mission-node done" title="${missionName}">
                        <div class="circle">✓</div>
                        <span class="label">${missionNumber}</span>
                    </div>
                `;
            } else if (isFailed) {
                mapHTML += `
                    <div class="mission-node fail" title="${missionName}">
                        <div class="circle">✗</div>
                        <span class="label">${missionNumber}</span>
                    </div>
                `;
            } else {
                // Primeira missão não feita e não falha vira a ESTRELA (Ativa)
                if (!activeFound) {
                    mapHTML += `
                        <div class="mission-node active" title="${missionName}">
                            <div class="circle">★</div>
                            <span class="label">${missionNumber}</span>
                        </div>
                    `;
                    
                    const safeUrl = getEmbedUrl(mission.mission_link);
                    
                    // Constrói o formulário abaixo do mapa
                    activeMissionHTML = `
                        <div class="active-mission-wrapper">
                            <h3 class="active-title">Missão ${missionNumber}: ${missionName}</h3>
                            <iframe src="${safeUrl}" width="100%" height="500" frameborder="0" marginheight="0" marginwidth="0">Carregando...</iframe>
                        </div>
                    `;
                    activeFound = true;
                } else {
                    // Missões futuras viram cadeados (ou apenas ficam em cinza)
                    mapHTML += `
                        <div class="mission-node locked" title="${missionName}">
                            <div class="circle">🔒</div>
                            <span class="label">${missionNumber}</span>
                        </div>
                    `;
                }
            }
        }

        mapHTML += `</div>`; // Fecha o mapa

        if (!activeFound) {
            activeMissionHTML = `<h2 style="text-align:center; color: var(--primary-color); margin-top: 30px;">Incrível! Você concluiu todas as missões!</h2>`;
        }

        // Renderiza o mapa por cima e o formulário por baixo
        modalContent.innerHTML = mapHTML + activeMissionHTML;

        // Rola até o final para o aluno ver o formulário
        setTimeout(() => {
            const wrapper = document.querySelector('.dialog-wrapper') || modal;
            wrapper.scrollTo({ top: 9999, behavior: 'smooth' });
        }, 300);

    } catch (err) {
        console.error(err);
        modalContent.innerHTML = `<h3>Erro ao buscar missões. Verifique o console.</h3>`;
    }
}
