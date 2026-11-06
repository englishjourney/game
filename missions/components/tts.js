// Google Translate TTS compartilhado pelas missões.
let activeAudio = null;
let isAudioLoading = false;

export async function playGoogleTTS(text) {
    const phrase = String(text || "").trim();
    if (!phrase || isAudioLoading) return false;

    isAudioLoading = true;

    try {
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.currentTime = 0;
        }

        const url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q="
            + encodeURIComponent(phrase);

        const audio = new Audio(url);
        audio.preload = "auto";
        activeAudio = audio;

        await audio.play();
        return true;
    } catch (error) {
        console.warn("Google Translate TTS indisponível; usando voz do navegador.", error);

        if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(phrase);
            utterance.lang = "en-US";
            window.speechSynthesis.speak(utterance);
            return false;
        }

        throw error;
    } finally {
        isAudioLoading = false;
    }
}
