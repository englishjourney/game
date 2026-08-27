// main.js
import { getSession, clearSession, handleRegister, handleLogin, initSecurity } from './auth.js';
import { openProfile } from './profile.js';
import { openMissions } from './missions.js';
import { openRanking } from './rank.js';
import { openSuperStars } from './SuperStar.js';
import { openFlashcards } from './flashcards.js';
import { openAppsDialog } from './apps.js'; // INCLUSÃO DA NOVA LÓGICA DE APPS

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

        if (btnAvatar) {
            // Limpa o conteúdo atual do botão para evitar conflitos (remove tag img vazia ou letras antigas)
            btnAvatar.innerHTML = '';
            
            // Reseta estilos básicos do botão para os dois casos
            btnAvatar.style.padding = '0';
            btnAvatar.style.background = 'transparent';
            btnAvatar.style.border = 'none';
            btnAvatar.style.cursor = 'pointer';

            if (session.avatar_url && session.avatar_url.trim() !== '') {
                // Se tem imagem, cria a tag <img> dinamicamente e injeta
                const img = document.createElement('img');
                img.id = 'user-avatar';
                img.src = session.avatar_url;
                img.alt = 'Avatar do Estudante';
                
                // Estiliza a imagem para ser um círculo perfeito
                img.style.width = '45px';
                img.style.height = '45px';
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';
                img.style.border = '2px solid #333';
                
                btnAvatar.appendChild(img);
            } else {
                // Se não houver avatar_url, exibe a primeira letra num círculo estilizado
                const userName = session.name || session.username || 'U';
                const initialLetter = userName.charAt(0).toUpperCase();

                btnAvatar.textContent = initialLetter;
                
                // Transforma o próprio botão num círculo maior com a letra
                btnAvatar.style.width = '45px';
                btnAvatar.style.height = '45px';
                btnAvatar.style.borderRadius = '50%';
                btnAvatar.style.display = 'flex';
                btnAvatar.style.alignItems = 'center';
                btnAvatar.style.justifyContent = 'center';
                btnAvatar.style.backgroundColor = '#ffcc00'; // Cor base que combina com as estrelas
                btnAvatar.style.color = '#333';
                btnAvatar.style.fontWeight = '900';
                btnAvatar.style.fontSize = '22px';
                btnAvatar.style.border = '2px solid #333';
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
