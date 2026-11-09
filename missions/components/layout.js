import { renderMissionHeader } from "./header.js";
import { renderMissionBody } from "./body.js";
import { renderMissionFooter } from "./footer.js";

export function mountMissionLayout() {
    const root = document.getElementById("mission-app");
    if (!root) throw new Error("O elemento #mission-app não foi encontrado.");

    root.innerHTML = `
        <div class="ej-mission-shell">
            ${renderMissionHeader()}
            ${renderMissionBody()}
            ${renderMissionFooter()}
        </div>
        <div id="mission-dialog-root"></div>
    `;

    const avatar = document.getElementById("artie-avatar");
    const fallback = document.getElementById("artie-fallback");

    avatar?.addEventListener("error", () => {
        avatar.hidden = true;
        if (fallback) fallback.hidden = false;
    });

    avatar?.addEventListener("load", () => {
        avatar.hidden = false;
        if (fallback) fallback.hidden = true;
    });
}

export function setMissionUser(session) {
    const user = document.getElementById("mission-user");
    if (user) user.textContent = session?.name || session?.username || "Student";
}

export function setMissionReward(completed = false, failed = false) {
    const reward = document.getElementById("mission-reward");
    if (!reward) return;

    reward.textContent = completed
        ? "⭐ Recompensa recebida"
        : failed
            ? "⭐ Sem recompensa"
            : "⭐ +1 estrela ao concluir";
}

export function setMissionProgress(label, current, total, percent) {
    const stage = document.getElementById("mission-stage-label");
    const count = document.getElementById("mission-progress-label");
    const bar = document.getElementById("mission-progress-bar");
    const track = bar?.parentElement;

    if (stage) stage.textContent = label;
    if (count) count.textContent = `${current} / ${total}`;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (track) track.setAttribute("aria-valuenow", String(Math.max(0, Math.min(100, percent))));
}

export function setArtie(message, imageName = "artie_standing_smiling.png") {
    const messageElement = document.getElementById("artie-message");
    const avatar = document.getElementById("artie-avatar");
    const fallback = document.getElementById("artie-fallback");

    if (messageElement) messageElement.textContent = message;
    if (avatar && imageName) {
        avatar.hidden = false;
        if (fallback) fallback.hidden = true;
        avatar.src = `./assets/${imageName}`;
    }
}

export function setMissionContent(html) {
    const content = document.getElementById("mission-content");
    if (content) content.innerHTML = html;
}

export function showMissionDialog({ title, message, buttonText = "Continue", tone = "success", onAction }) {
    const root = document.getElementById("mission-dialog-root");
    if (!root) return;

    root.innerHTML = "";
    const dialog = document.createElement("dialog");
    dialog.className = `ej-result-dialog ${tone}`;

    const card = document.createElement("div");
    card.className = "ej-dialog-card";

    const icon = document.createElement("div");
    icon.className = "ej-dialog-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = tone === "success" ? "⭐" : tone === "warning" ? "💡" : "📘";

    const heading = document.createElement("h2");
    heading.textContent = title;

    const copy = document.createElement("p");
    copy.textContent = message;

    const action = document.createElement("button");
    action.type = "button";
    action.className = "ej-primary-button ej-dialog-action";
    action.textContent = buttonText;

    action.addEventListener("click", () => {
        dialog.close();
        dialog.remove();
        if (typeof onAction === "function") onAction();
    });

    card.append(icon, heading, copy, action);
    dialog.append(card);
    root.append(dialog);
    dialog.showModal();
    action.focus();
}
