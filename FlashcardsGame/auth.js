// auth.js
export async function checkUserExists(supabase, username) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error || !data) return null;
    return data;
}

export async function checkActiveSession(supabase, username) {
    // Verifica se o usuário já está em uma sala ativa
    const { data, error } = await supabase
        .from('flashcardsGame')
        .select('*')
        .contains('players', [username])
        .single();
    
    if (data) return data; // Retorna a sala
    return null;
}
