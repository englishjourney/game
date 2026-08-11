// auth.js

export function validateUsername(username) {
    // Regex: Não pode ter maiúsculas, permite apenas letras, números, hífen, underscore e ponto.
    const regex = /^[a-z0-9\-\_\.]+$/;
    if (!regex.test(username)) {
        return { valid: false, message: "O usuário deve conter apenas letras minúsculas, números, -, _ ou ." };
    }
    return { valid: true };
}

export function validatePassword(password) {
    // (?=.*[a-zA-Z]) : Exige no mínimo uma letra
    // (?=.*\d)       : Exige no mínimo um número
    // ^[\x21-\x7E]+$ : Exige que sejam apenas caracteres visíveis (exclui espaços e emojis)
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
