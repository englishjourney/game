import { supabase } from '../supabaseClient.js';

let currentTeacherId = null;
let currentTeacherSubjects = [];
let currentTeacherIsPrimary = false;
let activeSubject = '';
let studentsById = new Map();
let studentGradesById = new Map();
let activeGradeEditor = null;
const GRADE_COMPONENTS = ['Assiduidade', 'Material didático', 'Trabalhos', 'Prova', 'Extra'];
let usersLoadSequence = 0;
let usersInitializationPromise = null;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

export function initUsers() {
    if (usersInitializationPromise) return usersInitializationPromise;
    usersInitializationPromise = initializeUsers();
    return usersInitializationPromise;
}

async function initializeUsers() {
    const container = document.getElementById('users-container');
    if (!container) return;

    container.innerHTML = '<p class="users-loading">Identificando suas disciplinas...</p>';

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
        container.innerHTML = '<p class="users-load-error">Sua sessão expirou. Entre novamente no EduPlan.</p>';
        return;
    }

    const { data: teacher, error: teacherError } = await supabase
        .from('teachers')
        .select('id, subjects, is_primary')
        .eq('id', authData.user.id)
        .maybeSingle();

    if (teacherError || !teacher) {
        console.error('Não foi possível identificar o professor do EduPlan:', teacherError);
        container.innerHTML = '<p class="users-load-error">Não foi possível identificar seu cadastro de professor.</p>';
        return;
    }

    currentTeacherId = teacher.id;
    currentTeacherIsPrimary = Boolean(teacher.is_primary);
    currentTeacherSubjects = [...new Set((Array.isArray(teacher.subjects) ? teacher.subjects : [])
        .map(subject => String(subject || '').trim())
        .filter(Boolean))];

    if (!currentTeacherSubjects.length) {
        container.innerHTML = '<p class="users-load-error">Nenhuma disciplina está vinculada à sua conta. Peça ao administrador para atualizar seu cadastro.</p>';
        return;
    }

    activeSubject = currentTeacherSubjects[0];
    renderSubjectControl();
    setupStudentSearch();
    setupStudentGradeModal(container);
    setupMissingStudentFeature(container);
    await loadUsers();
}

function renderSubjectControl() {
    const control = document.getElementById('users-subject-control');
    if (!control) return;

    const subjectOptions = currentTeacherSubjects
        .map(subject => '<option value="' + escapeHtml(subject) + '"' +
            (subject === activeSubject ? ' selected' : '') + '>' +
            escapeHtml(subject) + '</option>')
        .join('');

    if (currentTeacherSubjects.length > 1) {
        control.innerHTML =
            '<div class="users-subject-heading">' +
                '<span class="users-subject-icon"><i class="fa-solid fa-book-open" aria-hidden="true"></i></span>' +
                '<div class="users-subject-copy"><strong>Notas por disciplina</strong>' +
                    '<small>Você verá apenas as notas das matérias vinculadas à sua conta.</small></div>' +
            '</div>' +
            '<label class="users-subject-select-wrap" for="users-subject-select">' +
                '<span>Disciplina</span>' +
                '<select id="users-subject-select">' + subjectOptions + '</select>' +
            '</label>';

        const select = control.querySelector('#users-subject-select');
        select.addEventListener('change', () => {
            const selected = currentTeacherSubjects.find(subject => subject === select.value);
            if (!selected || selected === activeSubject) return;
            activeSubject = selected;
            loadUsers();
        });
    } else {
        control.innerHTML =
            '<div class="users-subject-heading">' +
                '<span class="users-subject-icon"><i class="fa-solid fa-book-open" aria-hidden="true"></i></span>' +
                '<div class="users-subject-copy"><strong>Notas de ' + escapeHtml(activeSubject) + '</strong>' +
                    '<small>Esta tela mostra e permite editar somente as notas desta disciplina.</small></div>' +
            '</div>';
    }
}

