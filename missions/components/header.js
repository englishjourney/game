export function renderMissionHeader() {
    return `
        <header class="ej-mission-header">
            <a class="ej-brand" href="../index.html" target="_top" aria-label="Voltar ao EnglishJourney">
                <span class="ej-brand-mark">EJ</span>
                <span class="ej-brand-name">EnglishJourney</span>
            </a>
            <div class="ej-header-info">
                <span class="ej-mission-number">MISSION 01</span>
                <span class="ej-xp-pill" id="mission-reward">⭐ +2 estrelas ao concluir</span>
                <span class="ej-user-pill" id="mission-user">Verificando login...</span>
            </div>
        </header>
    `;
}
