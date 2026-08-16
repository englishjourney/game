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
                .select('id, auth')
                .eq('username', 'micael.svg')
                .eq('psswd', psswd)
                .single();

            if (error || !data) throw new Error("Senha incorreta.");

            sessionStorage.setItem('adm_logged_in', 'true');
            sessionStorage.setItem('adm_auth_status', data.auth || 'off');
            setupHomeAccessToggle(data.auth);
            showAdmPanel();

        } catch (err) {
            errorDiv.textContent = err.message;
        }
    });
}

export async function isAdmLoggedIn() {
    if (sessionStorage.getItem('adm_logged_in') === 'true') {
        // Busca status atual do auth ao recarregar
         const { data } = await supabase.from('users').select('auth').eq('username', 'micael.svg').single();
         if(data) setupHomeAccessToggle(data.auth);
         return true;
    }
    return false;
}

export function logout() {
    sessionStorage.removeItem('adm_logged_in');
    location.reload();
}

function setupHomeAccessToggle(initialStatus) {
    const toggle = document.getElementById('home-access-toggle');
    if (!toggle) return;

    toggle.checked = initialStatus === 'on';

    toggle.addEventListener('change', async (e) => {
        const newStatus = e.target.checked ? 'on' : 'off';
        const { error } = await supabase
            .from('users')
            .update({ auth: newStatus })
            .eq('username', 'micael.svg');
            
        if (error) {
            alert('Erro ao alterar permissão: ' + error.message);
            e.target.checked = !e.target.checked; // reverte
        }
    });
}
