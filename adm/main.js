import { initAuth, isAdmLoggedIn, logout } from './auth.js';
import { initPlanner } from './planner.js';
import { initUsers } from './users.js';
import { initMissions } from './missions.js';
import { initFlashcardsAdm } from './flashcardsAdm.js';
import { supabase } from '../supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. REGISTRA O SERVICE WORKER NA PASTA ADM
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('Service Worker da ADM registrado com sucesso!');
                verificarESalvarAulasNoCache(registration);
            })
            .catch((error) => {
                console.error('Falha ao registrar o Service Worker:', error);
            });
    }

    const loggedIn = await isAdmLoggedIn();
    if (!loggedIn) {
        initAuth();
    } else {
        showAdmPanel();
    }
});

function verificarESalvarAulasNoCache(swRegistration) {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    let cacheAulas = localStorage.getItem('yuki_planejamento_semana');

    if (!cacheAulas) {
        const dadosExemplo = [
            { date: "06/10/2026", time: "07:00", serie: "9", team: "B", activities: "Leitura do Capítulo 3 e gramática." },
            { date: "06/10/2026", time: "08:30", serie: "7", team: "A", activities: "Introdução ao vocabulário de saúde." }
        ];
        localStorage.setItem('yuki_planejamento_semana', JSON.stringify(dadosExemplo));
        cacheAulas = JSON.stringify(dadosExemplo);
    }

    const aulas = JSON.parse(cacheAulas);
    const hojeStr = new Date().toLocaleDateString('pt-BR');

    const aulasDeHoje = aulas.filter(a => a.date === hojeStr);

    if (aulasDeHoje.length > 0 && swRegistration.active) {
        swRegistration.active.postMessage({
            type: 'SCHEDULE_NOTIFICATIONS',
            aulas: aulasDeHoje
        });
    }
}

export function showAdmPanel() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('adm-panel').classList.remove('hidden');
    
    setupNavigation();
    setupDashboard();
    initPlanner();
    initUsers();
    initMissions();
    initFlashcardsAdm();
    initReminders(); // INSERIDO AQUI: Inicialização dos lembretes
    
    document.getElementById('btn-logout').addEventListener('click', logout);
}

function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.content-section');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.add('hidden'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.remove('hidden');
        });
    });
}

async function setupDashboard() {
    const searchInput = document.getElementById('global-search');
    const resultsContainer = document.getElementById('search-results');

    if (searchInput && resultsContainer) {
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (query.length < 3) {
                resultsContainer.classList.add('hidden');
                return;
            }

            resultsContainer.innerHTML = '<div class="search-item">Buscando...</div>';
            resultsContainer.classList.remove('hidden');

            try {
                const { data: users } = await supabase.from('users').select('name, username, team').ilike('name', `%${query}%`).limit(3);
                const { data: planners } = await supabase.from('planner').select('serie, team, activities').ilike('activities', `%${query}%`).limit(3);

                let html = '';
                if (users && users.length) {
                    html += '<div style="padding: 5px 10px; color: var(--primary); font-size: 0.8em">Alunos</div>';
                    users.forEach(u => html += `<div class="search-item">${u.name} (${u.username}) - ${u.team}</div>`);
                }
                if (planners && planners.length) {
                    html += '<div style="padding: 5px 10px; color: var(--primary); font-size: 0.8em">Planejamentos</div>';
                    planners.forEach(p => html += `<div class="search-item">${p.serie} ${p.team}: ${p.activities.substring(0,30)}...</div>`);
                }

                if (!html) html = '<div class="search-item">Nenhum resultado.</div>';
                resultsContainer.innerHTML = html;
            } catch (err) {
                console.error(err);
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== searchInput && e.target !== resultsContainer) {
                resultsContainer.classList.add('hidden');
            }
        });
    }

    // Garante o carregamento dos horários do Supabase no Dashboard
    await loadSchedule();
}