function setupStudentSearch() {
    const searchInput = document.getElementById('users-search');
    const resultsContainer = document.getElementById('users-search-results');
    if (!searchInput || !resultsContainer || searchInput.dataset.initialized === 'true') return;
    searchInput.dataset.initialized = 'true';

    searchInput.addEventListener('input', event => {
        const query = event.target.value.trim().toLocaleLowerCase('pt-BR');
        resultsContainer.innerHTML = '';
        if (query.length < 2) {
            resultsContainer.classList.add('hidden');
            return;
        }

        let found = false;
        document.querySelectorAll('.users-table tbody tr').forEach(row => {
            const teamSection = row.closest('.team-section');
            const grade = teamSection?.querySelector('.team-grade-badge')?.textContent.trim() || '';
            const searchableText = (row.innerText + ' ' + grade).toLocaleLowerCase('pt-BR');

            if (!searchableText.includes(query)) return;
            found = true;

            const name = row.cells[0]?.innerText || 'Aluno';
            const result = document.createElement('button');
            result.type = 'button';
            result.className = 'search-item search-result-item users-search-result';
            result.innerText = grade ? name + ' — Turma ' + grade : name;
            result.addEventListener('click', () => {
                const navButton = document.querySelector('.nav-btn[data-target="users-section"]');
                if (navButton) navButton.click();

                const teamContent = teamSection?.querySelector('.team-content');
                const toggleButton = teamSection?.querySelector('.team-header .team-toggle');
                if (teamContent) teamContent.classList.remove('hidden');
                if (toggleButton) {
                    toggleButton.setAttribute('aria-expanded', 'true');
                    toggleButton.setAttribute('aria-label', 'Recolher turma');
                    toggleButton.title = 'Recolher turma';
                    toggleButton.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
                }

                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('search-result-highlight');
                window.setTimeout(() => row.classList.remove('search-result-highlight'), 3000);
                resultsContainer.classList.add('hidden');
                searchInput.value = '';
            });
            resultsContainer.appendChild(result);
        });

        resultsContainer.classList.toggle('hidden', !found);
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('#users-search') && !event.target.closest('#users-search-results')) {
            resultsContainer.classList.add('hidden');
        }
    });
}

