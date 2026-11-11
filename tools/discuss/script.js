import { getSession, clearSession } from "../../auth.js";
import { supabase } from "../../supabaseClient.js";

const PAGE_SIZE = 20;
const LIKE_INTERVAL_MS = 5 * 60 * 60 * 1000;

const elements = {
  authRequired: document.getElementById("auth-required"),
  authTitle: document.getElementById("auth-title"),
  authMessage: document.getElementById("auth-message"),
  authLink: document.getElementById("auth-link"),
  renewSession: document.getElementById("renew-session"),
  forumContent: document.getElementById("forum-content"),
  currentUserAvatar: document.getElementById("current-user-avatar"),
  currentUserName: document.getElementById("current-user-name"),
  currentUserHandle: document.getElementById("current-user-handle"),
  postForm: document.getElementById("post-form"),
  postTitle: document.getElementById("post-title"),
  postContent: document.getElementById("post-content"),
  charCount: document.getElementById("char-count"),
  imageToggle: document.getElementById("image-toggle"),
  imageFields: document.getElementById("image-fields"),
  imageUrl: document.getElementById("image-url"),
  imagePreviewWrap: document.getElementById("image-preview-wrap"),
  imagePreview: document.getElementById("image-preview"),
  previewToggle: document.getElementById("preview-toggle"),
  postPreview: document.getElementById("post-preview"),
  previewContent: document.getElementById("preview-content"),
  submitPost: document.getElementById("submit-post"),
  refreshFeed: document.getElementById("refresh-feed"),
  feedList: document.getElementById("feed-list"),
  loadMore: document.getElementById("load-more"),
  toast: document.getElementById("toast"),
};

let session = null;
let posts = [];
let nextOffset = 0;
let hasMore = false;
let toastTimer = null;

function readSession() {
  try {
    return getSession();
  } catch (error) {
    console.warn("Não foi possível ler a sessão local:", error);
    return null;
  }
}

function showAuthNotice({ title, message, needsRenew = false }) {
  elements.forumContent.classList.add("hidden");
  elements.authRequired.classList.remove("hidden");
  elements.authTitle.textContent = title;
  elements.authMessage.textContent = message;
  elements.renewSession.classList.toggle("hidden", !needsRenew);
}

function showToast(message, type = "default") {
  elements.toast.textContent = message;
  elements.toast.className = "toast visible" + (type === "error" ? " error" : type === "success" ? " success" : "");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.className = "toast";
  }, 3200);
}

function initials(name) {
  const parts = String(name || "U").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

function safeHttpUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname ||
        parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function createAvatar(name, avatarUrl, sizeClass = "avatar-small") {
  const avatar = document.createElement("div");
  avatar.className = "avatar " + sizeClass;
  avatar.textContent = initials(name);

  const safeUrl = safeHttpUrl(avatarUrl);
  if (safeUrl) {
    const image = document.createElement("img");
    image.src = safeUrl;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    avatar.appendChild(image);
  }
  return avatar;
}

function setCurrentUser() {
  const displayName = session.name || session.username || "Estudante";
  elements.currentUserAvatar.replaceWith(
    createAvatar(displayName, session.avatar_url, "avatar-large")
  );
  elements.currentUserAvatar = document.querySelector(".current-user .avatar");
  elements.currentUserName.textContent = displayName;
  elements.currentUserHandle.textContent = "@" + session.username;
}

async function invokeForum(payload) {
  const { data, error } = await supabase.functions.invoke("discuss", {
    body: {
      ...payload,
      sessionToken: session?.tcsSessionToken || "",
    },
  });

  if (error) {
    let message = error.message || "Não foi possível acessar o fórum.";
    const response = error.context;
    if (response && typeof response.clone === "function") {
      try {
        const details = await response.clone().json();
        if (details?.error) message = details.error;
      } catch {
        // Mantém a mensagem original quando a resposta não é JSON.
      }
    }
    const requestError = new Error(message);
    requestError.status = response?.status || 0;
    throw requestError;
  }

  if (data?.error) throw new Error(data.error);
  return data?.data ?? data;
}

function addPlainText(container, value) {
  const lines = String(value).split("\n");
  lines.forEach((line, index) => {
    if (index > 0) container.appendChild(document.createElement("br"));
    if (line) container.appendChild(document.createTextNode(line));
  });
}

function appendLink(container, value) {
  const trailingMatch = value.match(/[.,!?;:)}\]]+$/);
  const trailing = trailingMatch ? trailingMatch[0] : "";
  const address = trailing ? value.slice(0, -trailing.length) : value;
  const safeUrl = safeHttpUrl(address);

  if (safeUrl) {
    const link = document.createElement("a");
    link.href = safeUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer nofollow";
    link.textContent = address;
    container.appendChild(link);
  } else {
    container.appendChild(document.createTextNode(address));
  }

  if (trailing) container.appendChild(document.createTextNode(trailing));
}

