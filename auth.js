// auth.js
import { supabase } from './supabaseClient.js';
import { showLoader, hideLoader } from './loader.js';

// Bloqueia submissões simultâneas, inclusive cliques muito rápidos.
let authInProgress = false;

function beginAuth(form, grade = null) {
    if (authInProgress) return false;
    authInProgress = true;
    const submitButton = form?.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalText = submitButton.textContent;
        submitButton.textContent = 'Aguarde...';
    }
    showLoader(grade);
    return true;
}

function endAuth(form) {
    authInProgress = false;
    const submitButton = form?.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = false;
        if (submitButton.dataset.originalText) {
            submitButton.textContent = submitButton.dataset.originalText;
            delete submitButton.dataset.originalText;
        }
    }
    hideLoader();
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

    const form = event.currentTarget;
    if (authInProgress) return;

    const name = document.getElementById('reg-name').value;
    const username = document.getElementById('reg-username').value;
    const psswd = document.getElementById('reg-password').value;
    const serie = document.getElementById('reg-serie').value.trim();
    const team = document.getElementById('reg-team').value.trim().toUpperCase();
    const grade = serie + team;

    const userValidation = validateUsername(username);
    if (!userValidation.valid) return alert(userValidation.message);

    const passValidation = validatePassword(psswd);
    if (!passValidation.valid) return alert(passValidation.message);

    if (!beginAuth(form, grade)) return;

    try {
        const { data: existingUser, error: lookupError } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .maybeSingle();

        if (lookupError) throw lookupError;

        if (existingUser) {
            alert("Este nome de usuário já está em uso. Escolha outro.");
            return;
        }

        const { error: insertError } = await supabase
            .from('users')
            .insert([{
                name: name,
                username: username,
                psswd: psswd,
                grade: grade,
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
    } finally {
        endAuth(form);
    }
}

export async function handleLogin(event) {
    event.preventDefault();

    const form = event.currentTarget;
    if (authInProgress || !beginAuth(form)) return;

    const username = document.getElementById('login-username').value;
    const psswd = document.getElementById('login-password').value;

    try {
        const { data, error } = await supabase
            .from('users')
            .select('username, grade, name, avatar_url')
            .eq('username', username)
            .eq('psswd', psswd)
            .maybeSingle();

        if (error || !data) {
            alert("Usuário ou senha incorretos!");
            return;
        }

        // Atualiza a aparência do loader assim que conhecemos a série do usuário.
        showLoader(data.grade);

        let tcsSessionToken = null;
        try {
            const { data: gameSession, error: gameSessionError } = await supabase.functions.invoke('the-city-sleeps', {
                body: { action: 'create_session', username: data.username, password: psswd }
            });
            if (!gameSessionError && gameSession?.data?.sessionToken) tcsSessionToken = gameSession.data.sessionToken;
        } catch (gameSessionError) {
            console.warn('The City Sleeps session will be created when the game is opened:', gameSessionError);
        }

        saveSession({
            username: data.username,
            grade: data.grade,
            name: data.name,
            avatar_url: data.avatar_url,
            tcsSessionToken
        });
        window.location.reload();

    } catch (error) {
        console.error("Erro no login:", error);
        alert("Ocorreu um erro ao tentar fazer login.");
    } finally {
        endAuth(form);
    }
}
