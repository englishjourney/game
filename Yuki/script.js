// Configurações do Supabase e Apps Script
const SUPABASE_URL = "https://rmsmamzutvxugdbiqsrz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hMNCps2v2Odflpq9zDt_dw_Cgb_Jcxx";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyzOTK6jnB2-u4uienT9nP8noT7CM95NzqUaAx5c3-LBluFSVZKJz7J2g7lItuZS4wBoQ/exec";

// Instância com nome 'supabaseClient' para evitar conflito com a biblioteca global
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado da Aplicação
let currentUser = null;
let chatHistoryText = "";
let conversationHistory = []; // Mantém a estrutura de histórico para a IA
let currentAssignmentId = null;

// Elementos DOM
const chatMessagesContainer = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// Inicialização
document.addEventListener("DOMContentLoaded", async () => {
  await loadUserData();
  setupMobileKeyboardAdjust();
});

// Busca os dados do usuário do cache do navegador
async function loadUserData() {
  const localUser = localStorage.getItem("game_user");

  if (!localUser) {
    return;
  }

  const parsedUser = JSON.parse(localUser);

  currentUser = parsedUser;
  currentUser.gradeClass = `${currentUser.serie || ''}${currentUser.team || ''}`;
  
  console.log("Usuário carregado com sucesso do cache:", currentUser.name);
}

// Ajuste automático de scroll quando o teclado mobile abre
function setupMobileKeyboardAdjust() {
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    });
  }
}

