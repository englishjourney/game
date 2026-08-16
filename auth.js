// auth.js
import { runSecurityChecks } from './firewall.js';
import { supabase } from './supabaseClient.js';

const { data: admData } = await supabase
    .from('users')
    .select('auth')
    .eq('username', 'micael.svg')
    .single();

// Se o auth estiver 'off' ou não existir, roda a verificação de segurança normal
if (!admData || admData.auth !== 'on') {
    await runSecurityChecks();
} else {
    console.log("Acesso em casa permitido pelo administrador. Ignorando verificações de segurança.");
}

export function validateUsername(username) {
    const regex = /^[a-z0-9\-\_\.]+$/;
    if (!regex.test(username)) {
        return { valid: false, message: "O usuário deve conter apenas letras minúsculas, números, -, _ ou ." };
    }
    return { valid: true };
}

export function validatePassword(password) {
    const regex = /^(?=.*[a-zA-Z])(?=.*\d)[\x21-\x7E]+$/;
    if (!regex.test(password)) {
        return { valid: false, message: "A senha deve conter letras e números, não pode conter espaços nem emojis." };
    }
    return { valid: true };
}

export function saveSession(userData) {
    localStorage.setItem('studentSession', JSON.stringify(userData));
}

export function clearSession() {
    localStorage.removeItem('studentSession');
}

export function getSession() {
    return JSON.parse(localStorage.getItem('studentSession'));
}

// ==========================================
// FUNÇÕES DE INTEGRAÇÃO COM O SUPABASE
// ==========================================

export async function handleRegister(event) {
    event.preventDefault(); // Impede a página de recarregar ao enviar o formulário

    // Captura os valores digitados no HTML
    const name = document.getElementById('reg-name').value;
    const username = document.getElementById('reg-username').value;
    const psswd = document.getElementById('reg-password').value;
    const serie = document.getElementById('reg-serie').value;
    const team = document.getElementById('reg-team').value;

    // 1. Validações de segurança
    const userValidation = validateUsername(username);
    if (!userValidation.valid) return alert(userValidation.message);

    const passValidation = validatePassword(psswd);
    if (!passValidation.valid) return alert(passValidation.message);

    try {
        // 2. Verifica se o nome de usuário já existe no banco
        const { data: existingUser, error: searchError } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .maybeSingle();

        if (existingUser) {
            return alert("Este nome de usuário já está em uso. Escolha outro.");
        }

        // 3. Insere os dados na tabela users
        const { error: insertError } = await supabase
            .from('users')
            .insert([
                {
                    name: name,
                    username: username,
                    psswd: psswd, 
                    serie: serie,
                    team: team,
                    score: 0,          
                    stars: 0,          
                    hearts: 3,         
                    class: null,       
                    rank: 'Dirt',      
                    avatar_url: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcS-55RgG38bJTopB10KrZknHMZMf94R5cEbUh8ZqWe8wiBmCyJE'
                }
            ]);

        if (insertError) throw insertError;

        alert("Cadastro realizado com sucesso! Faça login para entrar.");
        
        // Limpa o formulário e volta para a tela de login
        document.getElementById('register-form').reset();
        document.getElementById('register-box').classList.add('hidden');
        document.getElementById('login-form').parentElement.classList.remove('hidden');

    } catch (error) {
        console.error("Erro no cadastro:", error);
        alert("Ocorreu um erro ao tentar cadastrar. Verifique o console.");
    }
}

export async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('login-username').value;
    const psswd = document.getElementById('login-password').value;

    try {
        // Busca o usuário e a senha no banco
        const { data, error } = await supabase
            .from('users')
            .select('username, serie')
            .eq('username', username)
            .eq('psswd', psswd)
            .maybeSingle();

        if (error || !data) {
            return alert("Usuário ou senha incorretos!");
        }

        // Se deu tudo certo, salva a sessão e recarrega a página
        saveSession({ username: data.username, serie: data.serie });
        window.location.reload();

    } catch (error) {
        console.error("Erro no login:", error);
        alert("Ocorreu um erro ao tentar fazer login.");
    }
}

// ==========================================
// INICIALIZAÇÃO DA PÁGINA E EVENTOS (FORA DAS FUNÇÕES)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Checa se já existe uma sessão ativa ao carregar a página
    const currentSession = getSession();
    
    if (currentSession) {
        // Se tem sessão, esconde o login e mostra o App
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        
        console.log(`Usuário logado: ${currentSession.username}`);
    } else {
        // Se não tem sessão, garante que a tela de login está visível
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }

    // 2. Conecta os formulários às funções
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // 3. Conecta o botão de sair (Logout)
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            clearSession();
            window.location.reload(); 
        });
    }
});
