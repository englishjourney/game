import { supabase } from "./supabaseClient.js";
import { getSession, validatePassword } from "./auth.js";

const QUESTION_TEXT = {
  1: "Qual foi o nome do meu primeiro bicho de estimação?",
  2: "Qual é o nome do meu avô?",
  3: "Qual foi a primeira escola onde estudei?",
  4: "Qual é minha comida favorita?",
};

function byId(id) {
  return document.getElementById(id);
}

function setMessage(element, message, type = "") {
  element.textContent = message || "";
  element.classList.remove("error", "success");
  if (type) element.classList.add(type);
}

async function callRecovery(payload) {
  const { data, error } = await supabase.functions.invoke("account-recovery", {
    body: payload,
  });

  if (error) {
    let message = error.message || "Não foi possível concluir a solicitação.";
    let status = 0;
    const response = error.context;
    if (response && typeof response.clone === "function") {
      status = response.status || 0;
      try {
        const details = await response.clone().json();
        if (details?.error) message = details.error;
      } catch (_) {}
    }
    const wrapped = new Error(message);
    wrapped.status = status;
    throw wrapped;
  }

  if (data?.error) throw new Error(data.error);
  return data?.data ?? data;
}

function renderQuestionFields(container, questionIds, prefix) {
  container.replaceChildren();
  questionIds.forEach((questionId) => {
    const wrapper = document.createElement("div");
    wrapper.className = "security-answer-field";

    const label = document.createElement("label");
    const inputId = prefix + "-answer-" + questionId;
    label.htmlFor = inputId;
    label.textContent = QUESTION_TEXT[questionId];

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "text";
    input.autocomplete = "off";
    input.maxLength = 160;
    input.required = true;
    input.dataset.questionId = String(questionId);
    input.placeholder = "Sua resposta";

    wrapper.append(label, input);
    container.appendChild(wrapper);
  });
}

function readAnswers(container) {
  return [...container.querySelectorAll("input[data-question-id]")].map((input) => ({
    questionId: Number(input.dataset.questionId),
    answer: input.value.trim(),
  }));
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function markSecurityNoticeAsRead(username) {
  const key = "ej_notifications_v1_" + username;
  try {
    const state = JSON.parse(localStorage.getItem(key) || "null");
    if (!state || !Array.isArray(state.events)) return;
    const notice = state.events.find((event) => event.id === "system:security-questions-2026");
    if (notice) notice.read = true;
    localStorage.setItem(key, JSON.stringify(state));
    const unread = state.events.filter((event) => !event.read).length;
    const badge = byId("notification-count");
    if (badge) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.classList.toggle("hidden", unread === 0);
    }
  } catch (error) {
    console.warn("Não foi possível atualizar o aviso de segurança:", error);
  }
}

