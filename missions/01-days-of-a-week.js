import {
    getCachedMissionSession,
    loginMissionUser,
    loadMissionSettings,
    recordMissionResult
} from "./components/config.js";
import {
    mountMissionLayout,
    setMissionUser,
    setMissionXP,
    setMissionProgress,
    setArtie,
    setMissionContent,
    showMissionDialog
} from "./components/layout.js";
import { playGoogleTTS } from "./components/tts.js";

const MISSION_NAME = "Days of a Week";

const days = [
    { en: "Monday", pt: "segunda-feira" },
    { en: "Tuesday", pt: "terça-feira" },
    { en: "Wednesday", pt: "quarta-feira" },
    { en: "Thursday", pt: "quinta-feira" },
    { en: "Friday", pt: "sexta-feira" },
    { en: "Saturday", pt: "sábado" },
    { en: "Sunday", pt: "domingo" }
];

const gameQuestions = [
    {
        prompt: "What day comes before Friday?",
        options: ["Thursday", "Saturday", "Monday"],
        answer: "Thursday",
        explanation: "Thursday comes right before Friday."
    },
    {
        prompt: "How do you say “domingo” in English?",
        options: ["Saturday", "Sunday", "Monday"],
        answer: "Sunday",
        explanation: "Sunday means domingo."
    },
    {
        prompt: "Which day is between Monday and Wednesday?",
        options: ["Tuesday", "Thursday", "Friday"],
        answer: "Tuesday",
        explanation: "Tuesday is between Monday and Wednesday."
    },
    {
        prompt: "Which spelling is correct?",
        options: ["Wensday", "Wednesday", "Wednsday"],
        answer: "Wednesday",
        explanation: "Wednesday is spelled W-E-D-N-E-S-D-A-Y."
    },
    {
        prompt: "What day comes after Saturday?",
        options: ["Friday", "Sunday", "Monday"],
        answer: "Sunday",
        explanation: "Sunday comes after Saturday."
    }
];

let studentSession = null;
let missionSettings = {
    registered: false,
    missionScore: null,
    alreadyAttempted: false,
    completed: false,
    failed: false
};
let gameIndex = 0;
let correctAnswers = 0;
let answerLocked = false;

function renderLoginScreen() {
    setMissionProgress("LOGIN", 1, 3, 0);
    setArtie("Hi! Entre com seu usuário do EnglishJourney. Se você já fez login no site, eu reconheceria sua sessão automaticamente.", "artie_waving_ClosedEyes_smiling.png");

    setMissionContent(`
        <span class="ej-kicker">WELCOME TO ENGLISHJOURNEY</span>
        <h1 class="ej-screen-title">Let’s learn English!</h1>
        <p class="ej-screen-copy">Entre com o mesmo usuário e senha que você utiliza no EnglishJourney para começar a missão <strong>Days of the Week</strong>.</p>
        <form id="mission-login-form" class="ej-login-form">
            <label>
                Username
                <input id="mission-login-username" name="username" type="text" autocomplete="username" required>
            </label>
            <label>
                Password
                <input id="mission-login-password" name="password" type="password" autocomplete="current-password" required>
            </label>
            <p id="mission-login-feedback" class="ej-login-feedback" role="alert"></p>
            <button class="ej-primary-button" type="submit">Start mission <span aria-hidden="true">→</span></button>
        </form>
    `);

    const form = document.getElementById("mission-login-form");
    form?.addEventListener("submit", async event => {
        event.preventDefault();

        const button = form.querySelector('button[type="submit"]');
        const feedback = document.getElementById("mission-login-feedback");
        const username = document.getElementById("mission-login-username")?.value;
        const password = document.getElementById("mission-login-password")?.value;

        if (button) {
            button.disabled = true;
            button.textContent = "Signing in...";
        }
        if (feedback) feedback.textContent = "";

        const result = await loginMissionUser(username, password);

        if (!result.session) {
            if (feedback) feedback.textContent = result.error || "Não foi possível entrar.";
            if (button) {
                button.disabled = false;
                button.innerHTML = 'Start mission <span aria-hidden="true">→</span>';
            }
            return;
        }

        await startMission(result.session);
    });
}