function isEnglishSubject(subject) {
    return String(subject || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase() === 'ingles';
}

function canViewStudentScore() {
    return currentTeacherIsPrimary && currentTeacherSubjects.some(isEnglishSubject);
}

function getGradeComponentValues(value) {
    let values = value;
    if (typeof value === 'string' && /^\s*\{.*\}\s*$/.test(value)) {
        values = value.trim().slice(1, -1).split(',').map(item => item === '' ? null : item);
    }
    if (!Array.isArray(values)) return [null, null, null, null, null];
    return Array.from({ length: 5 }, (_, index) => {
        const item = values[index];
        if (item === null || item === undefined || item === '') return null;
        const number = Number(item);
        return Number.isFinite(number) ? number : null;
    });
}

function getGradeFilledCount(values) {
    return getGradeComponentValues(values).filter(value => value !== null).length;
}

function renderQuarterGradeButton(studentId, quarter, savedGrades) {
    const values = getGradeComponentValues(savedGrades['nota' + quarter]);
    const filledCount = getGradeFilledCount(values);
    const action = filledCount ? 'Editar nota' : 'Preencher';
    const summary = filledCount ? filledCount + '/5 itens' : 'Não preenchida';
    return '<td class="grade-entry-cell"><button type="button" class="grade-entry-button" ' +
        'data-edit-quarter="' + quarter + '" data-student-id="' + escapeHtml(studentId) + '">' +
        '<span>' + action + '</span><small>' + summary + '</small></button></td>';
}

async function loadUsers() {
    const container = document.getElementById('users-container');
    if (!container || !activeSubject) return;

    const requestId = ++usersLoadSequence;
    container.innerHTML = '<p class="users-loading">Carregando alunos e notas de ' + escapeHtml(activeSubject) + '...</p>';

    const studentColumns = canViewStudentScore()
        ? 'id, name, username, score, grade, stars, hearts, created_at, updated_at'
        : 'id, name, username, grade, stars, hearts, created_at, updated_at';

    const [studentsResult, gradesResult] = await Promise.all([
        supabase
            .from('users')
            .select(studentColumns)
            .neq('username', 'micael.svg')
            .order('grade', { ascending: true })
            .order('name', { ascending: true }),
        supabase
            .from('student_subject_grades')
            .select('student_id, subject, nota1, nota2, nota3, nota4, updated_by')
            .eq('subject', activeSubject)
            .eq('updated_by', currentTeacherId)
    ]);

    if (requestId !== usersLoadSequence) return;

    if (studentsResult.error) {
        console.error('Erro ao carregar alunos:', studentsResult.error);
        container.innerHTML = '<p class="users-load-error">Não foi possível carregar a lista de alunos.</p>';
        return;
    }
    if (gradesResult.error) {
        console.error('Erro ao carregar as notas da disciplina:', gradesResult.error);
        container.innerHTML = '<p class="users-load-error">Não foi possível carregar as notas de ' +
            escapeHtml(activeSubject) + '. Verifique as permissões da tabela de notas.</p>';
        return;
    }

    studentsById = new Map((studentsResult.data || []).map(student => [String(student.id), student]));
    studentGradesById = new Map(
        (gradesResult.data || []).map(record => [String(record.student_id), record])
    );

    const teams = {};
    (studentsResult.data || []).forEach(student => {
        const grade = student.grade ? String(student.grade).trim().toUpperCase() : 'Sem Turma';
        if (!teams[grade]) teams[grade] = [];
        teams[grade].push(student);
    });

    if (!Object.keys(teams).length) {
        container.innerHTML = '<div class="empty-state">Nenhum aluno cadastrado.</div>';
        return;
    }

    const showScore = canViewStudentScore();
    let html = '';
    for (const [team, students] of Object.entries(teams)) {
        html +=
            '<section class="team-section">' +
                '<div class="team-header">' +
                    '<div class="team-heading">' +
                        '<span class="team-heading-label">Turma</span>' +
                        '<strong class="team-grade-badge">' + escapeHtml(team) + '</strong>' +
                        '<span class="team-student-count">' + students.length + ' ' +
                            (students.length === 1 ? 'aluno' : 'alunos') + '</span>' +
                        (currentTeacherIsPrimary && team !== 'Sem Turma'
                            ? '<button type="button" class="team-add-student-button" data-add-missing-student="' + escapeHtml(team) + '"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Adicionar aluno ausente</button>'
                            : '') +
                    '</div>' +
                    '<button type="button" class="minimize-btn team-toggle" aria-label="Expandir turma" title="Expandir turma" aria-expanded="false">' +
                        '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>' +
                    '</button>' +
                '</div>' +
                '<div class="team-content hidden" style="overflow-x:auto;">' +
                    '<div class="users-table-scroll">' +
                        '<table class="users-table">' +
                            '<thead><tr>' +
                                '<th>Nome</th><th>Username</th>' +
                                (showScore ? '<th>Score</th>' : '') +
                                '<th>Stars</th><th>Hearts</th><th>1º Bimestre</th>' +
                                '<th>2º Bimestre</th><th>3º Bimestre</th><th>4º Bimestre</th>' +
                            '</tr></thead><tbody>' +
                            students.map(student => {
                                const id = String(student.id);
                                const savedGrades = studentGradesById.get(id) || {};
                                const scoreCell = showScore
                                    ? '<td>' + escapeHtml(student.score ?? 0) + '</td>'
                                    : '';

                                return '<tr id="row-' + id + '">' +
                                    '<td>' + escapeHtml(student.name || 'Sem nome') + '</td>' +
                                    '<td>' + escapeHtml(student.username || '-') + '</td>' +
                                    scoreCell +
                                    '<td class="student-stat-cell">' + escapeHtml(student.stars ?? 0) + '</td>' +
                                    '<td class="student-stat-cell">' + escapeHtml(student.hearts ?? 0) + '</td>' +
                                    renderQuarterGradeButton(id, 1, savedGrades) +
                                    renderQuarterGradeButton(id, 2, savedGrades) +
                                    renderQuarterGradeButton(id, 3, savedGrades) +
                                    renderQuarterGradeButton(id, 4, savedGrades) +
                                '</tr>';
                            }).join('') +
                            '</tbody></table>' +
                    '</div>' +
                '</div>' +
            '</section>';
    }

    container.innerHTML = html;
    container.querySelectorAll('.team-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.closest('.team-header')?.nextElementSibling;
            if (!content) return;
            const collapsed = content.classList.toggle('hidden');
            button.setAttribute('aria-expanded', String(!collapsed));
            button.setAttribute('aria-label', collapsed ? 'Expandir turma' : 'Recolher turma');
            button.title = collapsed ? 'Expandir turma' : 'Recolher turma';
            button.innerHTML = '<i class="fa-solid ' + (collapsed ? 'fa-chevron-down' : 'fa-chevron-up') + '" aria-hidden="true"></i>';
        });
    });
}


let pendingMissingStudentGrade = '';

