// main.js
import { getSession, clearSession, handleRegister, handleLogin, initSecurity } from './auth.js';
import { openProfile } from './profile.js';
import { openMissions } from './missions.js';
import { openRanking } from './rank.js';
import { openSuperStars } from './SuperStar.js';
import { openFlashcards } from './flashcards.js';

document.addEventListener("DOMContentLoaded", async () => {
    // Executa a verificação de segurança controlada primeiro
    await initSecurity();

    const session = getSession();

    // Controle de exibição (Logado vs Deslogado)
    if (session) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        applyTheme(session.serie);
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
    // LÓGICA DO DIALOG (JANELAS)
    // ==========================================
    const modal = document.getElementById('content-modal');
    
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
    
document.getElementById('btn-flashcards').addEventListener('click', openFlashcards);
    
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
