// main.js
import { getSession, clearSession, handleRegister, handleLogin } from './auth.js';
import { openProfile } from './profile.js';
import { openMissions } from './missions.js';
import { openRanking } from './rank.js';
import { openSuperStars } from './SuperStar.js';

document.addEventListener("DOMContentLoaded", () => {
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
    document.getElementById('btn-avatar').addEventListener('click', () => {
        openProfile();
    });

    // Toggle Formulários (Login / Cadastro)
    document.getElementById('btn-show-register').addEventListener('click', () => {
        document.getElementById('login-form').parentElement.classList.add('hidden');
        document.getElementById('register-box').classList.remove('hidden');
    });

    document.getElementById('btn-show-login').addEventListener('click', () => {
        document.getElementById('register-box').classList.add('hidden');
        document.getElementById('login-form').parentElement.classList.remove('hidden');
    });

    // Lógica do botão de Sair
    document.getElementById('btn-logout').addEventListener('click', () => {
        clearSession();
        window.location.reload(); 
    });

    // ==========================================
    // LÓGICA DO DIALOG (JANELAS) - CORRIGIDA
    // ==========================================
    const modal = document.getElementById('content-modal');
    
    // Antes estava apenas abrindo o modal vazio/antigo. Agora chama a função correta!
    document.getElementById('btn-missions').addEventListener('click', () => {
        openMissions();
    });

    // Adicionado o listener para o Ranking
    document.getElementById('btn-ranking').addEventListener('click', () => {
        openRanking();
    });

    // Adicionado o listener para os Super Stars
    document.getElementById('btn-superstars').addEventListener('click', () => {
        openSuperStars();
    });
    
    document.getElementById('btn-close-modal').addEventListener('click', () => modal.close());
});

function applyTheme(serie) {
    const isHighSchool = ['1', '2', '3'].includes(serie);
    const themeStyle = document.getElementById('theme-highschool');
    const logoImg = document.getElementById('app-logo');

    if (isHighSchool) {
        themeStyle.href = 'style.css';
        logoImg.src = 'logorpg.png';
    } else {
        themeStyle.href = '';
        logoImg.src = 'logoarcade.png';
    }
}