function normalizeStudentUsername(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\\.+|\\.+$/g, '')
        .slice(0, 40);
}

async function makeUniqueStudentUsername(name) {
    const base = normalizeStudentUsername(name) || 'aluno';
    let candidate = base;
    let suffix = 2;

    while (true) {
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq('username', candidate)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return candidate;

        const suffixText = '.' + suffix;
        candidate = base.slice(0, Math.max(1, 40 - suffixText.length)) + suffixText;
        suffix += 1;
    }
}

function setupMissingStudentFeature(container) {
    if (!container || container.dataset.missingStudentEvents === 'true') return;
    container.dataset.missingStudentEvents = 'true';

    let dialog = document.getElementById('missing-student-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'missing-student-dialog';
        dialog.className = 'missing-student-dialog';
        dialog.innerHTML =
            '<form id="missing-student-form" class="missing-student-form">' +
                '<header class="missing-student-header">' +
                    '<span class="missing-student-icon"><i class="fa-solid fa-user-plus" aria-hidden="true"></i></span>' +
                    '<div><small>NOVO CADASTRO</small><h3>Adicionar aluno ausente</h3>' +
                    '<p id="missing-student-grade-label"></p></div>' +
                    '<button type="button" class="missing-student-close" data-close-missing-student aria-label="Fechar">×</button>' +
                '</header>' +
                '<label for="missing-student-name">Nome completo</label>' +
                '<input type="text" id="missing-student-name" minlength="2" maxlength="120" autocomplete="name" required placeholder="Digite o nome do aluno">' +
                '<p class="missing-student-help">O username será criado automaticamente. A senha inicial será <strong>Mudar@eco123</strong>.</p>' +
                '<p id="missing-student-error" class="missing-student-error" role="alert" hidden></p>' +
                '<div class="modal-actions">' +
                    '<button type="button" class="btn-secondary" data-close-missing-student>Cancelar</button>' +
                    '<button type="submit" class="btn-primary" id="missing-student-submit">Adicionar aluno</button>' +
                '</div>' +
            '</form>';
        (document.getElementById('adm-panel') || document.body).appendChild(dialog);
    }

    const form = dialog.querySelector('#missing-student-form');
    if (form && form.dataset.initialized !== 'true') {
        form.dataset.initialized = 'true';
        form.addEventListener('submit', createMissingStudent);
    }

    dialog.addEventListener('click', event => {
        if (event.target === dialog || event.target.closest('[data-close-missing-student]')) {
            dialog.close();
        }
    });

    container.addEventListener('click', event => {
        const addButton = event.target.closest('[data-add-missing-student]');
        if (!addButton) return;
        if (!currentTeacherIsPrimary) {
            alert('Somente o professor administrador pode adicionar alunos.');
            return;
        }

        pendingMissingStudentGrade = String(addButton.dataset.addMissingStudent || '').trim().toUpperCase();
        if (!pendingMissingStudentGrade || pendingMissingStudentGrade === 'SEM TURMA') return;

        const label = document.getElementById('missing-student-grade-label');
        const nameInput = document.getElementById('missing-student-name');
        const error = document.getElementById('missing-student-error');
        const submit = document.getElementById('missing-student-submit');
        if (label) label.textContent = 'Turma ' + pendingMissingStudentGrade;
        if (nameInput) nameInput.value = '';
        if (error) {
            error.hidden = true;
            error.textContent = '';
        }
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'Adicionar aluno';
        }
        dialog.showModal();
        nameInput?.focus();
    });
}

