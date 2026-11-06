// missions.js
import { supabase } from './supabaseClient.js';
import { getSession } from './auth.js';
import { runWithLoader } from './loader.js';

let missionRows = [];
let missionStates = [];
let currentMissionIndex = -1;
let activeUsername = '';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function getAsArray(fieldData) {
    if (!fieldData) return [];
    if (Array.isArray(fieldData)) return fieldData.map(value => String(value).trim());
    if (typeof fieldData !== 'string') return [];

    try {
        const parsed = JSON.parse(fieldData);
        if (Array.isArray(parsed)) return parsed.map(value => String(value).trim());
    } catch (_) {}

    return fieldData.split(',').map(value => value.trim()).filter(Boolean);
}

function getEmbedUrl(url) {
    if (!url) return '';
    let finalUrl = String(url).trim();

    if (finalUrl.startsWith('javascript:')) return '';

    if (finalUrl.includes('drive.google.com/file/d/')) {
        finalUrl = finalUrl.replace(/\/view.*$/, '/preview');
    } else if (
        finalUrl.includes('docs.google.com/document') ||
        finalUrl.includes('docs.google.com/spreadsheets') ||
        finalUrl.includes('docs.google.com/presentation')
    ) {
        finalUrl = finalUrl.replace(/\/edit.*$/, '/preview');
    } else if (finalUrl.includes('docs.google.com/forms')) {
        finalUrl = finalUrl.replace(/\/edit.*$/, '/viewform');
        if (!finalUrl.includes('embedded=true')) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'embedded=true';
        }
    }

    return finalUrl;
}

function getMissionName(mission) {
    return mission.mission_name || mission.title || 'Missão sem título';
}

function getMissionNumber(index) {
    return index + 1;
}

function getMissionStatus(mission, username) {
    const done = getAsArray(mission.done).includes(username);
    const failed = getAsArray(mission.fail).includes(username);
    return { done, failed };
}

function setCurrentMissionProgress(rows, username) {
    missionRows = rows;
    activeUsername = username;
    missionStates = rows.map(mission => getMissionStatus(mission, username));
    currentMissionIndex = missionStates.findIndex(status => !status.done && !status.failed);
}

function renderMissionHeader(isReplay = false) {
    return `
        <div class="mission-view-header">
            <div>
                <h2 class="mission-view-heading">Missões</h2>
                <p class="mission-view-subtitle">${isReplay ? 'Revisando uma missão anterior' : 'Sua jornada de aprendizagem'}</p>
            </div>
            <button type="button" class="mission-map-trigger" data-open-mission-map>
                <i class="fa-solid fa-map" aria-hidden="true"></i>
                <span>Mapa</span>
            </button>
        </div>
    `;
}

function renderMissionView(index, replay = false) {
    const modalContent = document.getElementById('modal-content');
    if (!modalContent) return;

    if (index < 0 || index >= missionRows.length) {
        modalContent.innerHTML = renderMissionHeader(false) + `
            <section class="mission-empty-state">
                <i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>
                <h2>Você chegou ao fim da trilha!</h2>
                <p>Não há outra missão pendente no momento.</p>
            </section>
        `;
    } else {
        const mission = missionRows[index];
        const number = getMissionNumber(index);
        const name = getMissionName(mission);
        const safeUrl = escapeHtml(getEmbedUrl(mission.mission_link));

        modalContent.innerHTML = renderMissionHeader(replay) + `
            <section class="mission-current-card ${replay ? 'is-replay' : ''}">
                <div class="mission-current-meta">
                    <span class="mission-current-kicker">${replay ? 'MISSÃO ANTERIOR' : 'SUA MISSÃO ATUAL'}</span>
                    <span class="mission-number-pill">Missão ${number}</span>
                </div>
                <h2 class="mission-current-title">${escapeHtml(name)}</h2>
                ${replay ? `
                    <div class="mission-replay-notice">
                        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                        <span>Você está revisando uma missão anterior. Esta repetição não deve gerar novos pontos.</span>
                    </div>
                    <button type="button" class="mission-return-current" data-return-current>
                        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                        Voltar à missão atual
                    </button>
                ` : ''}
                ${safeUrl ? `
                    <div class="mission-frame-container">
                        <iframe src="${safeUrl}" title="Missão ${number}: ${escapeHtml(name)}" width="100%" height="560" frameborder="0" loading="lazy" allowfullscreen>Carregando missão...</iframe>
                    </div>
                ` : '<p class="mission-link-empty">O link desta missão ainda não foi cadastrado.</p>'}
            </section>
        `;
    }

    modalContent.querySelector('[data-open-mission-map]')?.addEventListener('click', openMissionMap);
    modalContent.querySelector('[data-return-current]')?.addEventListener('click', () => {
        renderMissionView(currentMissionIndex, false);
    });

    // Contexto acessível aos jogos locais incorporados, além das verificações de repetição
    // já existentes nos jogos. Missões anteriores são sempre marcadas como revisão.
    window.EnglishJourneyMissionContext = index >= 0 ? {
        missionId: missionRows[index]?.id ?? null,
        missionIndex: index,
        isReplay: Boolean(replay)
    } : { missionId: null, missionIndex: -1, isReplay: false };
}

