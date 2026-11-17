import { supabase } from '../supabaseClient.js';
import { showAdmPanel } from './main.js';
import { getDefaultTeacherAvatarKey, getTeacherAvatarOptions } from './teacher-avatars.js';


function renderRegisterAvatarPicker() {
    const picker = document.getElementById('register-avatar-picker');
    const avatarInput = document.getElementById('register-avatar-key');
    if (!picker || !avatarInput) return;

    const subjects = Array.from(document.querySelectorAll('input[name="teacher-subject"]:checked'))
        .map(input => input.value);
    const options = getTeacherAvatarOptions(subjects);
    const selectedKey = options.some(option => option.key === avatarInput.value)
        ? avatarInput.value
        : (options[0]?.key || '');

    avatarInput.value = selectedKey;
    if (!options.length) {
        picker.innerHTML = '<p class="avatar-picker-empty">Selecione uma ou mais disciplinas para ver os avatares disponíveis.</p>';
        return;
    }

    picker.innerHTML = options.map(option => {
        const image = option.file
            ? '<img src="./avatars/' + option.file + '" alt="" loading="lazy" onerror="this.remove();this.parentElement.querySelector(\'.avatar-option-fallback\').hidden=false;">'
            : '';
        return '<button type="button" class="avatar-option' + (option.key === selectedKey ? ' selected' : '') + '" ' +
            'data-avatar-key="' + option.key + '" aria-pressed="' + String(option.key === selectedKey) + '" title="' + option.subject + '">' +
                '<span class="avatar-option-visual" style="--avatar-option-bg:' + option.background + '">' +
                    image +
                    '<i class="fa-solid ' + option.icon + ' avatar-option-fallback"' + (option.file ? ' hidden' : '') + ' aria-hidden="true"></i>' +
                '</span>' +
                '<span class="avatar-option-label">' + option.subject + '</span>' +
            '</button>';
    }).join('');
}

function showStage(stageId) {
    document.querySelectorAll('.auth-stage').forEach(stage => stage.classList.add('hidden'));
    document.getElementById(stageId)?.classList.remove('hidden');
}

function setMessage(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-error', Boolean(isError && message));
    element.classList.toggle('is-success', Boolean(!isError && message));
}

async function showLoggedInTeacher() {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return false;

    const { data: teacher, error } = await supabase
        .from('teachers')
        .select('id')
        .eq('id', userData.user.id)
        .maybeSingle();

    if (error || !teacher) {
        await supabase.auth.signOut();
        showStage('login-step');
        setMessage('login-error', 'Esta conta não possui cadastro de professor no EduPlan. Crie a conta novamente pelo acesso geral.', true);
        return false;
    }

    await showAdmPanel();
    return true;
}

async function continueAfterGate() {
    if (sessionStorage.getItem('eduplan_gate_passed') !== 'true') {
        showStage('gate-step');
        return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session && await showLoggedInTeacher()) return;
    showStage('login-step');
}