async function createMissingStudent(event) {
    event.preventDefault();
    if (!currentTeacherIsPrimary || !pendingMissingStudentGrade) return;

    const nameInput = document.getElementById('missing-student-name');
    const errorMessage = document.getElementById('missing-student-error');
    const submitButton = document.getElementById('missing-student-submit');
    const name = String(nameInput?.value || '').trim().replace(/\\s+/g, ' ');
    const grade = pendingMissingStudentGrade;

    if (name.length < 2) {
        if (errorMessage) {
            errorMessage.textContent = 'Informe o nome completo do aluno.';
            errorMessage.hidden = false;
        }
        nameInput?.focus();
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Adicionando...';
    }
    if (errorMessage) {
        errorMessage.hidden = true;
        errorMessage.textContent = '';
    }

    try {
        const username = await makeUniqueStudentUsername(name);
        const { data, error } = await supabase
            .from('users')
            .insert([{
                name,
                username,
                psswd: 'Mudar@eco123',
                grade,
                score: 0,
                stars: '0',
                hearts: '3',
                class: null,
                rank: 'Dirt',
                avatar_url: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcS-55RgG38bJTopB10KrZknHMZMf94R5cEbUh8ZqWe8wiBmCyJE'
            }])
            .select('id, name, username, grade, created_at, updated_at')
            .single();

        if (error) throw error;

        document.getElementById('missing-student-dialog')?.close();
        await loadUsers();
        alert(
            'Aluno adicionado à turma ' + grade + '.\\n\\n' +
            'Nome: ' + (data?.name || name) + '\\n' +
            'Username: ' + (data?.username || username) + '\\n' +
            'Senha inicial: Mudar@eco123'
        );
    } catch (error) {
        console.error('Erro ao adicionar aluno ausente:', error);
        if (errorMessage) {
            errorMessage.textContent = 'Não foi possível adicionar o aluno: ' + (error.message || 'erro inesperado');
            errorMessage.hidden = false;
        }
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Adicionar aluno';
        }
    }
}

function setupStudentGradeModal(container) {
    if (!container || container.dataset.gradeModalEvents === 'true') return;
    container.dataset.gradeModalEvents = 'true';

    let dialog = document.getElementById('student-grade-modal');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'student-grade-modal';
        dialog.className = 'student-grade-dialog';
        dialog.innerHTML =
            '<form id="student-grade-form" class="student-grade-form">' +
                '<div class="student-grade-modal-header">' +
                    '<div><span class="student-grade-eyebrow">Registro de avaliação</span>' +
                    '<h3 id="student-grade-title">Nota do bimestre</h3>' +
                    '<p id="student-grade-description"></p></div>' +
                    '<button type="button" class="student-grade-close" data-close-grade-modal aria-label="Fechar">&times;</button>' +
                '</div>' +
                '<div id="student-grade-fields" class="student-grade-fields">' +
                    GRADE_COMPONENTS.map((label, index) =>
                        '<label class="student-grade-field"><span>' + escapeHtml(label) + '</span>' +
                        '<input type="number" step="0.01" inputmode="decimal" id="student-grade-component-' + index + '" placeholder="0,00">' +
                        '</label>'
                    ).join('') +
                '</div>' +
                '<p id="student-grade-error" class="student-grade-error" role="alert" hidden></p>' +
                '<div class="modal-actions student-grade-modal-actions">' +
                    '<button type="button" class="btn-secondary" data-close-grade-modal>Cancelar</button>' +
                    '<button type="submit" class="btn-primary" id="student-grade-save">Salvar nota</button>' +
                '</div>' +
            '</form>';
        (document.getElementById('adm-panel') || document.body).appendChild(dialog);
    }

    const form = dialog.querySelector('#student-grade-form');
    if (form && form.dataset.initialized !== 'true') {
        form.dataset.initialized = 'true';
        form.addEventListener('submit', saveStudentGradeModal);
    }

    dialog.addEventListener('click', event => {
        if (event.target === dialog || event.target.closest('[data-close-grade-modal]')) {
            dialog.close();
        }
    });

    container.addEventListener('click', async event => {
        const quarterButton = event.target.closest('[data-edit-quarter]');
        if (quarterButton) {
            openStudentGradeModal(
                quarterButton.dataset.studentId,
                Number(quarterButton.dataset.editQuarter)
            );
            return;
        }

        const statsButton = event.target.closest('[data-save-stats]');
        if (statsButton) {
            await saveStudentStats(statsButton.dataset.saveStats, statsButton);
        }
    });
}

function openStudentGradeModal(studentId, quarter) {
    const student = studentsById.get(String(studentId));
    if (!student || ![1, 2, 3, 4].includes(quarter)) return;

    const dialog = document.getElementById('student-grade-modal');
    if (!dialog) return;

    activeGradeEditor = {
        studentId: String(studentId),
        quarter,
        subject: activeSubject
    };

    const saved = studentGradesById.get(String(studentId)) || {};
    const values = getGradeComponentValues(saved['nota' + quarter]);

    const title = document.getElementById('student-grade-title');
    const description = document.getElementById('student-grade-description');
    const error = document.getElementById('student-grade-error');
    if (title) title.textContent = 'Nota do ' + quarter + 'º bimestre';
    if (description) description.textContent =
        (student.name || student.username || 'Aluno') + ' · ' + activeSubject;
    if (error) {
        error.hidden = true;
        error.textContent = '';
    }

    values.forEach((value, index) => {
        const input = document.getElementById('student-grade-component-' + index);
        if (input) input.value = value === null ? '' : String(value);
    });

    const saveButton = document.getElementById('student-grade-save');
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = 'Salvar nota';
    }

    if (!dialog.open) dialog.showModal();
}

