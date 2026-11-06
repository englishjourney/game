export function renderMissionBody() {
    return `
        <main class="ej-mission-main">
            <section class="ej-lesson-column">
                <div class="ej-progress-area">
                    <div class="ej-progress-labels">
                        <span id="mission-stage-label">LESSON</span>
                        <span id="mission-progress-label">1 / 3</span>
                    </div>
                    <div class="ej-progress-track" role="progressbar" aria-label="Progresso da missão" aria-valuemin="0" aria-valuemax="100" aria-valuenow="10">
                        <span id="mission-progress-bar"></span>
                    </div>
                </div>
                <div id="mission-content" class="ej-mission-content" aria-live="polite"></div>
            </section>

            <aside class="ej-artie-guide" aria-label="Artie, seu guia nesta missão">
                <div class="ej-artie-image-wrap">
                    <span id="artie-fallback" class="ej-artie-fallback" aria-hidden="true">A</span>
                    <img
                        id="artie-avatar"
                        src="./assets/artie_standing_smiling.png"
                        alt="Artie, seu guia de inglês"
                        decoding="async"
                    >
                </div>
                <div class="ej-artie-bubble">
                    <span class="ej-artie-name">ARTIE</span>
                    <p id="artie-message">Hi! Vamos aprender juntos?</p>
                </div>
            </aside>
        </main>
    `;
}