async function loadSchedule() {
    const container = document.getElementById('schedule-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Carregando horários semanais...</div>';

    try {
        const { data: rows, error } = await supabase.from('schedule').select('*');
        
        if (error) throw error;
        
        if (!rows || rows.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum horário encontrado na tabela "schedule".</div>';
            return;
        }

        // Pega a linha preenchida ou a primeira linha da tabela
        const data = rows.find(r => r.seg_mat || r.seg_ves || r.ter_mat || r.ter_ves || r.qua_mat || r.qua_ves) || rows[0];

        const dias = [
            { id: 'seg', nome: 'Segunda-Feira' },
            { id: 'ter', nome: 'Terça-Feira' },
            { id: 'qua', nome: 'Quarta-Feira' },
            { id: 'qui', nome: 'Quinta-Feira' },
            { id: 'sex', nome: 'Sexta-Feira' }
        ];

        let html = '';
        
        dias.forEach(dia => {
            const mat = data[`${dia.id}_mat`];
            const ves = data[`${dia.id}_ves`];

            // Se o dia inteiro estiver totalmente vazio, pula
            if (!mat && !ves) return;

            // Card principal do dia da semana
            html += `<div class="schedule-card" style="margin-bottom: 25px; border: 1px solid var(--border); padding: 20px; border-radius: 10px; background: var(--bg-card); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h3 style="text-align: center; border-bottom: 2px solid var(--border); padding-bottom: 12px; margin-bottom: 20px; color: var(--primary); font-size: 1.4rem;">${dia.nome}</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">`;

            const renderTurno = (turnoStr, turnoNome) => {
                let turnoHtml = `<div style="background: var(--bg-dark); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column;">
                    <strong style="display: block; margin-bottom: 12px; text-align: center; color: var(--primary); font-size: 1.1rem; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 6px;">${turnoNome}</strong>`;

                // Se a coluna estiver totalmente vazia, exibe "Sem horários"
                if (!turnoStr || turnoStr.trim() === '') {
                    turnoHtml += `<div style="text-align: center; padding: 20px; color: #888; font-style: italic; margin: auto;">Sem horários</div></div>`;
                    return turnoHtml;
                }
                
                // Quebra o texto por vírgulas e remove colchetes e espaços extras
                const items = turnoStr.split(',').map(item => item.replace(/[\[\]]/g, '').trim()).filter(item => item !== '');

                if (items.length === 0) {
                    turnoHtml += `<div style="text-align: center; padding: 20px; color: #888; font-style: italic; margin: auto;">Sem horários</div></div>`;
                    return turnoHtml;
                }

                turnoHtml += `<ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">`;

                items.forEach(text => {
                    let bg = 'rgba(255, 255, 255, 0.05)';
                    let color = 'white';
                    let borderColor = 'rgba(255,255,255,0.1)';

                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('vago')) {
                        bg = '#eab308'; // Amarelo
                        color = '#000';
                        borderColor = '#ca8a04';
                    } else if (lowerText.includes('intervalo')) {
                        bg = '#ef4444'; // Vermelho
                        color = '#fff';
                        borderColor = '#b91c1c';
                    }

                    turnoHtml += `<li style="background-color: ${bg}; color: ${color}; padding: 10px; border-radius: 6px; text-align: center; font-weight: 500; border: 1px solid ${borderColor};">${text}</li>`;
                });

                turnoHtml += `</ul></div>`;
                return turnoHtml;
            };

            // Renderiza as seções Matutino e Vespertino lado a lado
            html += renderTurno(mat, 'Matutino');
            html += renderTurno(ves, 'Vespertino');
            
            html += `</div></div>`;
        });

        if (!html) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum dia da semana cadastrado possui horários preenchidos.</div>';
            return;
        }

        container.innerHTML = html;
    } catch (err) {
        console.error("Erro ao carregar horários do schedule:", err);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">Erro ao carregar os horários. Verifique a conexão com o Supabase e a tabela "schedule".</div>';
    }
}
// Conjunto para evitar disparar o toast repetidamente na mesma sessão
const notifiedReminderIds = new Set();

export function initReminders() {
    const btnReminders = document.getElementById('btn-reminders');
    const dropdown = document.getElementById('reminders-dropdown');
    const btnNew = document.getElementById('btn-dropdown-new-reminder');
    const btnSee = document.getElementById('btn-dropdown-see-reminders');

    const modalForm = document.getElementById('modal-reminder-form');
    const modalList = document.getElementById('modal-reminder-list');
    
    const btnSaveForm = document.getElementById('btn-save-reminder-form');
    const btnCancelForm = document.getElementById('btn-cancel-reminder-form');
    const btnCloseList = document.getElementById('btn-close-reminder-list');

    if (!btnReminders) return;

    // Toggle Dropdown
    btnReminders.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btnReminders) {
            dropdown.classList.add('hidden');
        }
    });

    // Botão +New no Dropdown
    btnNew.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        openReminderFormModal();
    });

    // Botão See my reminders no Dropdown
    btnSee.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        openReminderListModal();
    });

    // Salvar Lembrete (Inserção / Edição)
    btnSaveForm.addEventListener('click', async () => {
        const id = document.getElementById('reminder-edit-id').value;
        const remindMeTo = document.getElementById('reminder-text').value.trim();
        const date = document.getElementById('reminder-date').value;
        const time = document.getElementById('reminder-time').value;

        if (!remindMeTo || !date || !time) {
            alert('Por favor, preencha todos os campos do lembrete.');
            return;
        }

        try {
            if (id) {
                // Atualizar / Adiar
                const { error } = await supabase.from('reminders').update({ remindMeTo, date, time }).eq('id', id);
                if (error) throw error;
            } else {
                // Criar Novo
                const { error } = await supabase.from('reminders').insert([{ remindMeTo, date, time }]);
                if (error) throw error;
            }

            modalForm.classList.add('hidden');
            await checkRemindersStatus();
            
            // Se o modal de lista estiver aberto, recarrega ele
            if (!modalList.classList.contains('hidden')) {
                openReminderListModal();
            }
        } catch (err) {
            console.error('Erro ao salvar lembrete:', err);
            alert('Erro ao salvar o lembrete.');
        }
    });

    btnCancelForm.addEventListener('click', () => modalForm.classList.add('hidden'));
    btnCloseList.addEventListener('click', () => modalList.classList.add('hidden'));

    // Inicia a verificação contínua (a cada 10 segundos)
    checkRemindersStatus();
    setInterval(checkRemindersStatus, 10000);
}

