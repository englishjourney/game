// main.js
import { getSession, clearSession, handleRegister, handleLogin, initSecurity } from './auth.js';
import { openProfile } from './profile.js';
import { openMissions } from './missions.js';
import { openRanking } from './rank.js';
import { openSuperStars } from './SuperStar.js';
import { openFlashcards } from './flashcards.js';
import { openAppsDialog } from './apps.js'; 
import { supabase } from './supabaseClient.js'; // IMPORTAÇÃO DO SUPABASE PARA BUSCA EM TEMPO REAL

document.addEventListener("DOMContentLoaded", async () => {
    // Executa a verificação de segurança controlada primeiro
    await initSecurity();

    const session = getSession();

    // Controle de exibição (Logado vs Deslogado)
    if (session) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        applyTheme(session.serie);

        // ==========================================
        // CARREGAMENTO DO AVATAR DO USUÁRIO
        // ==========================================
        const btnAvatar = document.getElementById('btn-avatar');
        const profileContainer = document.querySelector('.profile-container');

        // Garante que o Avatar e o Botão Sair fiquem lado a lado sem sobrepor
        if (profileContainer) {
            profileContainer.style.display = 'flex';
            profileContainer.style.flexDirection = 'row';
            profileContainer.style.alignItems = 'center';
            profileContainer.style.gap = '18px'; // Espaçamento entre o avatar e o sair
        }

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
                    .select('avatar_url')
                    .eq('username', session.username)
                    .single()
                    .then(({ data, error }) => {
                        if (!error && data) {
                            // Se achou uma imagem no banco, atualiza a interface imediatamente
                            updateAvatarUI(data.avatar_url, session.name || session.username);
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
});

function applyTheme(serie) {
    const isHighSchool = ['1', '2', '3'].includes(serie);
    const themeStyle = document.getElementById('theme-highschool');
    const logoImg = document.getElementById('app-logo');

    if (isHighSchool) {
        if (themeStyle) themeStyle.href = 'style.css';
        if (logoImg) logoImg.src = 'logorpg.png';
    } else {
        if (themeStyle) themeStyle.href = '';
        if (logoImg) logoImg.src = 'logoarcade.png';
    }
}
