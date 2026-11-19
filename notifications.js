import { supabase } from './supabaseClient.js';
import { getSession, clearSession } from './auth.js';

const CACHE_PREFIX = 'ej_notifications_v1_';
const MAX_EVENTS = 60;
const MAX_TIMEOUT = 2147480000;

export function initNotifications() {
    const session = getSession();
    if (!session?.username) return;

    const username = session.username;
    const cacheKey = CACHE_PREFIX + username;
    const bell = document.getElementById('btn-notifications');
    const panel = document.getElementById('notifications-panel');
    const close = document.getElementById('btn-close-notifications');
    if (!bell || !panel || bell.dataset.initialized === 'true') return;
    bell.dataset.initialized = 'true';

    let state = readState(cacheKey);
    let annualNoticeTimer = null;
    let syncPromise = null;

    bell.addEventListener('click', async (event) => {
        event.stopPropagation();
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            await syncNotifications();
            render();
        }
    });
    close?.addEventListener('click', () => panel.classList.add('hidden'));
    document.addEventListener('click', (event) => {
        if (!panel.contains(event.target) && !bell.contains(event.target)) panel.classList.add('hidden');
    });

    function readState(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            if (parsed && Array.isArray(parsed.events)) {
                parsed.resetYear = Number(parsed.resetYear) || 0;
                return parsed;
            }
        } catch (_) {}
        return { initialized: false, missionIds: [], snapshot: null, events: [], resetYear: 0 };
    }

    function persist() {
        state.events = state.events
            .filter(item => !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())
            .slice(-MAX_EVENTS);
        localStorage.setItem(cacheKey, JSON.stringify(state));
        const unread = state.events.filter(item => !item.read).length;
        const badge = document.getElementById('notification-count');
        if (badge) {
            badge.textContent = unread > 99 ? '99+' : String(unread);
            badge.classList.toggle('hidden', unread === 0);
        }
    }

    function addEvent(id, title, message, kind = 'general', extra = {}) {
        if (state.events.some(item => item.id === id)) return;
        state.events.push({
            id, title, message, kind, read: false,
            createdAt: new Date().toISOString(),
            ...extra
        });
    }

    function scheduleNextAnnualNotice(notices) {
        if (annualNoticeTimer) {
            clearTimeout(annualNoticeTimer);
            annualNoticeTimer = null;
        }

        const now = Date.now();
        const candidates = (notices || []).flatMap(item => [
            { timestamp: new Date(item.scheduled_at).getTime() },
            // Confere novamente um minuto após a rotina de limpeza concluir.
            { timestamp: new Date(item.expires_at).getTime() + 60000 }
        ]);
        const next = candidates
            .filter(entry => Number.isFinite(entry.timestamp) && entry.timestamp > now)
            .sort((a, b) => a.timestamp - b.timestamp)[0];

        if (!next) return;

        // Timer único até o próximo aviso ou à confirmação da limpeza anual.
        // Em datas distantes, acorda no limite suportado pelo navegador e recalcula.
        const delay = Math.min(Math.max(0, next.timestamp - now), MAX_TIMEOUT);
        annualNoticeTimer = setTimeout(async () => {
            annualNoticeTimer = null;
            await syncNotifications();
            if (!panel.classList.contains('hidden')) render();
        }, delay + (delay < MAX_TIMEOUT ? 100 : 0));
    }

    async function syncNotifications() {
        if (syncPromise) return syncPromise;

        syncPromise = (async () => {
            try {
                const nowIso = new Date().toISOString();
                const [
                    { data: missions, error: missionError },
                    { data: users, error: usersError },
                    { data: annualNotices, error: noticeError },
                    { data: resetState, error: resetError }
                ] = await Promise.all([
                    supabase.from('missions').select('id, mission_name, notif').order('id', { ascending: true }),
                    supabase.from('users').select('username, score, rank, grade').neq('username', 'micael.svg'),
                    supabase.from('system_notifications')
                        .select('id, cycle_year, notice_code, title, message, scheduled_at, expires_at')
                        .eq('audience', 'students')
                        .gt('expires_at', nowIso)
                        .order('scheduled_at', { ascending: true }),
                    supabase.from('system_reset_state')
                        .select('last_annual_reset_year')
                        .eq('singleton', true)
                        .maybeSingle()
                ]);

                if (missionError) throw missionError;
                if (usersError) throw usersError;
                if (noticeError) throw noticeError;
                if (resetError) throw resetError;

                const resetYear = Number(resetState?.last_annual_reset_year) || 0;
                if (resetYear > (Number(state.resetYear) || 0)) {
                    // Remove avisos antigos e snapshots de ranking de anos anteriores.
                    state = {
                        initialized: false,
                        missionIds: [],
                        snapshot: null,
                        events: [],
                        resetYear
                    };
                } else {
                    state.resetYear = resetYear;
                }

                const allMissions = missions || [];
                const allUsers = users || [];
                const currentUser = allUsers.find(user => user.username === username);
                if (!currentUser && username !== 'micael.svg') {
                    // Conta removida pela limpeza anual: invalida a sessão persistida no navegador.
                    clearSession();
                    window.location.reload();
                    return;
                }
                const notices = annualNotices || [];
                const now = Date.now();

                if (!state.initialized) {
                    state.missionIds = allMissions.map(m => String(m.id));
                    state.snapshot = makeSnapshot(currentUser, allUsers);
                    state.initialized = true;
                } else {
                    const previousIds = new Set((state.missionIds || []).map(String));
                    for (const mission of allMissions) {
                        if (previousIds.has(String(mission.id))) continue;
                        const readers = parseReaders(mission.notif);
                        if (!readers.includes(username)) {
                            addEvent('mission:' + mission.id, 'Nova missão publicada', mission.mission_name || ('Missão ' + mission.id), 'mission');
                        }
                    }

                    const nextSnapshot = makeSnapshot(currentUser, allUsers);
                    const previous = state.snapshot || {};
                    if (nextSnapshot.position && previous.position && nextSnapshot.position !== previous.position) {
                        const direction = nextSnapshot.position < previous.position ? 'subiu' : 'desceu';
                        addEvent('position:' + nextSnapshot.position + ':' + Date.now(), 'Mudança no ranking', 'Você ' + direction + ' do ' + previous.position + 'º para o ' + nextSnapshot.position + 'º lugar.');
                    }
                    if (nextSnapshot.rank && previous.rank && nextSnapshot.rank !== previous.rank) {
                        addEvent('rank:' + nextSnapshot.rank + ':' + Date.now(), 'Mudança de patente', 'Sua patente mudou de ' + previous.rank + ' para ' + nextSnapshot.rank + '.');
                    }
                    if (nextSnapshot.score !== null && previous.score !== null && nextSnapshot.score !== previous.score) {
                        addEvent('score:' + nextSnapshot.score + ':' + Date.now(), 'Pontuação atualizada', 'Sua pontuação mudou de ' + previous.score + ' para ' + nextSnapshot.score + ' XP.');
                    }
                    if (typeof previous.superstar === 'boolean' && nextSnapshot.superstar !== previous.superstar) {
                        addEvent('superstar:' + nextSnapshot.superstar + ':' + Date.now(), nextSnapshot.superstar ? 'Você é SuperStar!' : 'Mudança em SuperStars', nextSnapshot.superstar ? 'Você agora lidera sua turma no ranking.' : 'Você não está mais na primeira posição da sua turma.');
                    }
                    state.snapshot = nextSnapshot;
                    state.missionIds = allMissions.map(m => String(m.id));
                }

                for (const notice of notices) {
                    const startsAt = new Date(notice.scheduled_at).getTime();
                    const expiresAt = new Date(notice.expires_at).getTime();
                    if (!Number.isFinite(startsAt) || !Number.isFinite(expiresAt)) continue;
                    if (startsAt <= now && expiresAt > now) {
                        addEvent(
                            'annual-reset:' + notice.id,
                            notice.title,
                            notice.message,
                            'system',
                            { expiresAt: notice.expires_at, cycleYear: notice.cycle_year }
                        );
                    }
                }

                scheduleNextAnnualNotice(notices);
                persist();
            } catch (error) {
                console.error('Erro ao sincronizar notificações:', error);
            }
        })();

        try {
            await syncPromise;
        } finally {
            syncPromise = null;
        }
    }

    function makeSnapshot(user, users) {
        if (!user) return { position: null, rank: null, score: null, superstar: null };
        const sorted = [...users].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        const position = sorted.findIndex(item => item.username === username) + 1;
        const classmates = sorted.filter(item => String(item.grade || '') === String(user.grade || ''));
        return {
            position: position > 0 ? position : null,
            rank: user.rank || null,
            score: Number.isFinite(Number(user.score)) ? Number(user.score) : 0,
            superstar: classmates.length ? classmates[0].username === username : false
        };
    }

    function parseReaders(value) {
        if (Array.isArray(value)) return value.map(String);
        if (typeof value !== 'string' || !value.trim()) return [];
        try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.map(String); } catch (_) {}
        return value.split(',').map(value => value.trim()).filter(Boolean);
    }

    function render() {
        const list = document.getElementById('notifications-list');
        if (!list) return;
        const events = [...state.events].reverse();
        if (!events.length) {
            list.innerHTML = '<p>Você não tem notificações novas.</p>';
            persist();
            return;
        }
        list.innerHTML = events.map(item =>
            '<article class="notification-item">' +
                '<strong>' + escapeHtml(item.title) + '</strong>' +
                '<p>' + escapeHtml(item.message) + '</p>' +
                '<small>' + (item.read ? 'Lida' : 'Não lida') + '</small>' +
                (item.read ? '' : '<button type="button" data-read-id="' + escapeHtml(item.id) + '">Marcar como lida</button>') +
            '</article>'
        ).join('');
        list.querySelectorAll('[data-read-id]').forEach(button => {
            button.addEventListener('click', async () => {
                const item = state.events.find(event => event.id === button.dataset.readId);
                if (!item) return;
                if (item.kind === 'mission') await markMissionRead(item.id.slice('mission:'.length));
                item.read = true;
                persist();
                render();
            });
        });
        persist();
    }

    async function markMissionRead(missionId) {
        const { data, error } = await supabase.from('missions').select('notif').eq('id', missionId).maybeSingle();
        if (error) { console.error('Não foi possível registrar leitura da missão:', error); return; }
        const readers = parseReaders(data?.notif);
        if (!readers.includes(username)) {
            readers.push(username);
            const { error: updateError } = await supabase.from('missions').update({ notif: readers.join(',') }).eq('id', missionId);
            if (updateError) console.error('Não foi possível salvar leitores da missão:', updateError);
        }
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    }

    addEvent(
        'system:security-questions-2026',
        'Ação necessária: configure perguntas de segurança',
        'Para recuperar sua conta caso esqueça a senha, entre no EnglishJourney e escolha pelo menos duas perguntas de segurança. Depois, crie respostas que você consiga lembrar.',
        'security'
    );
    persist();

    // Uma consulta inicial busca avisos ativos e agenda um único timer para o próximo.
    // Não existe polling nem atualização periódica em segundo plano.
    syncNotifications();
}
