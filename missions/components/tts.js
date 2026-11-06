// Google Translate TTS compartilhado pelas missões.
let activeAudio = null;

export async function playGoogleTTS(text) {
    const phrase = String(text || "").trim();
    if (!phrase) return;

    if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
    }

    const url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q="
        + encodeURIComponent(phrase);

    activeAudio = new Audio(url);
    activeAudio.preload = "auto";

    try {
        await activeAudio.play();
    } catch (error) {
        console.warn("Google Translate TTS indisponível; usando voz do navegador.", error);
        if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(phrase);
            utterance.lang = "en-US";
            window.speechSynthesis.speak(utterance);
        }
    }
}