async function saveStudentGradeModal(event) {
    event.preventDefault();
    if (!activeGradeEditor || !currentTeacherId) return;

    const saveButton = document.getElementById('student-grade-save');
    const errorMessage = document.getElementById('student-grade-error');
    const values = [];

    for (let index = 0; index < GRADE_COMPONENTS.length; index++) {
        const input = document.getElementById('student-grade-component-' + index);
        const raw = String(input?.value || '').trim().replace(',', '.');
        if (!raw) {
            values.push(null);
            continue;
        }

        const number = Number(raw);
        if (!Number.isFinite(number)) {
            if (errorMessage) {
                errorMessage.textContent = 'Confira o valor informado em ' + GRADE_COMPONENTS[index] + '.';
                errorMessage.hidden = false;
            }
            input?.focus();
            return;
        }
        values.push(number);
    }

    const { studentId, quarter, subject } = activeGradeEditor;
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Salvando...';
    }
    if (errorMessage) {
        errorMessage.hidden = true;
        errorMessage.textContent = '';
    }

    try {
        const payload = {
            student_id: Number(studentId),
            subject,
            updated_by: currentTeacherId,
            ['nota' + quarter]: values
        };

        const { data, error } = await supabase
            .from('student_subject_grades')
            .upsert(payload, {
                onConflict: 'student_id,subject,updated_by'
            })
            .select('student_id, subject, nota1, nota2, nota3, nota4, updated_by, updated_at')
            .single();

        if (error) throw error;

        studentGradesById.set(studentId, data);
        const gradeButton = document.querySelector(
            '#row-' + CSS.escape(studentId) + ' [data-edit-quarter="' + quarter + '"]'
        );
        if (gradeButton) {
            const filledCount = getGradeFilledCount(values);
            gradeButton.querySelector('span').textContent = filledCount ? 'Editar nota' : 'Preencher';
            gradeButton.querySelector('small').textContent = filledCount ? filledCount + '/5 itens' : 'Não preenchida';
        }

        document.getElementById('student-grade-modal')?.close();
    } catch (error) {
        console.error('Erro ao salvar nota do aluno:', error);
        if (errorMessage) {
            errorMessage.textContent = 'Não foi possível salvar a nota: ' + (error.message || 'erro inesperado');
            errorMessage.hidden = false;
        }
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Salvar nota';
        }
    }
}

async function saveStudentStats(id, button) {
    const studentId = Number(id);
    if (!Number.isSafeInteger(studentId) || studentId <= 0) return;

    const starsInput = document.getElementById('stars-' + id);
    const heartsInput = document.getElementById('hearts-' + id);
    const stars = Number.parseInt(starsInput?.value || '0', 10);
    const hearts = Number.parseInt(heartsInput?.value || '0', 10);

    if (!Number.isFinite(stars) || !Number.isFinite(hearts)) {
        alert('Confira os valores de Stars e Hearts antes de salvar.');
        return;
    }
    if (button?.disabled) return;

    const originalText = button?.textContent || 'Salvar dados';
    if (button) {
        button.disabled = true;
        button.textContent = 'Salvando...';
    }

    try {
        const { error } = await supabase
            .from('users')
            .update({ stars, hearts })
            .eq('id', studentId);
        if (error) throw error;

        const student = studentsById.get(String(id));
        if (student) {
            student.stars = String(stars);
            student.hearts = String(hearts);
        }

        if (button) {
            button.textContent = 'Salvo!';
            button.classList.add('save-success');
            window.setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('save-success');
            }, 1800);
        }
    } catch (error) {
        console.error('Erro ao salvar os dados do aluno:', error);
        alert('Não foi possível salvar Stars/Hearts: ' + (error.message || 'erro inesperado'));
        if (button) button.textContent = originalText;
    } finally {
        if (button) button.disabled = false;
    }
}

window.saveUser = async id => saveStudentStats(id, document.querySelector('[data-save-stats="' + CSS.escape(String(id)) + '"]'));
