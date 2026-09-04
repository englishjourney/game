// Configurações do Supabase e Apps Script
const SUPABASE_URL = "https://rmsmamzutvxugdbiqsrz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hMNCps2v2Odflpq9zDt_dw_Cgb_Jcxx";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz9qOHPksbJfWLj1dTvCqVrm4yZgEVv9Ni-AEqK0HMVskXRQuo71r6DhaKBWLIdn1XJHQ/exec";

// Instância com nome 'supabaseClient' para evitar conflito com a biblioteca global
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado da Aplicação
let currentUser = null;
let chatHistoryText = "";
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

// Renderiza a mensagem no chat
function renderMessage(sender, text, avatarUrl) {
  const row = document.createElement("div");
  row.classList.add("message-row", sender);

  const avatarImg = document.createElement("img");
  avatarImg.classList.add("avatar-img");
  avatarImg.src = sender === "yuki" ? "yuki.png" : (avatarUrl || "default-avatar.png");

  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble");
  
  const textParagraph = document.createElement("p");
  textParagraph.innerText = text;

  const timeSpan = document.createElement("span");
  timeSpan.classList.add("message-time");
  timeSpan.innerText = getFormattedTimestamp().split(" - ")[1];

  bubble.appendChild(textParagraph);
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

// Envio de mensagem
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message || !currentUser) return;

  userInput.value = "";

  // 1. Renderiza mensagem do Aluno
  renderMessage("user", message, currentUser.avatar_url);

  // 2. Registra na variável do histórico em texto
  const timestamp = getFormattedTimestamp();
  chatHistoryText += `${currentUser.username} [${timestamp}]: ${message}\n`;

  // 3. Renderiza mensagem temporária de digitação do Yuki
  const loadingRow = renderMessage("yuki", "Yuki está digitando...", "yuki.png");

  try {
    // 4. Envia mensagem ao Apps Script sem acionar a requisição Preflight (CORS)
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        message: message,
        userData: {
          name: currentUser.name,
          username: currentUser.username,
          gradeClass: currentUser.gradeClass
        }
      })
    });

    const data = await response.json();
    loadingRow.remove();

    const yukiReply = data.reply || "Ops, tive um probleminha para responder. Pode repetir?";
    const detectedSubject = data.mainSubject || "Geral";

    // 5. Renderiza a resposta do Yuki
    renderMessage("yuki", yukiReply, "yuki.png");
    
    // 6. Atualiza o histórico
    const yukiTimestamp = getFormattedTimestamp();
    chatHistoryText += `YUKI [${yukiTimestamp}]: ${yukiReply}\n`;

    // 7. Salva ou atualiza os dados na tabela 'assignments' do Supabase
    await saveAssignmentData(chatHistoryText, detectedSubject);

  } catch (error) {
    console.error("Erro na comunicação com a IA:", error);
    loadingRow.remove();
    renderMessage("yuki", "Tive um erro de conexão. Tente novamente!", "yuki.png");
  }
});

// Salva/Atualiza o registro na tabela 'assignments'
async function saveAssignmentData(history, mainSubject) {
  const payload = {
    chatHistory: history,
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
    const { data, error } = await supabaseClient
      .from("assignments")
      .insert([payload])
      .select("id")
      .single();

    if (!error && data) {
      currentAssignmentId = data.id;
    }
  }
}
