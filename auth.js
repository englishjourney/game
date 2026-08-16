// auth.js
import { runSecurityChecks } from './firewall.js';
import { supabase } from './supabaseClient.js';

// Convertido em função para não travar o carregamento dos módulos
export async function initSecurity() {
    try {
        const { data: admData } = await supabase
            .from('users')
            .select('auth')
            .eq('username', 'micael.svg')
            .single();

        if (!admData || admData.auth !== 'on') {
            await runSecurityChecks();
        } else {
            console.log("Acesso em casa permitido pelo administrador. Ignorando verificações de segurança.");
        }
    } catch (error) {
        console.error("Erro na verificação de segurança, executando firewall por segurança:", error);
        await runSecurityChecks();
    }
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

export async function handleRegister(event) {
    event.preventDefault(); 

    const name = document.getElementById('reg-name').value;
    const username = document.getElementById('reg-username').value;
    const psswd = document.getElementById('reg-password').value;
    const serie = document.getElementById('reg-serie').value;
    const team = document.getElementById('reg-team').value;

    const userValidation = validateUsername(username);
    if (!userValidation.valid) return alert(userValidation.message);

    const passValidation = validatePassword(psswd);
    if (!passValidation.valid) return alert(passValidation.message);

    try {
        const { data: existingUser } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .maybeSingle();

        if (existingUser) {
            return alert("Este nome de usuário já está em uso. Escolha outro.");
        }

        const { error: insertError } = await supabase
            .from('users')
            .insert([{
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
            }]);

        if (insertError) throw insertError;

        alert("Cadastro realizado com sucesso! Faça login para entrar.");
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
        const { data, error } = await supabase
            .from('users')
            .select('username, serie')
            .eq('username', username)
            .eq('psswd', psswd)
            .maybeSingle();

        if (error || !data) {
            return alert("Usuário ou senha incorretos!");
        }

        saveSession({ username: data.username, serie: data.serie });
        window.location.reload();

    } catch (error) {
        console.error("Erro no login:", error);
        alert("Ocorreu um erro ao tentar fazer login.");
    }
}
