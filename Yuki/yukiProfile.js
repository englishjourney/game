// ==========================================
// MODAL DE PERFIL DO YUKI-SENSEI
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  createYukiProfileModal();
  setupYukiAvatarClickListener();
});

// Cria o HTML do modal dinamicamente no DOM
function createYukiProfileModal() {
  if (document.getElementById("yuki-profile-modal")) return;

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "yuki-profile-modal";
  modalOverlay.className = "yuki-modal-overlay";

  modalOverlay.innerHTML = `
    <div class="yuki-profile-card">
      <button id="close-yuki-modal" class="yuki-modal-close">&times;</button>
      <div class="yuki-avatar-wrapper">
        <img src="yuki.png" alt="Yuki-Sensei" class="yuki-profile-avatar">
      </div>
      <h3 class="yuki-profile-name">Yuki-Sensei</h3>
      <p class="yuki-profile-bio">
        Sou uma IA criada para te ajudar com o inglês nas aulas. Eu e o teacher Micael estamos trabalhando juntos para te fazer falar inglês! Are you ready?
      </p>
      <button id="btn-ok-yuki-modal" class="yuki-modal-btn">Let's go!</button>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  // Eventos de fechamento
  document.getElementById("close-yuki-modal").addEventListener("click", closeYukiProfileModal);
  document.getElementById("btn-ok-yuki-modal").addEventListener("click", closeYukiProfileModal);
  
  // Fecha se clicar fora do card
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      closeYukiProfileModal();
    }
  });
}

// Configura o clique na foto/cabeçalho do Yuki para abrir o modal
function setupYukiAvatarClickListener() {
  const headerAvatar = document.querySelector(".chat-header .avatar-container") || document.querySelector(".chat-header");
  
  if (headerAvatar) {
    headerAvatar.style.cursor = "pointer";
    headerAvatar.title = "Ver perfil do Yuki-Sensei";
    headerAvatar.addEventListener("click", openYukiProfileModal);
  }
}

function openYukiProfileModal() {
  const modal = document.getElementById("yuki-profile-modal");
  if (modal) {
    modal.classList.add("active");
  }
}

function closeYukiProfileModal() {
  const modal = document.getElementById("yuki-profile-modal");
  if (modal) {
    modal.classList.remove("active");
  }
}