function initializeRecoveryDialog() {
  const dialog = byId("account-recovery-dialog");
  if (!dialog) return;

  const usernameInput = byId("recovery-username");
  const stepUsername = byId("recovery-step-username");
  const stepAnswers = byId("recovery-step-answers");
  const questionFields = byId("recovery-question-fields");
  const message = byId("recovery-message");
  const continueButton = byId("recovery-continue");
  const submitButton = byId("recovery-submit");
  let activeUsername = "";
  let activeQuestionIds = [];

  function resetFlow() {
    activeUsername = "";
    activeQuestionIds = [];
    usernameInput.value = "";
    byId("recovery-new-password").value = "";
    byId("recovery-confirm-password").value = "";
    questionFields.replaceChildren();
    stepUsername.classList.remove("hidden");
    stepAnswers.classList.add("hidden");
    continueButton.disabled = false;
    continueButton.textContent = "Continuar";
    submitButton.disabled = false;
    submitButton.textContent = "Redefinir senha";
    setMessage(message, "");
  }

  byId("btn-forgot-password")?.addEventListener("click", () => {
    resetFlow();
    dialog.showModal();
    usernameInput.focus();
  });

  dialog.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(dialog));
  });

  continueButton.addEventListener("click", async () => {
    const username = usernameInput.value.trim().toLowerCase();
    if (!username) {
      setMessage(message, "Informe seu nome de usuário.", "error");
      usernameInput.focus();
      return;
    }

    continueButton.disabled = true;
    continueButton.textContent = "Verificando...";
    setMessage(message, "");

    try {
      const result = await callRecovery({ action: "begin_recovery", username });
      if (!result?.configured || !Array.isArray(result.questionIds) || result.questionIds.length < 2) {
        throw new Error("Esta conta ainda não possui perguntas de segurança configuradas. Peça ajuda ao professor para recuperar o acesso.");
      }

      activeUsername = username;
      activeQuestionIds = result.questionIds.map(Number);
      renderQuestionFields(questionFields, activeQuestionIds, "recovery");
      stepUsername.classList.add("hidden");
      stepAnswers.classList.remove("hidden");
      setMessage(message, "Responda todas as perguntas cadastradas para continuar.");
    } catch (error) {
      setMessage(message, error.message || "Não foi possível iniciar a recuperação.", "error");
    } finally {
      continueButton.disabled = false;
      continueButton.textContent = "Continuar";
    }
  });

  byId("recovery-back").addEventListener("click", () => {
    stepAnswers.classList.add("hidden");
    stepUsername.classList.remove("hidden");
    setMessage(message, "");
  });

  byId("account-recovery-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeUsername || activeQuestionIds.length < 2) return;

    const answers = readAnswers(questionFields);
    if (answers.length !== activeQuestionIds.length || answers.some((item) => !item.answer)) {
      setMessage(message, "Responda todas as perguntas.", "error");
      return;
    }

    const password = byId("recovery-new-password").value;
    const confirmation = byId("recovery-confirm-password").value;
    const validation = validatePassword(password);
    if (!validation.valid) {
      setMessage(message, validation.message, "error");
      return;
    }
    if (password !== confirmation) {
      setMessage(message, "As senhas não coincidem.", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Verificando respostas...";
    setMessage(message, "");

    try {
      await callRecovery({
        action: "reset_password",
        username: activeUsername,
        answers,
        newPassword: password,
      });
      closeDialog(dialog);
      byId("login-username").value = activeUsername;
      byId("login-password").value = "";
      window.alert("Senha atualizada! Agora entre com sua nova senha.");
    } catch (error) {
      setMessage(message, error.message || "Não foi possível redefinir a senha.", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Redefinir senha";
    }
  });

  dialog.addEventListener("close", resetFlow);
}

function initializeSecuritySetup() {
  const dialog = byId("account-security-setup-dialog");
  const form = byId("account-security-setup-form");
  if (!dialog || !form) return;

  const choices = byId("security-question-choices");
  const answerFields = byId("security-answer-fields");
  const message = byId("security-setup-message");
  const saveButton = byId("security-setup-save");
  let answerDraft = new Map();

  function selectedIds() {
    return [...choices.querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.value));
  }

  function renderSelectedFields() {
    answerFields.querySelectorAll("input[data-question-id]").forEach((input) => {
      answerDraft.set(Number(input.dataset.questionId), input.value);
    });
    const ids = selectedIds();
    renderQuestionFields(answerFields, ids, "setup");
    answerFields.querySelectorAll("input[data-question-id]").forEach((input) => {
      input.value = answerDraft.get(Number(input.dataset.questionId)) || "";
    });
    if (ids.length < 2) {
      setMessage(message, "Selecione pelo menos duas perguntas.");
    } else {
      setMessage(message, ids.length + " pergunta(s) selecionada(s).");
    }
  }

  choices.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", renderSelectedFields);
  });

  byId("security-setup-later").addEventListener("click", () => closeDialog(dialog));
  dialog.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(dialog));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const session = getSession();
    const ids = selectedIds();
    const answers = readAnswers(answerFields);

    if (!session?.tcsSessionToken) {
      setMessage(message, "Saia e entre novamente no EnglishJourney para ativar a configuração.", "error");
      return;
    }
    if (ids.length < 2) {
      setMessage(message, "É necessário escolher pelo menos duas perguntas.", "error");
      return;
    }
    if (answers.length !== ids.length || answers.some((item) => !item.answer)) {
      setMessage(message, "Preencha uma resposta para cada pergunta escolhida.", "error");
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Salvando...";
    setMessage(message, "");

    try {
      await callRecovery({
        action: "save_security_answers",
        sessionToken: session.tcsSessionToken,
        answers,
      });
      markSecurityNoticeAsRead(session.username);
      closeDialog(dialog);
      window.alert("Perguntas de segurança configuradas com sucesso!");
    } catch (error) {
      setMessage(message, error.message || "Não foi possível salvar as perguntas.", "error");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Salvar perguntas";
    }
  });

  return dialog;
}

export function initAccountRecovery() {
  initializeRecoveryDialog();
  const setupDialog = initializeSecuritySetup();
  const session = getSession();

  if (!session?.username || !session.tcsSessionToken || !setupDialog) return;

  callRecovery({
    action: "get_security_status",
    sessionToken: session.tcsSessionToken,
  }).then((status) => {
    if (!status?.configured && !setupDialog.open) {
      setupDialog.showModal();
    }
  }).catch((error) => {
    console.warn("Não foi possível verificar as perguntas de segurança:", error);
  });
}