function createFormattedContent(rawText) {
  const container = document.createElement("div");
  container.className = "rich-content";
  const text = String(rawText || "");
  const tokenPattern = /(\*[^*\n]+\*|_[^_\n]+?_|'''[^'\n]+?'''|https?:\/\/[^\s<>"']+)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) addPlainText(container, text.slice(lastIndex, index));

    if (/^\*[^*]+\*$/.test(value)) {
      const strong = document.createElement("strong");
      strong.textContent = value.slice(1, -1);
      container.appendChild(strong);
    } else if (/^_[^_]+_$/.test(value)) {
      const italic = document.createElement("em");
      italic.textContent = value.slice(1, -1);
      container.appendChild(italic);
    } else if (value.startsWith("'''") && value.endsWith("'''") && value.length > 6) {
      const underline = document.createElement("u");
      underline.textContent = value.slice(3, -3);
      container.appendChild(underline);
    } else if (/^https?:\/\//i.test(value)) {
      appendLink(container, value);
    } else {
      addPlainText(container, value);
    }

    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) addPlainText(container, text.slice(lastIndex));
  return container;
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(date);
}

function simulatedLikes(createdAt) {
  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) return 0;
  return Math.max(0, Math.floor((Date.now() - createdTime) / LIKE_INTERVAL_MS));
}

function createPostCard(post) {
  const card = document.createElement("article");
  card.className = "post-card";
  card.setAttribute("aria-label", "Publicação: " + post.title);

  const header = document.createElement("div");
  header.className = "post-author";
  header.appendChild(createAvatar(post.author_name || post.author_username, post.avatar_url));

  const authorMeta = document.createElement("div");
  authorMeta.className = "post-author-meta";
  const authorName = document.createElement("span");
  authorName.className = "post-author-name";
  authorName.textContent = post.author_name || post.author_username || "Estudante";
  const username = document.createElement("span");
  username.className = "post-author-handle";
  username.textContent = "@" + (post.author_username || "usuario");
  authorMeta.append(authorName, username);
  header.appendChild(authorMeta);

  const time = document.createElement("time");
  time.className = "post-time";
  time.dateTime = post.created_at;
  time.textContent = formatDate(post.created_at);
  header.appendChild(time);
  card.appendChild(header);

  const title = document.createElement("h3");
  title.textContent = post.title || "Publicação sem título";
  card.appendChild(title);

  card.appendChild(createFormattedContent(post.content));

  const imageUrl = safeHttpUrl(post.image_url);
  if (imageUrl) {
    const imageWrap = document.createElement("div");
    imageWrap.className = "post-image-wrap";
    const image = document.createElement("img");
    image.className = "post-image";
    image.src = imageUrl;
    image.alt = "Imagem compartilhada por " + (post.author_name || post.author_username || "um estudante");
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      const note = document.createElement("span");
      note.className = "broken-image-note";
      note.textContent = "Não foi possível carregar a imagem deste endereço.";
      image.replaceWith(note);
    }, { once: true });
    imageWrap.appendChild(image);
    card.appendChild(imageWrap);
  }

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const likes = document.createElement("span");
  likes.className = "post-action likes";
  likes.innerHTML = '<i class="fa-solid fa-heart" aria-hidden="true"></i><span class="like-count"></span><span>curtidas simuladas</span>';
  likes.dataset.createdAt = post.created_at;
  likes.querySelector(".like-count").textContent = String(simulatedLikes(post.created_at));

  const comments = document.createElement("span");
  comments.className = "post-action comments";
  comments.innerHTML = '<i class="fa-solid fa-comment-slash" aria-hidden="true"></i><span>Comentários desativados</span>';

  actions.append(likes, comments);
  card.appendChild(actions);
  return card;
}

