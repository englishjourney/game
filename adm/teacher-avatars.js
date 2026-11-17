export const TEACHER_AVATARS = Object.freeze([
    { key: 'english', subject: 'Inglês', file: 'english.jpeg', icon: 'fa-language', background: '#dbeafe' },
    { key: 'portuguese', subject: 'Português', file: 'portuguese.jpeg', icon: 'fa-book-open', background: '#fce7f3' },
    { key: 'math', subject: 'Matemática', file: 'math.jpeg', icon: 'fa-calculator', background: '#ede9fe' },
    { key: 'text', subject: 'Produção textual', file: 'text.jpeg', icon: 'fa-pen-nib', background: '#ffedd5' },
    { key: 'science', subject: 'Ciências', file: 'science.jpeg', icon: 'fa-flask', background: '#dcfce7' },
    { key: 'biology', subject: 'Biologia', file: 'biology.jpeg', icon: 'fa-dna', background: '#d1fae5' },
    { key: 'chemistry', subject: 'Química', file: 'chemistry.jpeg', icon: 'fa-atom', background: '#fef3c7' },
    { key: 'physics', subject: 'Física', file: 'physics.jpeg', icon: 'fa-magnet', background: '#e0f2fe' },
    { key: 'history', subject: 'História', file: 'history.jpeg', icon: 'fa-landmark', background: '#fef2f2' },
    { key: 'geography', subject: 'Geografia', file: 'geography.jpeg', icon: 'fa-earth-americas', background: '#e0e7ff' },
    { key: 'digital', subject: 'Educação digital', file: 'digital.jpeg', icon: 'fa-laptop-code', background: '#cffafe' },
    { key: 'art', subject: 'Artes', file: 'art.jpeg', icon: 'fa-palette', background: '#fce7f3' },
    { key: 'philosophy', subject: 'Filosofia', file: 'philosophy.jpeg', icon: 'fa-brain', background: '#ede9fe' },
    { key: 'sociology', subject: 'Sociologia', file: 'sociology.jpeg', icon: 'fa-people-group', background: '#ffedd5' },
    { key: 'physical', subject: 'Educação Física', file: 'physical.jpeg', icon: 'fa-person-running', background: '#dcfce7' },
    // Projeto de Vida já existe no cadastro de disciplinas, mas ainda não há imagem específica.
    { key: 'project-life', subject: 'Projeto de vida', file: null, icon: 'fa-compass', background: '#fef3c7' }
]);

export const DEFAULT_TEACHER_AVATAR = Object.freeze({
    key: 'violet-book',
    subject: 'Avatar padrão',
    file: null,
    icon: 'fa-book-open',
    background: '#e6d9ff'
});

function normalizeSubject(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('pt-BR');
}

export function getTeacherAvatarOptions(subjects) {
    if (!Array.isArray(subjects) || subjects.length === 0) return [];

    const bySubject = new Map(
        TEACHER_AVATARS.map(option => [normalizeSubject(option.subject), option])
    );
    const seen = new Set();

    const options = subjects
        .map(subject => bySubject.get(normalizeSubject(subject)))
        .filter(option => {
            if (!option || seen.has(option.key)) return false;
            seen.add(option.key);
            return true;
        });

    return options.length ? options : [DEFAULT_TEACHER_AVATAR];
}

export function getTeacherAvatar(key) {
    return TEACHER_AVATARS.find(option => option.key === key) || DEFAULT_TEACHER_AVATAR;
}

export function getDefaultTeacherAvatarKey(subjects) {
    return getTeacherAvatarOptions(subjects)[0]?.key || DEFAULT_TEACHER_AVATAR.key;
}
