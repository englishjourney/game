// main.js
import { getSession, clearSession, handleRegister, handleLogin } from './auth.js';
import { openProfile } from './profile.js';
import { openMissions } from './missions.js';
import { openRanking } from './rank.js';
import { openSuperStars } from './SuperStar.js';
import { openFlashcards } from './flashcards.js';
import { openAppsDialog } from './apps.js'; 
import { supabase } from './supabaseClient.js'; // IMPORTAÇÃO DO SUPABASE PARA BUSCA EM TEMPO REAL
import { initNotifications } from './notifications.js';
import { initAccountRecovery } from './accountRecovery.js';

document.addEventListener("DOMContentLoaded", async () => {
    const session = getSession();

    if (session) initNotifications();
    else applyTheme(null); // A tela inicial usa o tema padrão do Fundamental.

    // Controle de exibição (Logado vs Deslogado)
    if (session) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        applyTheme(session.grade || session.serie); // Fallback for sessions cached before the grade migration

        // ==========================================
        // CARREGAMENTO DO AVATAR DO USUÁRIO
        // ==========================================
        const btnAvatar = document.getElementById('btn-avatar');
        const profileContainer = document.querySelector('.profile-container');

        // Mantém os três controles agrupados no container de perfil.
        if (profileContainer) {
            profileContainer.style.display = 'flex';
            profileContainer.style.flexDirection = 'row';
            profileContainer.style.alignItems = 'center';
            profileContainer.style.gap = '12px';
        }

        const classBackgrounds = {
            'Archer': 'bg/archer.png',
            'Builder': 'bg/builder.png',
            'Explorer': 'bg/explorer.png',
            'Fairy': 'bg/fairy.png',
            'Farmer': 'bg/farmer.png',
            'Miner': 'bg/miner.png',
            'Redstone Engineer': 'bg/redstoneengineer.png',
            'Summoner': 'bg/summoner.png',
            'Warrior': 'bg/warrior.png',
            'Witch': 'bg/witch.png',
            'Wizard': 'bg/wizard.png'
        };

        const applyProfileClassBackground = className => {
            if (!profileContainer) return;
            const imagePath = classBackgrounds[className];
            if (imagePath) {
                profileContainer.style.setProperty('--profile-class-image', 'url("' + imagePath + '")');
            } else {
                profileContainer.style.removeProperty('--profile-class-image');
            }
        };

        if (btnAvatar) {
            // Função para montar o visual do Avatar
            const updateAvatarUI = (avatarUrl, userName) => {
                btnAvatar.innerHTML = ''; // Limpa conteúdo anterior
                
                // Estilos base para o botão do Avatar
                btnAvatar.style.padding = '0';
                btnAvatar.style.background = 'transparent';
                btnAvatar.style.border = 'none';
                btnAvatar.style.cursor = 'pointer';
                btnAvatar.style.width = '90px';
                btnAvatar.style.height = '90px';
                btnAvatar.style.borderRadius = '50%';
                btnAvatar.style.display = 'flex';
                btnAvatar.style.alignItems = 'center';
                btnAvatar.style.justifyContent = 'center';

                if (avatarUrl && avatarUrl.trim() !== '') {
                    // Monta a Imagem
                    const img = document.createElement('img');
                    img.id = 'user-avatar';
                    img.src = avatarUrl;
                    img.alt = 'Avatar do Estudante';
                    
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.borderRadius = '50%';
                    img.style.objectFit = 'cover';
                    img.style.border = '2px solid #333';
                    
                    btnAvatar.appendChild(img);
                } else {
                    // Monta a Letra Inicial
                    const initialLetter = (userName || 'U').charAt(0).toUpperCase();
                    btnAvatar.textContent = initialLetter;
                    
                    btnAvatar.style.backgroundColor = '#ffcc00';
                    btnAvatar.style.color = '#333';
                    btnAvatar.style.fontWeight = '900';
                    btnAvatar.style.fontSize = '22px';
                    btnAvatar.style.border = '2px solid #333';
                }
            };

            // 1. Renderiza instantaneamente o que tiver salvo na sessão
            updateAvatarUI(session.avatar_url, session.name || session.username);

            // 2. Busca no banco de dados para garantir que pega imagens novas adicionadas em outra sessão
            if (session.username) {
                supabase
                    .from('users')
                    .select('avatar_url, class')
                    .eq('username', session.username)
                    .single()
                    .then(({ data, error }) => {
                        if (!error && data) {
                            // Atualiza a foto e o fundo do container conforme a classe do usuário.
                            updateAvatarUI(data.avatar_url, session.name || session.username);
                            applyProfileClassBackground(data.class);
                        }
                    })
                    .catch(err => console.error("Erro ao verificar o avatar no banco:", err));
            }
        }
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }

    // ==========================================
    // ESCUTADORES DE EVENTO DOS FORMULÁRIOS
    // ==========================================
    const registerForm = document.getElementById('register-form');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    // Event listener do Avatar (Perfil)
    const btnAvatar = document.getElementById('btn-avatar');
    if (btnAvatar) {
        btnAvatar.addEventListener('click', () => {
            openProfile();
        });
    }

    // Toggle Formulários (Login / Cadastro)
    const btnShowRegister = document.getElementById('btn-show-register');
    if (btnShowRegister) {
        btnShowRegister.addEventListener('click', () => {
            document.getElementById('login-form').parentElement.classList.add('hidden');
            document.getElementById('register-box').classList.remove('hidden');
        });
    }

    const btnShowLogin = document.getElementById('btn-show-login');
    if (btnShowLogin) {
        btnShowLogin.addEventListener('click', () => {
            document.getElementById('register-box').classList.add('hidden');
            document.getElementById('login-form').parentElement.classList.remove('hidden');
        });
    }

    // Lógica do botão de Sair
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            clearSession();
            window.location.reload(); 
        });
    }

    // ==========================================
    // LÓGICA DO DIALOG (JANELAS E APPS)
    // ==========================================
    const modal = document.getElementById('content-modal');
    
    // BOTÃO LATERAL DE APPS
    const btnAppsSidebar = document.getElementById('btn-apps-sidebar');
    if (btnAppsSidebar) {
        btnAppsSidebar.addEventListener('click', () => {
            openAppsDialog();
        });
    }
    
    const btnMissions = document.getElementById('btn-missions');
    if (btnMissions) {
        btnMissions.addEventListener('click', () => {
            openMissions();
        });
    }

    const btnRanking = document.getElementById('btn-ranking');
    if (btnRanking) {
        btnRanking.addEventListener('click', () => {
            openRanking();
        });
    }

    const btnSuperstars = document.getElementById('btn-superstars');
    if (btnSuperstars) {
        btnSuperstars.addEventListener('click', () => {
            openSuperStars();
        });
    }
    
    const btnFlashcards = document.getElementById('btn-flashcards');
    if (btnFlashcards) {
        btnFlashcards.addEventListener('click', () => {
            openFlashcards();
        });
    }
    
    const btnCloseModal = document.getElementById('btn-close-modal');
    if (btnCloseModal && modal) {
        btnCloseModal.addEventListener('click', () => modal.close());
    }

    initAccountRecovery();
});

