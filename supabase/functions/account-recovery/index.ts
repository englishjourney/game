import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing server configuration.");

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const encoder = new TextEncoder();
const QUESTIONS = new Set([1, 2, 3, 4]);
const QUESTION_LIMIT = 8;
const WINDOW_MS = 15 * 60 * 1000;

class RecoveryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function normalizeAnswer(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function cleanUsername(value: unknown) {
  const username = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,40}$/.test(username)) {
    throw new RecoveryError("Informe um nome de usuário válido.");
  }
  return username;
}

function validatePassword(value: unknown) {
  const password = String(value ?? "");
  if (password.length > 128 || !/^(?=.*[a-zA-Z])(?=.*\d)[\x21-\x7E]+$/.test(password)) {
    throw new RecoveryError("A senha deve conter letras e números, sem espaços ou emojis.");
  }
  return password;
}

function randomHex(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexBytes(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) || []);
}

async function hashAnswer(answer: string, salt: string) {
  const normalized = normalizeAnswer(answer);
  const key = await crypto.subtle.importKey("raw", encoder.encode(normalized), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: hexBytes(salt),
    iterations: 120000,
    hash: "SHA-256",
  }, key, 256);
  return Array.from(new Uint8Array(bits)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function getUserBySession(token: string) {
  if (!token || token.length < 32 || token.length > 256) {
    throw new RecoveryError("Sua sessão não é válida. Entre novamente no EnglishJourney.", 401);
  }

  const tokenHash = await sha256(token);
  const { data: authSession, error: sessionError } = await db.from("tcs_sessions")
    .select("user_id")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!authSession) throw new RecoveryError("Sua sessão expirou. Entre novamente no EnglishJourney.", 401);

  const { data: user, error } = await db.from("users")
    .select("id, username")
    .eq("id", authSession.user_id)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw new RecoveryError("Conta não encontrada.", 401);
  return user;
}

async function enforceRecoveryLimit(username: string) {
  const identifierHash = await sha256("recovery:" + username);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db.from("account_recovery_attempts").delete().lt("created_at", dayAgo);

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await db.from("account_recovery_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier_hash", identifierHash)
    .gte("created_at", since);
  if (error) throw error;
  if ((count || 0) >= QUESTION_LIMIT) {
    throw new RecoveryError("Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.", 429);
  }

  const { error: insertError } = await db.from("account_recovery_attempts").insert({ identifier_hash: identifierHash });
  if (insertError) throw insertError;
  return identifierHash;
}

async function getSecurityStatus(userId: number) {
  const { data, error } = await db.from("account_security_answers")
    .select("question_id")
    .eq("user_id", userId)
    .order("question_id", { ascending: true });
  if (error) throw error;
  const questionIds = (data || []).map((row: any) => Number(row.question_id));
  return { configured: questionIds.length >= 2, questionIds };
}

async function saveSecurityAnswers(body: Record<string, unknown>, user: Record<string, unknown>) {
  const answers = Array.isArray(body.answers) ? body.answers as Array<Record<string, unknown>> : [];
  if (answers.length < 2 || answers.length > 4) {
    throw new RecoveryError("Escolha pelo menos duas perguntas e responda todas.");
  }

  const seen = new Set<number>();
  const rows = await Promise.all(answers.map(async (item) => {
    const questionId = Number(item.questionId);
    if (!QUESTIONS.has(questionId) || seen.has(questionId)) {
      throw new RecoveryError("As perguntas selecionadas são inválidas.");
    }
    seen.add(questionId);
    const answer = String(item.answer ?? "").trim();
    const normalized = normalizeAnswer(answer);
    if (normalized.length < 2 || normalized.length > 160) {
      throw new RecoveryError("Cada resposta deve ter entre 2 e 160 caracteres.");
    }
    const salt = randomHex(16);
    return {
      user_id: user.id,
      question_id: questionId,
      answer_salt: salt,
      answer_hash: await hashAnswer(answer, salt),
    };
  }));

  const { error: deleteError } = await db.from("account_security_answers").delete().eq("user_id", user.id);
  if (deleteError) throw deleteError;
  const { error: insertError } = await db.from("account_security_answers").insert(rows);
  if (insertError) throw insertError;
  return { configured: true, questionIds: [...seen].sort((a, b) => a - b) };
}

async function beginRecovery(username: string) {
  await enforceRecoveryLimit(username);
  const { data: user, error } = await db.from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  if (!user) return { configured: false, questionIds: [] };

  return await getSecurityStatus(user.id);
}

async function resetPassword(body: Record<string, unknown>, username: string) {
  await enforceRecoveryLimit(username);
  const password = validatePassword(body.newPassword);
  const submitted = Array.isArray(body.answers) ? body.answers as Array<Record<string, unknown>> : [];

  const { data: user, error: userError } = await db.from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) throw new RecoveryError("Não foi possível confirmar a conta e as respostas informadas.");

  const { data: stored, error } = await db.from("account_security_answers")
    .select("question_id, answer_salt, answer_hash")
    .eq("user_id", user.id)
    .order("question_id", { ascending: true });
  if (error) throw error;
  if (!stored || stored.length < 2 || submitted.length !== stored.length) {
    throw new RecoveryError("Não foi possível confirmar a conta e as respostas informadas.");
  }

  const submittedById = new Map<number, string>();
  for (const item of submitted) {
    const qid = Number(item.questionId);
    if (!QUESTIONS.has(qid) || submittedById.has(qid)) {
      throw new RecoveryError("Não foi possível confirmar a conta e as respostas informadas.");
    }
    submittedById.set(qid, String(item.answer ?? ""));
  }

  let valid = submittedById.size === stored.length;
  for (const row of stored) {
    const answer = submittedById.get(Number(row.question_id));
    if (answer === undefined) {
      valid = false;
      continue;
    }
    const candidate = await hashAnswer(answer, row.answer_salt);
    if (!constantTimeEqual(candidate, row.answer_hash)) valid = false;
  }

  if (!valid) {
    throw new RecoveryError("Uma ou mais respostas estão incorretas. Confira e tente novamente.", 403);
  }

  const { error: updateError } = await db.from("users")
    .update({ psswd: password })
    .eq("id", user.id);
  if (updateError) throw updateError;

  // A recuperação encerra sessões anteriores para que a nova senha passe a valer.
  const { error: revokeError } = await db.from("tcs_sessions").delete().eq("user_id", user.id);
  if (revokeError) console.error("Could not revoke old account sessions:", revokeError);

  return { success: true };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Use uma requisição POST." }, 405);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12000) return json({ error: "Solicitação muito grande." }, 413);

  try {
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "begin_recovery") {
      const username = cleanUsername(body.username);
      return json({ data: await beginRecovery(username) });
    }

    if (action === "reset_password") {
      const username = cleanUsername(body.username);
      return json({ data: await resetPassword(body, username) });
    }

    const user = await getUserBySession(String(body.sessionToken || ""));
    if (action === "get_security_status") {
      return json({ data: await getSecurityStatus(user.id) });
    }
    if (action === "save_security_answers") {
      return json({ data: await saveSecurityAnswers(body, user) });
    }

    throw new RecoveryError("Ação não reconhecida.");
  } catch (error) {
    const status = error instanceof RecoveryError ? error.status : 500;
    const message = error instanceof RecoveryError
      ? error.message
      : "Não foi possível concluir a solicitação. Tente novamente.";
    if (!(error instanceof RecoveryError)) console.error("Account recovery request failed:", error);
    return json({ error: message }, status);
  }
});
