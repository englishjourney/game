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
    const alignmentClass = index % 2 === 0 ? 'is-left' : 'is-right';
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
        return `<div class="mission-node mission-map-node ${stateClass} ${alignmentClass}" aria-disabled="true">${nodeContent}</div>`;
    }

    return `<button type="button" class="mission-node mission-map-node ${stateClass} ${alignmentClass}" data-mission-index="${index}" aria-label="Abrir missão ${getMissionNumber(index)}: ${name}">${nodeContent}</button>`;
}

function drawMissionMapRoute(container) {
    if (!container) return;

    container.querySelector('.mission-map-route')?.remove();

    const circles = [...container.querySelectorAll('.mission-map-node .circle')];
    if (circles.length < 2) return;

    const containerRect = container.getBoundingClientRect();
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.scrollHeight, container.clientHeight);
    const points = circles.map(circle => {
        const rect = circle.getBoundingClientRect();
        return {
            x: rect.left - containerRect.left + container.scrollLeft + rect.width / 2,
            y: rect.top - containerRect.top + container.scrollTop + rect.height / 2
        };
    });

    const pathData = points.reduce((path, point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const previous = points[index - 1];
        const middleY = (previous.y + point.y) / 2;
        return `${path} C ${previous.x} ${middleY}, ${point.x} ${middleY}, ${point.x} ${point.y}`;
    }, '');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('mission-map-route');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: `${width}px`,
        height: `${height}px`,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: '0'
    });

    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    outline.setAttribute('d', pathData);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', 'rgba(255, 247, 218, 0.9)');
    outline.setAttribute('stroke-width', '8');
    outline.setAttribute('stroke-linecap', 'round');
    outline.setAttribute('stroke-linejoin', 'round');

    const route = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    route.setAttribute('d', pathData);
    route.setAttribute('fill', 'none');
    route.setAttribute('stroke', '#8a672f');
    route.setAttribute('stroke-width', '3');
    route.setAttribute('stroke-dasharray', '5 9');
    route.setAttribute('stroke-linecap', 'round');
    route.setAttribute('stroke-linejoin', 'round');

    svg.append(outline, route);
    container.appendChild(svg);
}