// Abrir modal de formulário
function openReminderFormModal(data = null) {
    const modalForm = document.getElementById('modal-reminder-form');
    document.getElementById('reminder-modal-title').innerText = data ? 'Editar / Adiar Lembrete' : 'Novo Lembrete';
    document.getElementById('reminder-edit-id').value = data ? data.id : '';
    document.getElementById('reminder-text').value = data ? data.remindMeTo : '';
    document.getElementById('reminder-date').value = data ? data.date : '';
    document.getElementById('reminder-time').value = data ? data.time : '';
    modalForm.classList.remove('hidden');
}

// Abrir e renderizar modal de lista de lembretes
async function openReminderListModal() {
    const modalList = document.getElementById('modal-reminder-list');
    const container = document.getElementById('reminder-items-container');
    container.innerHTML = '<div style="color: #888; text-align: center;">Carregando lembretes...</div>';
    modalList.classList.remove('hidden');

    try {
        const { data: reminders, error } = await supabase.from('reminders').select('*').order('date', { ascending: true });
        if (error) throw error;

        if (!reminders || reminders.length === 0) {
            container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Nenhum lembrete agendado.</div>';
            return;
        }

        let html = '';
        reminders.forEach(item => {
            html += `
                <div style="background: var(--bg-dark, #0f172a); border: 1px solid rgba(255,255,255,0.08); padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: #fff; display: block; margin-bottom: 4px;">${item.remindMeTo}</strong>
                        <small style="color: var(--primary, #3b82f6);"><i class="fa-regular fa-clock"></i> ${item.date} às ${item.time}</small>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="window.editReminder('${item.id}', '${encodeURIComponent(item.remindMeTo)}', '${item.date}', '${item.time}')" style="background: #eab308; color: #000; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: bold;">Adiar / Editar</button>
                        <button onclick="window.deleteReminder('${item.id}')" style="background: #ef4444; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Excluir</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (err) {
        console.error('Erro ao buscar lembretes:', err);
        container.innerHTML = '<div style="color: #ef4444; text-align: center;">Erro ao carregar lembretes.</div>';
    }
}

// Funções globais para escutar os cliques dentro da lista HTML
window.deleteReminder = async function(id) {
    if (!confirm('Deseja realmente excluir este lembrete?')) return;
    try {
        const { error } = await supabase.from('reminders').delete().eq('id', id);
        if (error) throw error;
        openReminderListModal();
        checkRemindersStatus();
    } catch (err) {
        console.error('Erro ao excluir:', err);
    }
};

window.editReminder = function(id, text, date, time) {
    openReminderFormModal({ id, remindMeTo: decodeURIComponent(text), date, time });
};

// Checa expiração, dispara os toasts e gerencia a bolinha indicadora
async function checkRemindersStatus() {
    try {
        const { data: reminders, error } = await supabase.from('reminders').select('*');
        if (error || !reminders) return;

        const now = new Date();
        let hasExpired = false;

        reminders.forEach(r => {
            const reminderDate = new Date(`${r.date}T${r.time}`);

            // Se o horário do lembrete já passou ou é o momento exato
            if (reminderDate <= now) {
                hasExpired = true;

                // Dispara o toast no canto inferior esquerdo se ainda não foi avisado nesta sessão
                if (!notifiedReminderIds.has(r.id)) {
                    notifiedReminderIds.add(r.id);
                    triggerToastNotification(r.remindMeTo);
                }
            }
        });

        // Alterna a exibição da bolinha verde/vermelha
        const badge = document.getElementById('reminders-badge');
        if (badge) {
            if (hasExpired) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (err) {
        console.error('Erro na checagem de lembretes:', err);
    }
}

// Janela temporária no canto inferior esquerdo (some em 5s)
function triggerToastNotification(text) {
    const container = document.getElementById('reminder-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'reminder-toast';
    toast.innerHTML = `<strong>🔔 Lembrete:</strong><div style="margin-top: 4px;">${text}</div>`;

    container.appendChild(toast);

    // Remove do DOM após 5 segundos
    setTimeout(() => {
        toast.remove();
    }, 5000);
}
