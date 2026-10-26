import { supabase } from './supabaseClient.js';
import { getSession } from './auth.js';

const CACHE_PREFIX = 'ej_notifications_v1_';
const MAX_EVENTS = 60;

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
            if (parsed && Array.isArray(parsed.events)) return parsed;
        } catch (_) {}
        return { initialized: false, missionIds: [], snapshot: null, events: [] };
    }
    function persist() {
        state.events = state.events.slice(-MAX_EVENTS);
        localStorage.setItem(cacheKey, JSON.stringify(state));
        const unread = state.events.filter(item => !item.read).length;
        const badge = document.getElementById('notification-count');
        if (badge) {
            badge.textContent = unread > 99 ? '99+' : String(unread);
            badge.classList.toggle('hidden', unread === 0);
        }
    }
    function addEvent(id, title, message, kind = 'general') {
        if (state.events.some(item => item.id === id)) return;
        state.events.push({ id, title, message, kind, read: false, createdAt: new Date().toISOString() });
    }
    async function syncNotifications() {
        try {
            const [{ data: missions, error: missionError }, { data: users, error: usersError }] = await Promise.all([
                supabase.from('missions').select('id, mission_name, notif').order('id', { ascending: true }),
                supabase.from('users').select('username, score, rank, serie, team').neq('username', 'micael.svg')
            ]);
            if (missionError) throw missionError;
            if (usersError) throw usersError;
            const allMissions = missions || [];
            const allUsers = users || [];
            const currentUser = allUsers.find(user => user.username === username);
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
            persist();
        } catch (error) {
            console.error('Erro ao sincronizar notificações:', error);
        }
    }
    function makeSnapshot(user, users) {
        if (!user) return { position: null, rank: null, score: null, superstar: null };
        const sorted = [...users].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        const position = sorted.findIndex(item => item.username === username) + 1;
        const classmates = sorted.filter(item => String(item.serie) === String(user.serie) && String(item.team) === String(user.team));
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
        list.innerHTML = events.map(item => `
            <article class="notification-item">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.message)}</p>
                <small>${item.read ? 'Lida' : 'Não lida'}</small>
                ${item.read ? '' : `<button type="button" data-read-id="${escapeHtml(item.id)}">Marcar como lida</button>`}
            </article>`).join('');
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

    persist();
    // Sincroniza ao entrar no jogo e a cada retorno à aba.
    syncNotifications();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') syncNotifications();
    });
}
