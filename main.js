// main.js
import { getSession, clearSession } from './auth.js';
import { openProfile } from './profile.js';

document.addEventListener("DOMContentLoaded", () => {
    const session = getSession();

    // Controle de exibição (Logado vs Deslogado)
    if (session) {
        // Usuário logado
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        applyTheme(session.serie);
    } else {
        // Usuário não logado
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }

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
        window.location.reload(); // Recarrega a página para voltar ao login
    });

    // Lógica do Dialog (Janelas)
    const modal = document.getElementById('content-modal');
    document.getElementById('btn-missions').addEventListener('click', () => modal.showModal());
    document.getElementById('btn-close-modal').addEventListener('click', () => modal.close());
});

function applyTheme(serie) {
    const isHighSchool = ['1', '2', '3'].includes(serie);
    const themeStyle = document.getElementById('theme-highschool');
    const logoImg = document.getElementById('app-logo');

    if (isHighSchool) {
        // Carrega o CSS do Ensino Médio e muda a logo
        themeStyle.href = 'style.css';
        logoImg.src = 'logorpg.png';
    } else {
        // Mantém o padrão (Fundamental)
        themeStyle.href = '';
        logoImg.src = 'logoarcade.png';
    }
}
