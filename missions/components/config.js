// Configuração compartilhada de todas as missões EnglishJourney.
import { supabase } from "../../supabaseClient.js";
import { getSession, saveSession, clearSession } from "../../auth.js";

export function getCachedMissionSession() {
    try {
        const session = getSession();
        return session && session.username ? session : null;
    } catch (error) {
        console.warn("Sessão local inválida. Será necessário entrar novamente.", error);
        clearSession();
        return null;
    }
}

// Mantém o mesmo padrão de autenticação já utilizado no EnglishJourney.
// A sessão salva contém apenas os dados públicos do aluno, nunca a senha.
export async function loginMissionUser(username, password) {
    const normalizedUsername = String(username || "").trim();
    if (!normalizedUsername || !password) {
        return { session: null, error: "Informe usuário e senha." };
    }

    const { data, error } = await supabase
        .from("users")
        .select("username, grade, name, avatar_url")
        .eq("username", normalizedUsername)
        .eq("psswd", password)
        .maybeSingle();

    if (error) {
        console.error("Erro ao autenticar aluno:", error);
        return { session: null, error: "Não foi possível validar o login. Tente novamente." };
    }

    if (!data) {
        return { session: null, error: "Usuário ou senha incorretos." };
    }

    const session = {
        username: data.username,
        grade: data.grade,
        name: data.name,
        avatar_url: data.avatar_url,
        tcsSessionToken: null
    };

    saveSession(session);
    return { session, error: null };
}

export function usernameIsInList(value, username) {
    const target = String(username || "").trim().toLowerCase();
    if (!target) return false;

    const values = Array.isArray(value)
        ? value.map(item => String(item).trim().toLowerCase())
        : String(value || "").split(",").map(item => item.trim().toLowerCase());

    return values.includes(target);
}

function parseMissionScore(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// Busca o limite de pontuação do jogo e o histórico de conclusão/tentativa.
export async function loadMissionSettings(missionName, username = "") {
    const { data, error } = await supabase
        .from("missions")
        .select("mission_score, done, fail")
        .eq("mission_name", missionName)
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        return {
            registered: false,
            missionScore: null,
            alreadyAttempted: false,
            completed: false,
            failed: false
        };
    }

    const completed = usernameIsInList(data.done, username);
    const failed = usernameIsInList(data.fail, username);

    return {
        registered: true,
        missionScore: parseMissionScore(data.mission_score),
        alreadyAttempted: completed || failed,
        completed,
        failed
    };
}

// O banco registra o resultado e concede a estrela na mesma transação.
// A função SQL bloqueia a linha da missão, impedindo recompensas duplicadas
// mesmo quando o aluno envia duas conclusões quase simultaneamente.
export async function recordMissionResult(missionName, username, result) {
    if (result !== "done" && result !== "fail") {
        throw new Error("Resultado de missão inválido.");
    }

    const { data, error } = await supabase.rpc("record_mission_result", {
        p_mission_name: String(missionName || "").trim(),
        p_username: String(username || "").trim(),
        p_result: result
    });

    if (error) {
        console.error("Erro ao registrar o resultado da missão:", error);
        throw new Error("Não foi possível registrar o resultado da missão. Tente novamente.");
    }

    return data || { recorded: false, reason: "empty-response", earnedStars: 0 };
}