function applyTheme(grade) {
    const firstGradeDigit = String(grade || '').trim().charAt(0);
    const isHighSchool = ['1', '2', '3'].includes(firstGradeDigit);
    const themeStyle = document.getElementById('theme-highschool');
    const logoImg = document.getElementById('app-logo');
    document.body.classList.toggle('high-school-theme', isHighSchool);

    if (isHighSchool) {
        if (themeStyle) themeStyle.href = 'style.css';
        if (logoImg) logoImg.src = 'logorpg.png';
        return;
    }

    if (themeStyle) themeStyle.href = '';
    if (logoImg) logoImg.src = 'logoarcade.png';
    createFundamentalStars();
}

function createFundamentalStars() {
    const container = document.getElementById('fundamental-stars');
    if (!container || container.childElementCount > 0) return;

    // Distribuição fixa para manter o visual consistente entre carregamentos.
    const positions = [
        [5, 12, 16], [14, 31, 13], [23, 9, 18], [33, 24, 14],
        [44, 8, 12], [54, 19, 17], [66, 11, 14], [78, 27, 19],
        [91, 13, 15], [8, 52, 13], [18, 72, 18], [29, 49, 15],
        [40, 83, 13], [51, 62, 17], [63, 88, 14], [74, 57, 19],
        [86, 76, 13], [96, 48, 16], [3, 89, 17], [25, 93, 14],
        [36, 66, 18], [48, 39, 13], [59, 31, 15], [69, 42, 12],
        [82, 6, 14], [94, 92, 18]
    ];

    positions.forEach(([left, top, size], index) => {
        const star = document.createElement('span');
        star.textContent = index % 4 === 0 ? '✧' : '✦';
        star.style.left = left + '%';
        star.style.top = top + '%';
        star.style.setProperty('--star-size', (size + 3) + 'px');
        star.style.setProperty('--float-duration', (6 + (index % 5) * 0.8) + 's');
        star.style.setProperty('--float-delay', (-0.45 * (index % 7)) + 's');
        container.appendChild(star);
    });
}