export async function initAuth() {
    const gateForm = document.getElementById('gate-form');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const recoveryForm = document.getElementById('password-recovery-form');
    const updatePasswordForm = document.getElementById('password-update-form');

    if (!gateForm || !loginForm || !registerForm) return;

    gateForm.addEventListener('submit', async event => {
        event.preventDefault();
        const password = document.getElementById('gate-password').value;
        const button = gateForm.querySelector('[type="submit"]');
        if (button) button.disabled = true;
        setMessage('gate-error', '');

        try {
            const { data, error } = await supabase.rpc('verify_admin_gate', {
                p_password: password
            });
            if (error) throw error;
            if (!data) throw new Error('Senha geral incorreta.');

            sessionStorage.setItem('eduplan_gate_passed', 'true');
            sessionStorage.setItem('eduplan_admin_gate_token', data);
            document.getElementById('gate-password').value = '';
            await continueAfterGate();
        } catch (error) {
            setMessage('gate-error', error.message || 'Não foi possível validar a senha geral.', true);
        } finally {
            if (button) button.disabled = false;
        }
    });

    loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        setMessage('login-error', '');
        setMessage('auth-feedback', '');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const button = loginForm.querySelector('[type="submit"]');
        if (button) {
            button.disabled = true;
            button.textContent = 'Entrando...';
        }

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (!await showLoggedInTeacher()) {
                throw new Error('Não foi possível acessar o perfil de professor.');
            }
        } catch (error) {
            setMessage('login-error', error.message || 'Não foi possível entrar.', true);
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = 'Entrar <i class="fa-solid fa-arrow-right-to-bracket"></i>';
            }
        }
    });

    registerForm.addEventListener('submit', async event => {
        event.preventDefault();
        setMessage('register-error', '');

        const displayName = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const selectedAvatarKey = document.getElementById('register-avatar-key').value;
        const subjects = Array.from(registerForm.querySelectorAll('input[name="teacher-subject"]:checked'))
            .map(input => input.value);
        const availableAvatars = getTeacherAvatarOptions(subjects);
        const avatarKey = availableAvatars.some(option => option.key === selectedAvatarKey)
            ? selectedAvatarKey
            : getDefaultTeacherAvatarKey(subjects);
        const gateToken = sessionStorage.getItem('eduplan_admin_gate_token');

        if (!gateToken) {
            showStage('gate-step');
            setMessage('gate-error', 'Valide novamente a senha geral antes de criar sua conta.', true);
            return;
        }
        if (subjects.length === 0) {
            setMessage('register-error', 'Selecione ao menos uma disciplina.', true);
            return;
        }
        if (!availableAvatars.some(option => option.key === avatarKey)) {
            setMessage('register-error', 'Escolha um avatar correspondente a uma das disciplinas selecionadas.', true);
            return;
        }

        const button = registerForm.querySelector('[type="submit"]');
        if (button) {
            button.disabled = true;
            button.textContent = 'Criando conta...';
        }

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: window.location.href.split('#')[0],
                    data: {
                        display_name: displayName,
                        avatar_key: avatarKey,
                        subjects,
                        admin_gate_token: gateToken
                    }
                }
            });
            if (error) throw error;

            sessionStorage.removeItem('eduplan_admin_gate_token');
            registerForm.reset();
            document.getElementById('register-avatar-key').value = '';
            renderRegisterAvatarPicker();

            if (data.session) {
                if (!await showLoggedInTeacher()) {
                    throw new Error('A conta foi criada, mas o perfil de professor não pôde ser carregado.');
                }
            } else {
                showStage('login-step');
                setMessage('auth-feedback', 'Conta criada. Verifique seu e-mail para confirmar o cadastro e depois entre com sua senha.');
            }
        } catch (error) {
            setMessage('register-error', error.message || 'Não foi possível criar a conta.', true);
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = 'Criar conta <i class="fa-solid fa-user-plus"></i>';
            }
        }
    });

    recoveryForm?.addEventListener('submit', async event => {
        event.preventDefault();
        const email = document.getElementById('recovery-email').value.trim();
        const button = recoveryForm.querySelector('[type="submit"]');
        if (button) button.disabled = true;
        setMessage('recovery-feedback', '');

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.href.split('#')[0]
            });
            if (error) throw error;
            setMessage('recovery-feedback', 'Se houver uma conta associada a esse e-mail, enviaremos as instruções de recuperação.');
        } catch (error) {
            setMessage('recovery-feedback', error.message || 'Não foi possível solicitar a recuperação.', true);
        } finally {
            if (button) button.disabled = false;
        }
    });

    updatePasswordForm?.addEventListener('submit', async event => {
        event.preventDefault();
        const password = document.getElementById('new-password').value;
        const button = updatePasswordForm.querySelector('[type="submit"]');
        if (button) button.disabled = true;
        setMessage('password-update-feedback', '');

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            await supabase.auth.signOut();
            setMessage('password-update-feedback', 'Senha atualizada. Entre novamente com a nova senha.');
            showStage('login-step');
        } catch (error) {
            setMessage('password-update-feedback', error.message || 'Não foi possível atualizar a senha.', true);
        } finally {
            if (button) button.disabled = false;
        }
    });

    document.getElementById('forgot-password-button')?.addEventListener('click', () => {
        document.getElementById('recovery-email').value = document.getElementById('login-email').value.trim();
        setMessage('recovery-feedback', '');
        showStage('password-recovery-step');
    });
    document.getElementById('create-account-button')?.addEventListener('click', () => {
        setMessage('register-error', '');
        showStage('register-step');
    });
    document.getElementById('back-to-login-from-register')?.addEventListener('click', () => showStage('login-step'));
    document.getElementById('back-to-login-from-recovery')?.addEventListener('click', () => showStage('login-step'));

    const registerAvatarPicker = document.getElementById('register-avatar-picker');
    registerAvatarPicker?.addEventListener('click', event => {
        const option = event.target.closest('.avatar-option[data-avatar-key]');
        if (!option) return;
        document.getElementById('register-avatar-key').value = option.dataset.avatarKey;
        registerAvatarPicker.querySelectorAll('.avatar-option').forEach(item => {
            const selected = item === option;
            item.classList.toggle('selected', selected);
            item.setAttribute('aria-pressed', String(selected));
        });
    });

    registerForm.querySelectorAll('input[name="teacher-subject"]').forEach(input => {
        input.addEventListener('change', renderRegisterAvatarPicker);
    });
    renderRegisterAvatarPicker();

    supabase.auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY') {
            showStage('password-update-step');
        }
    });

    await continueAfterGate();
}

export async function logout() {
    await supabase.auth.signOut();
    sessionStorage.removeItem('eduplan_gate_passed');
    sessionStorage.removeItem('eduplan_admin_gate_token');
    location.reload();
}