async function startMission(session) {
    studentSession = session;
    setMissionUser(session);
    setArtie("Great! Vamos aprender os dias da semana em inglês. Toque no alto-falante para ouvir cada palavra.", "artie_smiling_holding_chin.png");

    try {
        missionSettings = await loadMissionSettings(MISSION_NAME, session.username);
    } catch (error) {
        console.error("Não foi possível carregar a configuração da missão:", error);
        missionSettings = {
            registered: false,
            missionScore: null,
            alreadyAttempted: false,
            completed: false,
            failed: false
        };
    }

    setMissionXP(missionSettings.missionScore);
    renderLesson();
}

function renderLesson() {
    setMissionProgress("LESSON", 1, 3, 18);
    setArtie("Listen to each day and repeat it out loud. Vamos praticar juntos!", "artie_smiling_holding_chin.png");

    const missingMissionNotice = !missionSettings.registered
        ? `
            <div class="ej-info-strip ej-warning-strip">
                <span aria-hidden="true">ℹ️</span>
                <span>Esta missão ainda não foi cadastrada na tabela <strong>missions</strong>. Você pode testar a aula, mas o resultado e os pontos só serão registrados depois que a linha “Days of a Week” for adicionada.</span>
            </div>
        `
        : missionSettings.alreadyAttempted
            ? `
                <div class="ej-info-strip ej-warning-strip">
                    <span aria-hidden="true">🔁</span>
                    <span>Você já participou desta missão. Pode revisar e jogar novamente, mas uma nova tentativa não concede pontos.</span>
                </div>
            `
            : "";

    const cards = days.map(day => `
        <article class="ej-day-card">
            <span class="ej-day-name">${day.en}</span>
            <span class="ej-day-translation">${day.pt}</span>
            <button class="ej-audio-button" type="button" data-say="${day.en}" aria-label="Ouvir ${day.en}">🔊</button>
        </article>
    `).join("");

    setMissionContent(`
        <span class="ej-kicker">VOCABULARY • 01</span>
        <h1 class="ej-screen-title">Days of the Week</h1>
        <p class="ej-screen-copy">Em inglês, os dias da semana começam com letra maiúscula. Ouça cada palavra e observe a sequência de Monday a Sunday.</p>
        ${missingMissionNotice}
        <div class="ej-days-grid">${cards}</div>
        <div class="ej-info-strip">
            <span aria-hidden="true">💡</span>
            <span><strong>Remember:</strong> “week” significa semana. A expressão “days of the week” significa “dias da semana”.</span>
        </div>
        <div class="ej-button-row">
            <button id="start-mini-exercise" class="ej-primary-button" type="button">I’m ready! <span aria-hidden="true">→</span></button>
        </div>
    `);

    document.querySelectorAll("[data-say]").forEach(button => {
        button.addEventListener("click", () => playGoogleTTS(button.dataset.say));
    });

    document.getElementById("start-mini-exercise")?.addEventListener("click", renderWarmup);
}

function renderWarmup() {
    setMissionProgress("QUICK CHECK", 2, 3, 42);
    setArtie("Let's see what you remember! Não se preocupe: esta é só uma pequena prática antes do jogo.", "artie_standing_smiling.png");

    setMissionContent(`
        <span class="ej-kicker">QUICK CHECK • 1 QUESTION</span>
        <h1 class="ej-screen-title">Let’s practice!</h1>
        <p class="ej-screen-copy">Escolha a resposta correta para conferir se você aprendeu a sequência.</p>
        <section class="ej-quiz-card">
            <p class="ej-question-number">QUESTION 01</p>
            <h2 class="ej-question-title">Which day comes after Tuesday?</h2>
            <div class="ej-answer-list" id="warmup-answers">
                <button class="ej-answer-option" type="button" data-warmup-answer="Sunday">Sunday</button>
                <button class="ej-answer-option" type="button" data-warmup-answer="Wednesday">Wednesday</button>
                <button class="ej-answer-option" type="button" data-warmup-answer="Friday">Friday</button>
            </div>
        </section>
    `);

    document.querySelectorAll("[data-warmup-answer]").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-warmup-answer]").forEach(option => option.disabled = true);
            const isCorrect = button.dataset.warmupAnswer === "Wednesday";

            if (isCorrect) {
                button.classList.add("is-correct");
                setArtie("Excellent! Você acertou. Agora vamos para o desafio!", "artie_smiling_happy_hand_clenched_fists.png");
                showMissionDialog({
                    title: "Great job!",
                    message: "That’s correct! Wednesday comes after Tuesday. Você está pronto para jogar.",
                    buttonText: "Go to game",
                    tone: "success",
                    onAction: startGame
                });
            } else {
                document.querySelector('[data-warmup-answer="Wednesday"]')?.classList.add("is-correct");
                button.classList.add("is-wrong");
                setArtie("No problem! Errar faz parte do aprendizado. Veja a sequência e tente aplicar no jogo.", "artie_sad.png");
                showMissionDialog({
                    title: "Let’s learn from it!",
                    message: "A resposta correta é Wednesday. A sequência é Monday, Tuesday, Wednesday: portanto, Wednesday vem depois de Tuesday.",
                    buttonText: "Go to game",
                    tone: "warning",
                    onAction: startGame
                });
            }
        });
    });
}