// Formatação de data/hora [DD/MM/YYYY - HH:mm]
function getFormattedTimestamp() {
  const now = new Date();
  const date = now.toLocaleDateString('pt-BR');
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} - ${time}`;
}

// Renderiza a mensagem no chat com suporte a Markdown
function renderMessage(sender, text, avatarUrl) {
  const row = document.createElement("div");
  row.classList.add("message-row", sender);

  const avatarImg = document.createElement("img");
  avatarImg.classList.add("avatar-img");
  avatarImg.src = sender === "yuki" ? "yuki.png" : (avatarUrl || "default-avatar.png");

  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble");
  
  const textContainer = document.createElement("div");
  textContainer.classList.add("message-text");

  // Converte a resposta do Yuki usando marked.js
  if (sender === "yuki" && typeof marked !== "undefined") {
    textContainer.innerHTML = marked.parse(text);
  } else {
    textContainer.innerText = text;
  }

  const timeSpan = document.createElement("span");
  timeSpan.classList.add("message-time");
  timeSpan.innerText = getFormattedTimestamp().split(" - ")[1];

  bubble.appendChild(textContainer);
  bubble.appendChild(timeSpan);

  row.appendChild(avatarImg);
  row.appendChild(bubble);

  chatMessagesContainer.appendChild(row);

  if (sender === "yuki") {
    row.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  return row;
}

// Envio de mensagem (apenas envia para a IA e exibe, sem salvar histórico no Drive/Supabase)
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message || !currentUser) return;

  userInput.value = "";

  // 1. Renderiza mensagem do Aluno
  renderMessage("user", message, currentUser.avatar_url);

  // 2. Registra nas variáveis de histórico local
  const timestamp = getFormattedTimestamp();
  chatHistoryText += `${currentUser.username} [${timestamp}]: ${message}\n`;
  conversationHistory.push({ role: "user", content: message });

  // 3. Renderiza mensagem temporária de digitação do Yuki
  const loadingRow = renderMessage("yuki", "Yuki está digitando...", "yuki.png");

  try {
    // 4. Envia mensagem + histórico ao Apps Script
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        message: message,
        history: conversationHistory,
        userData: {
          name: currentUser.name,
          username: currentUser.username,
          gradeClass: currentUser.gradeClass
        }
      })
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("O servidor retornou HTML em vez de JSON:", responseText);
      throw new Error("Erro interno no servidor do Apps Script.");
    }

    loadingRow.remove();

    const yukiReply = data.reply || "Ops, tive um probleminha para responder. Pode repetir?";
    const detectedSubject = data.mainSubject || "Geral";

    // 5. Renderiza a resposta do Yuki
    const yukiRow = renderMessage("yuki", yukiReply, "yuki.png");
    
    // 6. Atualiza os históricos locais com a resposta do assistente
    const yukiTimestamp = getFormattedTimestamp();
    chatHistoryText += `YUKI [${yukiTimestamp}]: ${yukiReply}\n`;
    conversationHistory.push({ role: "assistant", content: yukiReply });

    // 7. Verifica se o Yuki parabenizou o aluno para exibir os botões finais
    if (yukiReply.toLowerCase().includes("muito bem") || yukiReply.toLowerCase().includes("você arrasou")) {
      renderCompletionButtons(yukiRow, detectedSubject);
    }

  } catch (error) {
    console.error("Erro na comunicação com a IA:", error);
    loadingRow.remove();
    renderMessage("yuki", "Tive um erro de conexão. Tente novamente!", "yuki.png");
  }
});

// Renderiza os botões de encerramento ou nova pergunta ao concluir a atividade
function renderCompletionButtons(yukiRow, detectedSubject) {
  const bubble = yukiRow.querySelector(".message-bubble");
  if (!bubble || bubble.querySelector(".completion-buttons")) return;

  const buttonContainer = document.createElement("div");
  buttonContainer.classList.add("completion-buttons");
  buttonContainer.style.cssText = "display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap;";

  // Botão Encerrar Chat
  const btnClose = document.createElement("button");
  btnClose.innerText = "Encerrar chat";
  btnClose.className = "chat-action-btn close-btn";
  btnClose.style.cssText = "background: #ef4444; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: bold;";
  
  btnClose.onclick = async () => {
    btnClose.innerText = "Salvando chat...";
    btnClose.disabled = true;
    btnAnother.disabled = true;
    
    await saveChatAndRecord(chatHistoryText, detectedSubject || "Encerrado");
    
    userInput.disabled = true;
    chatForm.querySelector("button").disabled = true;
    buttonContainer.remove();
    renderMessage("yuki", "Chat encerrado com sucesso! Bom descanso.", "yuki.png");
  };

  // Botão Fazer Outra Pergunta
  const btnAnother = document.createElement("button");
  btnAnother.innerText = "Fazer outra pergunta";
  btnAnother.className = "chat-action-btn another-btn";
  btnAnother.style.cssText = "background: #a855f7; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: bold;";
  
  btnAnother.onclick = async () => {
    btnAnother.innerText = "Salvando chat...";
    btnClose.disabled = true;
    btnAnother.disabled = true;
    
    await saveChatAndRecord(chatHistoryText, detectedSubject || "Finalizado");
    
    chatHistoryText = "";
    conversationHistory = [];
    currentAssignmentId = null;
    buttonContainer.remove();
    renderMessage("yuki", "Legal! Mande sua nova dúvida ou questão para começarmos.", "yuki.png");
  };

  buttonContainer.appendChild(btnClose);
  buttonContainer.appendChild(btnAnother);
  bubble.appendChild(buttonContainer);
}

// Cria o arquivo .txt no Drive via Apps Script e salva o link no Supabase (Executado SOMENTE nos botões)
async function saveChatAndRecord(historyText, mainSubject) {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "saveChat",
        chatHistory: historyText,
        mainSubject: mainSubject,
        userData: {
          name: currentUser.name,
          username: currentUser.username,
          gradeClass: currentUser.gradeClass
        }
      })
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Retorno inválido do Apps Script ao salvar:", responseText);
      return;
    }

    const fileUrl = data.fileUrl || "";

    const payload = {
      chatHistory: fileUrl,
      mainSubject: mainSubject,
      name: currentUser.name,
      gradeClass: currentUser.gradeClass
    };

    if (currentAssignmentId) {
      await supabaseClient
        .from("assignments")
        .update(payload)
        .eq("id", currentAssignmentId);
    } else {
      const { data: insertData, error } = await supabaseClient
        .from("assignments")
        .insert([payload])
        .select("id")
        .single();

      if (!error && insertData) {
        currentAssignmentId = insertData.id;
      }
    }
  } catch (err) {
    console.error("Erro ao salvar o chat no Drive/Supabase:", err);
  }
}