function renderPosts() {
  elements.feedList.replaceChildren();

  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("i");
    icon.className = "fa-regular fa-comments";
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("h3");
    title.textContent = "Ainda não há publicações";
    const message = document.createElement("p");
    message.textContent = "Seja a primeira pessoa a compartilhar um trabalho com a comunidade.";
    empty.append(icon, title, message);
    elements.feedList.appendChild(empty);
  } else {
    posts.forEach((post) => elements.feedList.appendChild(createPostCard(post)));
  }

  elements.loadMore.classList.toggle("hidden", !hasMore);
}

function updateLikeCounters() {
  document.querySelectorAll(".post-action.likes").forEach((likes) => {
    likes.querySelector(".like-count").textContent = String(simulatedLikes(likes.dataset.createdAt));
  });
}

async function loadPosts(reset = false) {
  if (!session?.tcsSessionToken) return;
  if (reset) {
    nextOffset = 0;
    hasMore = false;
    posts = [];
    elements.feedList.setAttribute("aria-busy", "true");
    const loading = document.createElement("div");
    loading.className = "loading-card";
    loading.innerHTML = '<span class="spinner"></span><span>Carregando publicações...</span>';
    elements.feedList.replaceChildren(loading);
  }

  elements.refreshFeed.disabled = true;
  elements.loadMore.disabled = true;

  try {
    const result = await invokeForum({ action: "list_posts", offset: nextOffset });
    const received = Array.isArray(result?.posts) ? result.posts : [];
    posts = reset ? received : posts.concat(received);
    nextOffset = Number(result?.nextOffset ?? (nextOffset + received.length));
    hasMore = Boolean(result?.hasMore);
    renderPosts();
  } catch (error) {
    console.error("Erro ao carregar o fórum:", error);
    if (error.status === 401 || /sessão|entre novamente|expirou/i.test(error.message)) {
      showAuthNotice({
        title: "Sua sessão precisa ser renovada",
        message: error.message || "Entre novamente no EnglishJourney para continuar usando o fórum.",
        needsRenew: true,
      });
    } else {
      showToast(error.message || "Não foi possível carregar as publicações.", "error");
      if (reset) {
        elements.feedList.replaceChildren();
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Não foi possível carregar o fórum. Tente atualizar a página.";
        elements.feedList.appendChild(empty);
      }
    }
  } finally {
    elements.feedList.setAttribute("aria-busy", "false");
    elements.refreshFeed.disabled = false;
    elements.loadMore.disabled = false;
  }
}

function updatePreview() {
  elements.charCount.textContent = elements.postContent.value.length + "/6000";
  elements.previewContent.replaceChildren();
  if (elements.postContent.value.trim()) {
    elements.previewContent.appendChild(createFormattedContent(elements.postContent.value));
  } else {
    const hint = document.createElement("span");
    hint.textContent = "Sua prévia aparecerá aqui enquanto você escreve.";
    elements.previewContent.appendChild(hint);
  }
}

function wrapSelectedText(marker) {
  const field = elements.postContent;
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const selected = field.value.slice(start, end) || "texto";
  const replacement = marker + selected + marker;
  field.setRangeText(replacement, start, end, "select");
  const innerStart = start + marker.length;
  field.setSelectionRange(innerStart, innerStart + selected.length);
  field.focus();
  updatePreview();
}

function toggleImageFields(forceOpen) {
  const open = typeof forceOpen === "boolean"
    ? forceOpen
    : elements.imageFields.classList.contains("hidden");
  elements.imageFields.classList.toggle("hidden", !open);
  elements.imageToggle.setAttribute("aria-expanded", String(open));
  elements.imageToggle.innerHTML = open
    ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Remover imagem'
    : '<i class="fa-solid fa-link" aria-hidden="true"></i> Usar link de imagem';
  elements.imageUrl.disabled = !open;

  if (!open) {
    elements.imageUrl.value = "";
    elements.imagePreview.removeAttribute("src");
    elements.imagePreviewWrap.classList.add("hidden");
  }
}

function updateImagePreview() {
  const url = safeHttpUrl(elements.imageUrl.value);
  if (!url) {
    elements.imagePreview.removeAttribute("src");
    elements.imagePreviewWrap.classList.add("hidden");
    return;
  }
  elements.imagePreview.src = url;
  elements.imagePreviewWrap.classList.remove("hidden");
}

