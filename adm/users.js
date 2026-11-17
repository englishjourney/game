import { supabase } from '../supabaseClient.js';

let currentTeacherId = null;
let currentTeacherSubjects = [];
let activeSubject = '';
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
        .select('id, subjects')
        .eq('id', authData.user.id)
        .maybeSingle();

    if (teacherError || !teacher) {
        console.error('Não foi possível identificar o professor do EduPlan:', teacherError);
        container.innerHTML = '<p class="users-load-error">Não foi possível identificar seu cadastro de professor.</p>';
        return;
    }

    currentTeacherId = teacher.id;
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

async function loadUsers() {
    const container = document.getElementById('users-container');
    if (!container || !activeSubject) return;

    const requestId = ++usersLoadSequence;
    container.innerHTML = '<p class="users-loading">Carregando alunos e notas de ' + escapeHtml(activeSubject) + '...</p>';

    const [studentsResult, gradesResult] = await Promise.all([
        supabase
            .from('users')
            .select('id, name, username, score, class, rank, grade, stars, hearts')
            .neq('username', 'micael.svg')
            .order('grade', { ascending: true })
            .order('name', { ascending: true }),
        supabase
            .from('student_subject_grades')
            .select('student_id, subject, nota1, nota2, nota3, nota4')
            .eq('subject', activeSubject)
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

    const gradesByStudent = new Map(
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
                    '</div>' +
                    '<button type="button" class="minimize-btn team-toggle" aria-label="Expandir turma" title="Expandir turma" aria-expanded="false">' +
                        '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>' +
                    '</button>' +
                '</div>' +
                '<div class="team-content hidden" style="overflow-x:auto;">' +
                    '<div class="users-table-scroll">' +
                        '<table class="users-table">' +
                            '<thead><tr>' +
                                '<th>Nome</th><th>Username</th><th>Class/Rank</th><th>Score</th>' +
                                '<th>Stars</th><th>Hearts</th><th>1º Bimestre</th><th>2º Bimestre</th>' +
                                '<th>3º Bimestre</th><th>4º Bimestre</th><th>Ação</th>' +
                            '</tr></thead><tbody>' +
                            students.map(student => {
                                const id = String(student.id);
                                const savedGrades = gradesByStudent.get(id) || {};
                                const gradeInput = (quarter, value) =>
                                    '<td><input type="number" step="0.01" inputmode="decimal" class="editable-input student-quarter-grade" ' +
                                    'id="n' + quarter + '-' + id + '" value="' + (value == null ? '' : escapeHtml(value)) + '" ' +
                                    'aria-label="' + escapeHtml('Nota do ' + quarter + 'º bimestre de ' + (student.name || student.username || 'aluno')) + '"></td>';

                                return '<tr id="row-' + id + '">' +
                                    '<td>' + escapeHtml(student.name || 'Sem nome') + '</td>' +
                                    '<td>' + escapeHtml(student.username || '-') + '</td>' +
                                    '<td>' + escapeHtml(student.class || '-') + '<br><small>' + escapeHtml(student.rank || '-') + '</small></td>' +
                                    '<td>' + escapeHtml(student.score ?? 0) + '</td>' +
                                    '<td><input type="number" step="1" class="editable-input" id="stars-' + id + '" value="' + escapeHtml(student.stars ?? 0) + '" aria-label="Stars de ' + escapeHtml(student.name || 'aluno') + '"></td>' +
                                    '<td><input type="number" step="1" class="editable-input" id="hearts-' + id + '" value="' + escapeHtml(student.hearts ?? 0) + '" aria-label="Hearts de ' + escapeHtml(student.name || 'aluno') + '"></td>' +
                                    gradeInput(1, savedGrades.nota1) +
                                    gradeInput(2, savedGrades.nota2) +
                                    gradeInput(3, savedGrades.nota3) +
                                    gradeInput(4, savedGrades.nota4) +
                                    '<td><button type="button" class="btn-small btn-primary" onclick="window.saveUser(\'' + id + '\')">Salvar</button></td>' +
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

function readGradeInput(studentId, quarter) {
    const input = document.getElementById('n' + quarter + '-' + studentId);
    if (!input) throw new Error('Não foi possível localizar o campo do ' + quarter + 'º bimestre.');

    const raw = input.value.trim().replace(',', '.');
    if (!raw) return null;

    const value = Number(raw);
    if (!Number.isFinite(value)) {
        input.focus();
        throw new Error('Informe uma nota válida no ' + quarter + 'º bimestre.');
    }
    return value;
}

window.saveUser = async id => {
    const studentId = Number(id);
    if (!Number.isSafeInteger(studentId) || studentId <= 0 || !currentTeacherId || !activeSubject) {
        alert('Não foi possível identificar o aluno, professor ou disciplina selecionada.');
        return;
    }

    const row = document.getElementById('row-' + id);
    const button = row?.querySelector('button');
    if (button?.disabled) return;

    let notes;
    try {
        notes = {
            nota1: readGradeInput(id, 1),
            nota2: readGradeInput(id, 2),
            nota3: readGradeInput(id, 3),
            nota4: readGradeInput(id, 4)
        };
    } catch (error) {
        alert(error.message);
        return;
    }

    const starsInput = document.getElementById('stars-' + id);
    const heartsInput = document.getElementById('hearts-' + id);
    const stars = Number.parseInt(starsInput?.value || '0', 10);
    const hearts = Number.parseInt(heartsInput?.value || '0', 10);

    if (!Number.isFinite(stars) || !Number.isFinite(hearts)) {
        alert('Confira os valores de Stars e Hearts antes de salvar.');
        return;
    }

    const originalText = button?.textContent || 'Salvar';
    if (button) {
        button.disabled = true;
        button.textContent = 'Salvando...';
    }

    try {
        const { error: gradesError } = await supabase
            .from('student_subject_grades')
            .upsert({
                student_id: studentId,
                subject: activeSubject,
                ...notes
            }, { onConflict: 'student_id,subject' });

        if (gradesError) throw gradesError;

        const { error: studentError } = await supabase
            .from('users')
            .update({ stars, hearts })
            .eq('id', studentId);

        if (studentError) {
            throw new Error('As notas foram salvas, mas não foi possível atualizar Stars/Hearts: ' + studentError.message);
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
        console.error('Erro ao salvar notas do aluno:', error);
        alert('Não foi possível salvar as notas de ' + activeSubject + ': ' + (error.message || 'erro inesperado'));
        if (button) button.textContent = originalText;
    } finally {
        if (button) button.disabled = false;
    }
};
