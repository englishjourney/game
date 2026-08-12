// missions.js
import { supabase } from './supabaseClient.js';
import { getSession } from './auth.js';
import { runWithLoader } from './loader.js'; // <-- IMPORTANDO O LOADER INTELIGENTE

export async function openMissions() {
    const session = getSession();
    if (!session) return;

    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('content-modal');
    
    // Limpa o conteúdo antes de abrir
    modalContent.innerHTML = ``;
    modal.showModal();

    try {
        // Busca missões usando o NOVO LOADER que criamos
        const { data: missions, error } = await runWithLoader(async () => {
            return await supabase
                .from('missions')
                .select('*')
                .order('id', { ascending: true });
        });

        if (error) throw error;

        let mapHTML = `<div class="mission-map-container">`;
        let activeFound = false;

        for (let i = 0; i < missions.length; i++) {
            const mission = missions[i];
            const missionNumber = i + 1;
            
            // Pega o nome da missão (ou coloca um texto padrão se vier vazio)
            const missionName = mission.mission_name || "Missão Secreta";
            
            // Verifica se o usuário atual completou ou falhou
            const isDone = mission.done && mission.done.includes(session.username);
            const isFailed = mission.fail && mission.fail.includes(session.username);
            
            // Alterna a classe para fazer o zigue-zague (esquerda/direita)
            const alignClass = i % 2 === 0 ? "align-left" : "align-right";

            if (isDone) {
                // Missão Aprovada
                mapHTML += `
                    <div class="mission-node ${alignClass}">
                        <div class="mission-circle success">✓</div>
                        <span class="mission-label">Missão ${missionNumber}: ${missionName} (Completa)</span>
                    </div>
                `;
            } else if (isFailed) {
                // Missão Reprovada
                mapHTML += `
                    <div class="mission-node ${alignClass}">
                        <div class="mission-circle fail">✗</div>
                        <span class="mission-label">Missão ${missionNumber}: ${missionName} (Não completa)</span>
                    </div>
                `;
            } else {
                // A primeira que não está "done" nem "fail" é a MISSÃO ATUAL (Ativa)
                mapHTML += `
                    <div class="mission-node active-mission ${alignClass}">
                        <div class="mission-frame-wrapper">
                            <h3 class="active-title">Missão ${missionNumber}: ${missionName} - VALENDO!</h3>
                            <iframe src="${mission.mission_link}?embedded=true" width="100%" height="500" frameborder="0" marginheight="0" marginwidth="0">Carregando...</iframe>
                        </div>
                    </div>
                `;
                activeFound = true;
                // PARALISA O LOOP AQUI: O aluno não pode ver as missões depois dessa
                break; 
            }
        }

        if (!activeFound) {
            mapHTML += `<h2 style="text-align:center; color: var(--primary-color);">Incrível! Você concluiu todas as missões disponíveis!</h2>`;
        }

        mapHTML += `</div>`; // fecha mission-map-container
        modalContent.innerHTML = mapHTML;

        // Rola automaticamente para o final da tela (onde está a missão atual valendo)
        setTimeout(() => {
            const wrapper = document.querySelector('.dialog-wrapper') || modal;
            wrapper.scrollTo({ top: 9999, behavior: 'smooth' });
        }, 300);

    } catch (err) {
        console.error(err);
        modalContent.innerHTML = `<h3>Erro ao buscar missões.</h3>`;
    }
}
