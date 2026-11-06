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

// Busca a pontuação da linha cujo mission_name corresponde exatamente à missão.
export async function loadMissionSettings(missionName, username = "") {
    const { data, error } = await supabase
        .from("missions")
        .select("id, mission_score, done, fail")
        .eq("mission_name", missionName)
        .order("id", { ascending: true })
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

// Registra somente em uma linha já existente. Esta função nunca cria uma missão.
export async function recordMissionResult(missionName, username, result) {
    if (result !== "done" && result !== "fail") {
        throw new Error("Resultado de missão inválido.");
    }

    const { data: mission, error: missionError } = await supabase
        .from("missions")
        .select("id, mission_score, done, fail")
        .eq("mission_name", missionName)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (missionError) throw missionError;

    if (!mission) {
        return { recorded: false, reason: "mission-not-registered", earnedPoints: 0 };
    }

    if (
        usernameIsInList(mission.done, username) ||
        usernameIsInList(mission.fail, username)
    ) {
        return { recorded: false, reason: "already-attempted", earnedPoints: 0 };
    }

    const points = parseMissionScore(mission.mission_score);
    if (result === "done" && points === null) {
        return { recorded: false, reason: "score-not-configured", earnedPoints: 0 };
    }

    const currentColumn = String(mission[result] || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

    currentColumn.push(String(username).trim());

    const { error: recordError } = await supabase
        .from("missions")
        .update({ [result]: currentColumn.join(",") })
        .eq("id", mission.id);

    if (recordError) throw recordError;

    if (result === "fail") {
        return { recorded: true, earnedPoints: 0 };
    }

    // Mantém o mesmo modelo usado pelos jogos atuais: users.score é atualizado
    // após a primeira conclusão registrada em missions.done.
    const { data: userData, error: userError } = await supabase
        .from("users")
        .select("score")
        .eq("username", username)
        .maybeSingle();

    if (userError) {
        throw new Error("A missão foi registrada, mas não foi possível consultar a pontuação do aluno.");
    }

    if (!userData) {
        throw new Error("A missão foi registrada, mas o usuário não foi encontrado para receber os pontos.");
    }

    const currentScore = Number(userData.score || 0);
    const safeCurrentScore = Number.isFinite(currentScore) ? currentScore : 0;
    const newScore = safeCurrentScore + points;

    const { error: scoreError } = await supabase
        .from("users")
        .update({ score: String(newScore) })
        .eq("username", username);

    if (scoreError) {
        throw new Error("A missão foi registrada, mas houve um erro ao atualizar os pontos do aluno.");
    }

    return { recorded: true, earnedPoints: points, newScore };
}