function openMissionMap() {
    const existing = document.getElementById('mission-map-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'mission-map-dialog';
    dialog.className = 'mission-map-dialog';
    dialog.innerHTML = `
        <style>
            dialog.mission-map-dialog {
                background-color: #ead9a8 !important;
                background-image:
                    radial-gradient(ellipse at 15% 18%, rgba(255, 251, 225, .72), transparent 34%),
                    radial-gradient(ellipse at 87% 76%, rgba(128, 89, 39, .16), transparent 38%),
                    repeating-radial-gradient(ellipse at 22% 28%, transparent 0 24px, rgba(122, 88, 43, .075) 25px 26px, transparent 27px 44px),
                    repeating-linear-gradient(17deg, rgba(112, 79, 36, .035) 0 1px, transparent 1px 6px),
                    linear-gradient(135deg, #f1e4bd 0%, #e8d7a8 55%, #ddc58e 100%) !important;
                border: 7px double #9b7841 !important;
                color: #594526 !important;
                box-shadow: inset 0 0 0 2px rgba(255, 249, 222, .72), inset 0 0 42px rgba(117, 79, 34, .18), 0 18px 55px rgba(0, 0, 0, .55) !important;
            }
            .mission-map-dialog .mission-map-dialog-header h2 { color: #594526; text-shadow: 0 1px rgba(255,255,255,.45); }
            .mission-map-dialog .mission-map-dialog-header h2 i { color: #9a7134; }
            .mission-map-dialog .mission-map-dialog-header p { color: #735b35; opacity: 1; }
            .mission-map-dialog .mission-map-close {
                border: 2px solid #98743b;
                background: rgba(255, 247, 220, .75);
                color: #644a24;
                box-shadow: 0 2px 5px rgba(86, 60, 27, .16);
            }
            .mission-map-dialog .mission-map-container {
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 16px;
                padding: 18px 0 24px;
                isolation: isolate;
            }
            .mission-map-dialog .mission-map-container::before { display: none !important; }
            .mission-map-dialog .mission-map-node {
                position: relative;
                z-index: 1;
                display: grid;
                grid-template-columns: 56px minmax(0, 1fr);
                align-items: center;
                gap: 12px;
                width: min(82%, 390px);
                min-height: 76px;
                margin: 0 auto 0 2%;
                padding: 9px 12px;
                border: 1px solid rgba(137, 103, 52, .48);
                border-radius: 15px;
                background: rgba(255, 248, 226, .88) !important;
                color: #594526 !important;
                text-align: left;
                transform: none !important;
                box-shadow: 0 4px 10px rgba(94, 68, 31, .13), inset 0 1px rgba(255,255,255,.72);
                backdrop-filter: blur(1px);
            }
            .mission-map-dialog .mission-map-node.is-right { margin-left: auto; margin-right: 2%; }
            .mission-map-dialog button.mission-map-node { cursor: pointer; }
            .mission-map-dialog button.mission-map-node:hover {
                background: rgba(255, 252, 237, .98) !important;
                border-color: #a57a37;
                box-shadow: 0 6px 14px rgba(94, 68, 31, .2), inset 0 1px rgba(255,255,255,.85);
            }
            .mission-map-dialog .mission-map-node .circle {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 52px;
                height: 52px;
                border: 3px solid #fff3d0;
                border-radius: 50%;
                color: #fff;
                font-size: 1.25rem;
                box-shadow: 0 0 0 2px #9a743c, 0 3px 7px rgba(75, 53, 25, .25);
            }
            .mission-map-dialog .mission-map-node.done .circle { background: #39834d; }
            .mission-map-dialog .mission-map-node.fail .circle { background: #b84d43; }
            .mission-map-dialog .mission-map-node.active .circle { background: #e2ad25; color: #493516; }
            .mission-map-dialog .mission-map-node.locked { opacity: .68; cursor: not-allowed; }
            .mission-map-dialog .mission-map-node.locked .circle { background: #92917f; }
            .mission-map-dialog .mission-map-node-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
            .mission-map-dialog .mission-map-node-number {
                color: #896a3d;
                font-size: .74rem;
                font-weight: 900;
                opacity: 1;
                text-transform: uppercase;
                letter-spacing: .07em;
            }
            .mission-map-dialog .mission-map-node-name { color: #4e3b20; font-weight: 900; overflow-wrap: anywhere; }
            .mission-map-dialog .mission-map-node-status { color: #765d36; font-size: .78rem; opacity: 1; }
            .mission-map-dialog .mission-map-legend {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 12px 20px;
                padding-top: 15px;
                border-top: 1px solid rgba(117, 84, 38, .28);
                color: #71572f;
                font-size: .8rem;
                opacity: 1;
            }
            .mission-map-dialog .mission-map-legend .fa-check { color: #39834d; }
            .mission-map-dialog .mission-map-legend .fa-star { color: #b17b13; }
            .mission-map-dialog .mission-map-legend .fa-lock { color: #85836f; }
            @media (max-width: 600px) {
                dialog.mission-map-dialog { width: 96vw; max-width: 96vw; max-height: 92vh; }
                .mission-map-dialog .mission-map-node { width: 90%; }
                .mission-map-dialog .mission-map-node.is-left { margin-left: 1%; }
                .mission-map-dialog .mission-map-node.is-right { margin-right: 1%; }
            }
        </style>
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
    const mapContainer = dialog.querySelector('.mission-map-container');
    let routeObserver = null;
    const redrawRoute = () => drawMissionMapRoute(mapContainer);

    dialog.addEventListener('close', () => {
        routeObserver?.disconnect();
        window.removeEventListener('resize', redrawRoute);
        dialog.remove();
    }, { once: true });

    dialog.showModal();
    requestAnimationFrame(redrawRoute);

    if (typeof ResizeObserver !== 'undefined') {
        routeObserver = new ResizeObserver(() => requestAnimationFrame(redrawRoute));
        routeObserver.observe(mapContainer);
    }
    window.addEventListener('resize', redrawRoute);
}


window.addEventListener('message', event => {
    if (event.origin !== window.location.origin) return;
    const iframe = document.querySelector('.mission-frame-container iframe');
    if (!iframe || event.source !== iframe.contentWindow) return;
    if (event.data?.type !== 'ENGLISHJOURNEY_MISSION_COMPLETED') return;
    openMissions();
});

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
