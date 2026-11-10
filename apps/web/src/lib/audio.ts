/**
 * Feedback for people who may not read comfortably: a tone, a short vibration,
 * and spoken Urdu when the phone has a suitable voice.
 */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const TONES = {
  tap: [660],
  up: [523, 784],
  down: [784, 523],
  success: [523, 659, 784],
} as const;

const VIBRATION: Record<keyof typeof TONES, number | number[]> = {
  tap: 12,
  up: 18,
  down: 18,
  success: [18, 40, 28],
};

export type Cue = keyof typeof TONES;

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

function playTone(kind: Cue) {
  const audio = audioContext();
  if (!audio) return;
  TONES[kind].forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.11;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.22);
  });
}

/** Haptics always fire where supported; the tone follows the audio-cues setting. */
export function cue(kind: Cue, audioEnabled = true) {
  vibrate(VIBRATION[kind]);
  if (audioEnabled) playTone(kind);
}

/** Speak Urdu text if the phone has a suitable voice. Returns false when it cannot. */
export function speakUrdu(text: string, enabled = true): boolean {
  if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ur"));
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ur-PK";
  utterance.rate = 0.95;
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}
