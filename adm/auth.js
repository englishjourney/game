import { supabase } from '../supabaseClient.js';
import { showAdmPanel } from './main.js';

export function initAuth() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const psswd = document.getElementById('adm-password').value;
        const errorDiv = document.getElementById('login-error');

        try {
            const { data, error } = await supabase
                .from('users')
                .select('id')
                .eq('username', 'micael.svg')
                .eq('psswd', psswd)
                .single();

            if (error || !data) throw new Error("Senha incorreta.");

            sessionStorage.setItem('adm_logged_in', 'true');
            showAdmPanel();

        } catch (err) {
            errorDiv.textContent = err.message;
        }
    });
}

export async function isAdmLoggedIn() {
    return sessionStorage.getItem('adm_logged_in') === 'true';
}

export function logout() {
    sessionStorage.removeItem('adm_logged_in');
    location.reload();
}
