import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase Edge Function environment variables.");
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const PAGE_SIZE = 20;
const encoder = new TextEncoder();

class DiscussError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const text = String(value ?? "").trim();
  if (!text) throw new DiscussError("Preencha " + label + ".");
  if (text.length > maxLength) {
    throw new DiscussError(label + " deve ter no máximo " + maxLength + " caracteres.");
  }
  return text;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getUserBySession(token: string) {
  if (!token || token.length < 32 || token.length > 256) {
    throw new DiscussError("Sua sessão não é válida. Entre novamente no EnglishJourney.", 401);
  }

  const tokenHash = await sha256(token);
  const { data: session, error: sessionError } = await db
    .from("tcs_sessions")
    .select("user_id, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session) {
    throw new DiscussError("Sua sessão expirou. Saia e entre novamente no EnglishJourney.", 401);
  }

  const { data: user, error: userError } = await db
    .from("users")
    .select("id, username, name, avatar_url, grade")
    .eq("id", session.user_id)
    .maybeSingle();

  if (userError) throw userError;
  if (!user) throw new DiscussError("Não foi possível localizar sua conta.", 401);
  return user;
}

function validateImageUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > 2048) throw new DiscussError("O link da imagem é muito longo.");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DiscussError("Insira um endereço de imagem válido.");
  }

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname ||
      parsed.username || parsed.password) {
    throw new DiscussError("O link da imagem deve começar com http:// ou https://.");
  }
  return parsed.toString();
}

function normalizeGrade(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\\s+/g, "");
}

function isForumAdmin(user: Record<string, unknown>) {
  return String(user.username || "").trim().toLowerCase() === "micael.svg";
}

async function listPosts(
  offsetValue: unknown,
  user: Record<string, unknown>,
  gradeFilterValue: unknown,
) {
  const rawOffset = Number(offsetValue ?? 0);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.min(1000, Math.floor(rawOffset))) : 0;
  const admin = isForumAdmin(user);
  const requestedGrade = normalizeGrade(gradeFilterValue);
  const ownGrade = normalizeGrade(user.grade);

  let query = db
    .from("discuss_posts")
    .select("id, created_at, title, content, image_url, author_username, author_name, avatar_url, author_grade");

  // Somente a conta administrativa pode consultar todas as turmas ou escolher outra.
  if (admin) {
    if (requestedGrade) query = query.eq("author_grade", requestedGrade);
  } else {
    // Conta sem grade não recebe publicações de outras turmas por padrão.
    if (!ownGrade) {
      return { posts: [], hasMore: false, nextOffset: offset };
    }
    query = query.eq("author_grade", ownGrade);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) throw error;
  const posts = data || [];
  return { posts, hasMore: posts.length === PAGE_SIZE, nextOffset: offset + posts.length };
}

async function listGrades(user: Record<string, unknown>) {
  if (!isForumAdmin(user)) {
    throw new DiscussError("Você não tem permissão para consultar os filtros do fórum.", 403);
  }

  const { data, error } = await db
    .from("users")
    .select("grade")
    .not("grade", "is", null)
    .order("grade", { ascending: true });

  if (error) throw error;
  const grades = Array.from(new Set((data || [])
    .map((item: { grade: string | null }) => normalizeGrade(item.grade))
    .filter(Boolean)));
  return { grades };
}

async function createPost(body: Record<string, unknown>, user: Record<string, unknown>) {
  const title = requiredText(body.title, "o título", 120);
  const content = requiredText(body.content, "o texto da publicação", 6000);
  const imageUrl = validateImageUrl(body.imageUrl);

  const { data: post, error } = await db
    .from("discuss_posts")
    .insert({
      title,
      content,
      image_url: imageUrl,
      author_username: String(user.username),
      author_name: String(user.name || user.username),
      avatar_url: user.avatar_url ? String(user.avatar_url) : null,
      author_grade: normalizeGrade(user.grade) || null,
    })
    .select("id, created_at, title, content, image_url, author_username, author_name, avatar_url, author_grade")
    .single();

  if (error) throw error;
  return { post };
}

async function getOwnedPost(postIdValue: unknown, username: string) {
  const postId = Number(postIdValue);
  if (!Number.isSafeInteger(postId) || postId <= 0) {
    throw new DiscussError("Publicação inválida.");
  }

  const { data, error } = await db.from("discuss_posts")
    .select("id, author_username")
    .eq("id", postId)
    .eq("author_username", username)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new DiscussError("Publicação não encontrada ou você não tem permissão para alterá-la.", 404);
  return postId;
}

async function updatePost(body: Record<string, unknown>, user: Record<string, unknown>) {
  const username = String(user.username);
  const postId = await getOwnedPost(body.postId, username);
  const title = requiredText(body.title, "o título", 120);
  const content = requiredText(body.content, "o texto da publicação", 6000);
  const imageUrl = validateImageUrl(body.imageUrl);

  const { data, error } = await db.from("discuss_posts")
    .update({ title, content, image_url: imageUrl })
    .eq("id", postId)
    .eq("author_username", username)
    .select("id, created_at, title, content, image_url, author_username, author_name, avatar_url")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new DiscussError("Não foi possível atualizar esta publicação.", 404);
  return { post: data };
}

async function deletePost(body: Record<string, unknown>, user: Record<string, unknown>) {
  const username = String(user.username);
  const postId = await getOwnedPost(body.postId, username);
  const { data, error } = await db.from("discuss_posts")
    .delete()
    .eq("id", postId)
    .eq("author_username", username)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new DiscussError("Não foi possível excluir esta publicação.", 404);
  return { deleted: true, postId };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Use uma requisição POST." }, 405);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12000) return json({ error: "A publicação excede o tamanho permitido." }, 413);

  try {
    const body = await request.json();
    const action = String(body.action || "");
    const user = await getUserBySession(String(body.sessionToken || ""));

    if (action === "list_posts") {
      return json({ data: await listPosts(body.offset, user, body.grade) });
    }
    if (action === "list_grades") {
      return json({ data: await listGrades(user) });
    }
    if (action === "create_post") {
      return json({ data: await createPost(body, user) }, 201);
    }
    if (action === "update_post") {
      return json({ data: await updatePost(body, user) });
    }
    if (action === "delete_post") {
      return json({ data: await deletePost(body, user) });
    }
    throw new DiscussError("Ação não reconhecida.");
  } catch (error) {
    const status = error instanceof DiscussError ? error.status : 500;
    const message = error instanceof DiscussError
      ? error.message
      : "Não foi possível concluir a solicitação. Tente novamente.";
    if (!(error instanceof DiscussError)) console.error("Discuss request failed:", error);
    return json({ error: message }, status);
  }
});