function startGame() {
    gameIndex = 0;
    correctAnswers = 0;
    answerLocked = false;
    renderGameQuestion();
}

function renderGameQuestion() {
    const question = gameQuestions[gameIndex];
    const progress = 52 + Math.round((gameIndex / gameQuestions.length) * 42);

    setMissionProgress("GAME", 3, 3, progress);
    setArtie("You can do it! Escolha uma resposta. I’m cheering for you!", "artie_smiling_pointing_right.png");

    const options = question.options.map(option => `
        <button class="ej-answer-option" type="button" data-game-answer="${option}">${option}</button>
    `).join("");

    setMissionContent(`
        <span class="ej-kicker">FINAL CHALLENGE • DAYS OF THE WEEK</span>
        <h1 class="ej-screen-title">Play and learn!</h1>
        <p class="ej-screen-copy">Responda às cinco perguntas. Você precisa acertar pelo menos quatro para concluir a missão.</p>
        <section class="ej-quiz-card">
            <p class="ej-question-number">QUESTION ${gameIndex + 1} / ${gameQuestions.length}</p>
            <h2 class="ej-question-title">${question.prompt}</h2>
            <div class="ej-answer-list" id="game-answers">${options}</div>
            <p id="game-answer-feedback" class="ej-answer-feedback" aria-live="polite"></p>
            <div class="ej-button-row">
                <button id="next-game-question" class="ej-primary-button" type="button" hidden disabled>${gameIndex === gameQuestions.length - 1 ? "Finish mission" : "Continue"} <span aria-hidden="true">→</span></button>
            </div>
        </section>
    `);

    document.querySelectorAll("[data-game-answer]").forEach(button => {
        button.addEventListener("click", () => chooseGameAnswer(button, question));
    });

    document.getElementById("next-game-question")?.addEventListener("click", () => {
        if (gameIndex < gameQuestions.length - 1) {
            gameIndex += 1;
            answerLocked = false;
            renderGameQuestion();
        } else {
            completeGame();
        }
    });
}

function chooseGameAnswer(button, question) {
    if (answerLocked) return;
    answerLocked = true;

    const selected = button.dataset.gameAnswer;
    const isCorrect = selected === question.answer;
    const options = [...document.querySelectorAll("[data-game-answer]")];

    options.forEach(option => {
        option.disabled = true;
        if (option.dataset.gameAnswer === question.answer) option.classList.add("is-correct");
    });

    const feedback = document.getElementById("game-answer-feedback");

    if (isCorrect) {
        correctAnswers += 1;
        if (feedback) feedback.textContent = "Correct! " + question.explanation;
        setArtie("Correct answer! Keep going!", "artie_smiling_happy_hand_clenched_fists.png");
    } else {
        button.classList.add("is-wrong");
        if (feedback) feedback.textContent = "Not quite. " + question.explanation;
        setArtie("Keep going! Uma resposta errada não apaga o que você já aprendeu.", "artie_sad.png");
    }

    const next = document.getElementById("next-game-question");
    if (next) {
        next.hidden = false;
        next.disabled = false;
    }
}

