/**
 * Feedback for people who may not read comfortably: a tone, a short vibration,
 * and spoken Urdu when the phone has a suitable voice.
 */

import { data } from "../data";
import { clipForText, isVoiceBusy, playGenerated, toggleVoice } from "./question-voices";

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

function speakWithPhone(text: string): boolean {
  if (!("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ur"));
  // A phone with no Urdu voice would read this in English, which is worse than silence.
  if (!voice) return false;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ur-PK";
  utterance.rate = 0.95;
  utterance.voice = voice;
  synth.speak(utterance);
  return true;
}

/** Lines already generated, so hearing one again is instant and costs nothing. */
const generated = new Map<string, string>();

/** Speaks Urdu: a recording if there is one, then generated speech, then a real Urdu voice on the phone. False means nothing could be heard. */
export async function speakNow(text: string, enabled = true): Promise<boolean> {
  if (!enabled || typeof window === "undefined" || !text) return false;
  const clip = clipForText(text);
  if (clip) {
    toggleVoice(clip, document.documentElement.lang === "en");
    return true;
  }
  try {
    await playGenerated(async () => {
      const known = generated.get(text);
      if (known) return known;
      const url = URL.createObjectURL(await data.speak(text));
      generated.set(text, url);
      return url;
    });
    return true;
  } catch {
    return speakWithPhone(text);
  }
}

export function speakUrdu(text: string, enabled = true): boolean {
  if (!enabled || typeof window === "undefined" || !text) return false;
  void speakNow(text, true);
  return true;
}

export function isSpeaking(): boolean {
  return isVoiceBusy() || ("speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending));
}