async function submitPost(event) {
  event.preventDefault();
  if (!session?.tcsSessionToken) {
    showAuthNotice({
      title: "Entre novamente no EnglishJourney",
      message: "Sua sessão precisa ser renovada antes de publicar.",
      needsRenew: true,
    });
    return;
  }

  const title = elements.postTitle.value.trim();
  const content = elements.postContent.value.trim();
  const imageUrl = elements.imageUrl.disabled ? "" : elements.imageUrl.value.trim();

  if (!title || !content) {
    showToast("Preencha o título e o texto da publicação.", "error");
    return;
  }
  if (imageUrl && !safeHttpUrl(imageUrl)) {
    showToast("Confira o endereço da imagem. Use um link http:// ou https://.", "error");
    elements.imageUrl.focus();
    return;
  }

  elements.submitPost.disabled = true;
  elements.submitPost.innerHTML = '<span class="spinner"></span> Publicando...';

  try {
    await invokeForum({
      action: "create_post",
      title,
      content,
      imageUrl,
    });
    elements.postForm.reset();
    toggleImageFields(false);
    elements.postPreview.classList.add("hidden");
    elements.previewToggle.setAttribute("aria-expanded", "false");
    elements.previewToggle.innerHTML = '<i class="fa-regular fa-eye" aria-hidden="true"></i> Pré-visualizar texto <i class="fa-solid fa-chevron-down preview-chevron" aria-hidden="true"></i>';
    updatePreview();
    showToast("Publicação enviada com sucesso!", "success");
    await loadPosts(true);
    document.querySelector(".feed-toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("Erro ao publicar:", error);
    if (error.status === 401 || /sessão|entre novamente|expirou/i.test(error.message)) {
      showAuthNotice({
        title: "Sua sessão precisa ser renovada",
        message: error.message || "Entre novamente no EnglishJourney para publicar.",
        needsRenew: true,
      });
    } else {
      showToast(error.message || "Não foi possível publicar. Tente novamente.", "error");
    }
  } finally {
    elements.submitPost.disabled = false;
    elements.submitPost.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Publicar';
  }
}

function initialize() {
  session = readSession();

  if (!session?.username) {
    showAuthNotice({
      title: "Entre no EnglishJourney",
      message: "É necessário estar conectado à sua conta para acessar o fórum.",
    });
    return;
  }

  if (!session.tcsSessionToken) {
    showAuthNotice({
      title: "Sua sessão precisa ser renovada",
      message: "Esta sessão ainda não possui o token de acesso do fórum. Saia da plataforma e entre novamente uma vez para atualizar seu acesso.",
      needsRenew: true,
    });
    return;
  }

  elements.authRequired.classList.add("hidden");
  elements.forumContent.classList.remove("hidden");
  setCurrentUser();
  elements.imageUrl.disabled = true;
  updatePreview();

  elements.postForm.addEventListener("submit", submitPost);
  elements.postContent.addEventListener("input", updatePreview);
  elements.imageToggle.addEventListener("click", () => toggleImageFields());
  elements.imageUrl.addEventListener("input", updateImagePreview);

  elements.previewToggle.addEventListener("click", () => {
    const expanded = elements.previewToggle.getAttribute("aria-expanded") === "true";
    elements.previewToggle.setAttribute("aria-expanded", String(!expanded));
    elements.postPreview.classList.toggle("hidden", expanded);
    elements.previewToggle.innerHTML = expanded
      ? '<i class="fa-regular fa-eye" aria-hidden="true"></i> Pré-visualizar texto <i class="fa-solid fa-chevron-down preview-chevron" aria-hidden="true"></i>'
      : '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i> Ocultar prévia <i class="fa-solid fa-chevron-down preview-chevron" aria-hidden="true"></i>';
  });

  document.querySelectorAll("[data-marker]").forEach((button) => {
    button.addEventListener("click", () => wrapSelectedText(button.dataset.marker));
  });

  elements.refreshFeed.addEventListener("click", () => loadPosts(true));
  elements.loadMore.addEventListener("click", () => loadPosts(false));
  elements.renewSession.addEventListener("click", () => {
    clearSession();
    window.location.href = "../../index.html";
  });

  loadPosts(true);
  window.setInterval(updateLikeCounters, 60 * 1000);
}

initialize();