async function completeGame() {
    const passed = correctAnswers >= 4;
    setMissionProgress("RESULT", 3, 3, 100);
    setArtie(
        passed ? "You did it! Estou muito orgulhoso do seu esforço!" : "Good effort! Vamos revisar e aprender um pouco mais.",
        passed ? "artie_smiling_happy_hand_clenched_fists.png" : "artie_sad.png"
    );

    let result = null;
    let recordError = null;

    try {
        result = await recordMissionResult(MISSION_NAME, studentSession.username, passed ? "done" : "fail");
    } catch (error) {
        console.error("Erro ao registrar o resultado da missão:", error);
        recordError = error;
    }

    if (result?.recorded && passed) {
        missionSettings.alreadyAttempted = true;
        missionSettings.completed = true;
        setMissionXP(result.earnedPoints);
    } else if (result?.recorded && !passed) {
        missionSettings.alreadyAttempted = true;
        missionSettings.failed = true;
    } else if (result?.reason === "already-attempted") {
        missionSettings.alreadyAttempted = true;
    }

    let message;
    if (recordError) {
        message = recordError.message + " Seu resultado foi: " + correctAnswers + " de 5.";
    } else if (result?.reason === "mission-not-registered") {
        message = "Você acertou " + correctAnswers + " de 5. A missão ainda não existe na tabela missions, então nenhum ponto foi registrado. Cadastre “Days of a Week” para ativar a pontuação.";
    } else if (result?.reason === "score-not-configured") {
        message = "Você acertou " + correctAnswers + " de 5, mas mission_score ainda não possui um valor válido. Configure a pontuação da missão para registrar a conclusão.";
    } else if (result?.reason === "already-attempted") {
        message = "Você acertou " + correctAnswers + " de 5. Esta missão já teve uma tentativa registrada para sua conta, então esta repetição não concede novos pontos.";
    } else if (passed) {
        message = "Você acertou " + correctAnswers + " de 5 e concluiu a missão! " + result.earnedPoints + " XP foram adicionados à sua pontuação.";
    } else if (result?.recorded) {
        message = "Você acertou " + correctAnswers + " de 5. Para concluir, é preciso acertar pelo menos 4. Sua tentativa foi registrada; revise a aula e continue aprendendo.";
    } else {
        message = "Você acertou " + correctAnswers + " de 5. Para concluir, é preciso acertar pelo menos 4. Revise a aula e tente novamente.";
    }

    const title = passed ? "Mission completed!" : "Keep practicing!";
    showMissionDialog({
        title,
        message,
        buttonText: "See results",
        tone: passed ? "success" : "warning",
        onAction: () => renderFinalScreen(passed, result, recordError)
    });
}

function renderFinalScreen(passed, result, recordError) {
    const points = result?.recorded && passed ? result.earnedPoints : 0;
    setMissionContent(`
        <span class="ej-kicker">MISSION 01 • RESULT</span>
        <h1 class="ej-screen-title">${passed ? "Well done!" : "Almost there!"}</h1>
        <p class="ej-screen-copy">${passed
            ? "Você concluiu o desafio Days of the Week."
            : "Você está aprendendo. Revise os dias da semana e pratique novamente."}</p>
        <div class="ej-score-summary">
            <div class="ej-summary-item"><strong>${correctAnswers}/5</strong><span>Correct answers</span></div>
            <div class="ej-summary-item"><strong>${points} XP</strong><span>Points earned</span></div>
        </div>
        ${recordError ? '<div class="ej-info-strip ej-warning-strip">O resultado precisa ser conferido no banco de dados. Consulte a mensagem exibida antes.</div>' : ""}
        <div class="ej-button-row">
            <button id="review-days-lesson" class="ej-primary-button" type="button">Review lesson <span aria-hidden="true">↻</span></button>
            <a class="ej-secondary-button" href="../index.html" target="_top">Back to EnglishJourney</a>
        </div>
    `);

    document.getElementById("review-days-lesson")?.addEventListener("click", renderLesson);
}

mountMissionLayout();

const cachedSession = getCachedMissionSession();
if (cachedSession) {
    startMission(cachedSession);
} else {
    renderLoginScreen();
}