function createMissionMapNode(index) {
    const mission = missionRows[index];
    const status = missionStates[index];
    const isCurrent = index === currentMissionIndex;
    const isPast = currentMissionIndex < 0 || index < currentMissionIndex;
    const locked = !isCurrent && !isPast;
    const stateClass = status.done ? 'done' : status.failed ? 'fail' : isCurrent ? 'active' : 'locked';
    const icon = status.done
        ? '<i class="fa-solid fa-check" aria-hidden="true"></i>'
        : status.failed
            ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
            : isCurrent
                ? '<i class="fa-solid fa-star" aria-hidden="true"></i>'
                : '<i class="fa-solid fa-lock" aria-hidden="true"></i>';
    const label = status.done ? 'Concluída' : status.failed ? 'Não concluída' : isCurrent ? 'Missão atual' : 'Bloqueada';
    const name = escapeHtml(getMissionName(mission));
    const nodeContent = `
        <span class="circle">${icon}</span>
        <span class="mission-map-node-copy">
            <strong class="mission-map-node-number">Missão ${getMissionNumber(index)}</strong>
            <span class="mission-map-node-name">${name}</span>
            <small class="mission-map-node-status">${label}</small>
        </span>
    `;

    if (locked) {
        return `<div class="mission-node mission-map-node ${stateClass}" aria-disabled="true">${nodeContent}</div>`;
    }

    return `<button type="button" class="mission-node mission-map-node ${stateClass}" data-mission-index="${index}" aria-label="Abrir missão ${getMissionNumber(index)}: ${name}">${nodeContent}</button>`;
}

function openMissionMap() {
    const existing = document.getElementById('mission-map-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'mission-map-dialog';
    dialog.className = 'mission-map-dialog';
    dialog.innerHTML = `
        <div class="mission-map-dialog-header">
            <div>
                <h2><i class="fa-solid fa-map" aria-hidden="true"></i> Mapa das missões</h2>
                <p>Veja seu progresso e retome uma missão anterior.</p>
            </div>
            <button type="button" class="mission-map-close" aria-label="Fechar mapa" data-close-map>×</button>
        </div>
        <div class="mission-map-container">
            ${missionRows.map((_, index) => createMissionMapNode(index)).join('')}
        </div>
        <div class="mission-map-legend">
            <span><i class="fa-solid fa-check" aria-hidden="true"></i> Concluída</span>
            <span><i class="fa-solid fa-star" aria-hidden="true"></i> Atual</span>
            <span><i class="fa-solid fa-lock" aria-hidden="true"></i> Bloqueada</span>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => {
        if (event.target === dialog || event.target.closest('[data-close-map]')) {
            dialog.close();
            return;
        }

        const missionButton = event.target.closest('[data-mission-index]');
        if (!missionButton) return;

        const index = Number(missionButton.dataset.missionIndex);
        const isReplay = currentMissionIndex < 0 || index < currentMissionIndex;
        dialog.close();
        renderMissionView(index, isReplay);
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
}

export async function openMissions() {
    const session = getSession();
    if (!session?.username) return;

    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('content-modal');
    if (!modalContent || !modal) return;

    modalContent.innerHTML = `
        <div class="mission-loading">
            <i class="fa-solid fa-bullseye" aria-hidden="true"></i>
            <span>Carregando sua missão...</span>
        </div>
    `;
    if (!modal.open) modal.showModal();

    try {
        const { data: missions, error } = await runWithLoader(async () => {
            return await supabase
                .from('missions')
                .select('*')
                .order('id', { ascending: true });
        });

        if (error) throw error;

        if (!missions || missions.length === 0) {
            missionRows = [];
            missionStates = [];
            currentMissionIndex = -1;
            modalContent.innerHTML = renderMissionHeader(false) + `
                <section class="mission-empty-state">
                    <i class="fa-solid fa-book-open" aria-hidden="true"></i>
                    <h2>Nenhuma missão encontrada</h2>
                    <p>As novas missões aparecerão aqui quando forem cadastradas.</p>
                </section>
            `;
            modalContent.querySelector('[data-open-mission-map]')?.addEventListener('click', openMissionMap);
            return;
        }

        setCurrentMissionProgress(missions, session.username);
        renderMissionView(currentMissionIndex, false);
    } catch (error) {
        console.error('Erro ao carregar missões:', error);
        modalContent.innerHTML = `
            <section class="mission-empty-state mission-error-state">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <h2>Não foi possível carregar as missões</h2>
                <p>Verifique sua conexão e tente novamente.</p>
            </section>
        `;
    }
}
