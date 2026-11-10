import scripts from "./question-voices.json";

/**
 * The pre-recorded question clips. One audio element plays them all, so a new clip
 * always ends the previous one. Nothing here starts without a tap.
 * The clips are made by scripts/generate-voices.mjs from question-voices.json.
 */

export type VoiceId = keyof typeof scripts;

export type VoiceState = { id: VoiceId; phase: "loading" | "playing" | "failed" } | null;

/** How long a clip that would not play shows its failed mark. */
const FAILED_MS = 3000;

let audio: HTMLAudioElement | null = null;
let state: VoiceState = null;
let playId = 0;
let clearFailed: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setState(next: VoiceState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function subscribeVoice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getVoiceState = (): VoiceState => state;

function player(): HTMLAudioElement {
  if (audio) return audio;
  const element = new Audio();
  element.preload = "auto";
  const current = () => (state && state.phase !== "failed" ? state.id : null);
  element.addEventListener("playing", () => {
    const id = current();
    if (id) setState({ id, phase: "playing" });
  });
  element.addEventListener("ended", () => setState(null));
  // The phone can take the sound away, for example for a call. The button must not stay on "playing".
  element.addEventListener("pause", () => {
    if (!element.ended && current()) setState(null);
  });
  audio = element;
  return element;
}

function markFailed(id: VoiceId) {
  setState({ id, phase: "failed" });
  clearTimeout(clearFailed);
  clearFailed = setTimeout(() => {
    if (state?.id === id && state.phase === "failed") setState(null);
  }, FAILED_MS);
}

export function stopVoice() {
  playId += 1;
  generatedLoading = false;
  audio?.pause();
  if (state) setState(null);
}

let generatedLoading = false;

/** Plays generated speech on the same element, so it ends the moment a clip starts, and the other way round. */
export async function playGenerated(load: () => Promise<string>): Promise<void> {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const thisPlay = ++playId;
  audio?.pause();
  if (state) setState(null);
  generatedLoading = true;
  let url: string;
  try {
    url = await load();
  } finally {
    if (thisPlay === playId) generatedLoading = false;
  }
  if (thisPlay !== playId) return;
  const element = player();
  element.src = url;
  try {
    await element.play();
  } catch (error) {
    if (thisPlay !== playId || (error instanceof DOMException && error.name === "AbortError")) return;
    throw error;
  }
}

export const isVoiceBusy = () => generatedLoading || Boolean(audio && !audio.paused && !audio.ended);

/** Starts a clip. Roman Urdu is the same speech as Urdu, so it uses the Urdu clip. */
export function playVoice(id: VoiceId, inEnglish: boolean) {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const element = player();
  const thisPlay = ++playId;
  // In this order, so the pause of the clip being replaced does not clear the new state.
  element.pause();
  setState({ id, phase: "loading" });
  element.src = `/voices/${inEnglish ? "en" : "ur"}/${id}.mp3`;
  element.play().catch((error: unknown) => {
    // An AbortError only means another tap replaced this play.
    if (thisPlay !== playId || (error instanceof DOMException && error.name === "AbortError")) return;
    markFailed(id);
  });
}

/** One button is both play and stop. */
export function toggleVoice(id: VoiceId, inEnglish: boolean) {
  if (state?.id === id && state.phase !== "failed") stopVoice();
  else playVoice(id, inEnglish);
}

const byUrdu = new Map(Object.entries(scripts).map(([id, script]) => [script.ur, id as VoiceId]));

/** The clip recorded from exactly these Urdu words, if there is one. */
export const clipForText = (text: string): VoiceId | undefined => byUrdu.get(text);

/** The clip that asks for each field on the worker sign-up. */
export const FIELD_VOICE = {
  name: "field-name",
  trade: "field-trade",
  skills: "field-skills",
  years: "field-years",
  rate: "field-rate",
  area: "field-area",
  workingHours: "field-hours",
} as const satisfies Record<string, VoiceId>;
