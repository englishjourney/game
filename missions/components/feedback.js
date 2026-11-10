// Efeitos sonoros compartilhados de feedback para todas as missões.
// Use playAnswerSound(true) para acerto e playAnswerSound(false) para erro.
// Os sons são sintetizados localmente com Web Audio: não dependem de arquivos externos.
let sharedAudioContext = null;

function getSharedAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!sharedAudioContext) {
        sharedAudioContext = new AudioContextClass();
    }

    if (sharedAudioContext.state === "suspended") {
        sharedAudioContext.resume().catch(function() {
            // Alguns navegadores podem bloquear áudio até uma interação do usuário.
        });
    }

    return sharedAudioContext;
}

export function playAnswerSound(isCorrect) {
    try {
        const context = getSharedAudioContext();
        if (!context) return false;

        const notes = isCorrect
            ? [
                { frequency: 523.25, delay: 0 },
                { frequency: 659.25, delay: 0.11 },
                { frequency: 783.99, delay: 0.22 }
            ]
            : [
                { frequency: 293.66, delay: 0 },
                { frequency: 220, delay: 0.15 }
            ];

        const peakGain = isCorrect ? 0.12 : 0.09;
        const duration = 0.14;
        const startTime = context.currentTime + 0.01;

        notes.forEach(function(note) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const noteStart = startTime + note.delay;

            oscillator.type = isCorrect ? "sine" : "triangle";
            oscillator.frequency.setValueAtTime(note.frequency, noteStart);

            gain.gain.setValueAtTime(0.0001, noteStart);
            gain.gain.exponentialRampToValueAtTime(peakGain, noteStart + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);

            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(noteStart);
            oscillator.stop(noteStart + duration + 0.01);
        });

        return true;
    } catch (error) {
        console.warn("Não foi possível reproduzir o efeito sonoro da resposta.", error);
        return false;
    }
}
