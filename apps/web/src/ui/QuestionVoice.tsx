import { LoaderCircle, Square, Volume2, VolumeX } from "lucide-react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getVoiceState, stopVoice, subscribeVoice, toggleVoice, type VoiceId } from "../lib/question-voices";
import { useSettings } from "../lib/settings";
import { cx } from "./primitives";

const TONES = {
  brand: { idle: "bg-brand-100 text-brand-700", active: "bg-brand-600 text-white ring-2 ring-brand-200" },
  // On the coloured status card.
  onColor: { idle: "bg-white/20 text-white", active: "bg-white text-ink ring-2 ring-white/50" },
};

/** The question spoken aloud, for someone who may not read it comfortably. Plays only when tapped. */
export function QuestionVoice({ id, tone = "brand", className }: { id: VoiceId; tone?: keyof typeof TONES; className?: string }) {
  const { t, lang } = useSettings();
  const state = useSyncExternalStore(subscribeVoice, getVoiceState);
  const phase = state?.id === id ? state.phase : null;
  const active = phase === "loading" || phase === "playing";

  // The clip belongs to the question on screen: it ends when the question goes or the language changes.
  useEffect(
    () => () => {
      if (getVoiceState()?.id === id) stopVoice();
    },
    [id, lang],
  );

  const label = phase === "failed" ? t("آواز نہیں چل سکی", "Awaz nahi chal saki", "Could not play the sound") : active ? t("آواز روکیں", "Awaz rokein", "Stop the sound") : t("سوال سنیں", "Sawal sunein", "Listen to the question");
  const Icon = phase === "failed" ? VolumeX : phase === "loading" ? LoaderCircle : phase === "playing" ? Square : Volume2;

  return (
    <button
      type="button"
      data-voice={id}
      data-voice-state={phase ?? "idle"}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => toggleVoice(id, lang === "en")}
      className={cx("flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full transition active:scale-95", active ? TONES[tone].active : TONES[tone].idle, phase === "failed" && "text-busy-700", className)}
    >
      <Icon className={cx("h-6 w-6", phase === "loading" && "animate-spin", phase === "playing" && "fill-current")} aria-hidden />
    </button>
  );
}

/** A question with its play button at the end of the line. */
export function Asked({ voice, tone, className, children }: { voice: VoiceId; tone?: keyof typeof TONES; className?: string; children: ReactNode }) {
  return (
    <div className={cx("flex items-center justify-between gap-2", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      <QuestionVoice id={voice} tone={tone} />
    </div>
  );
}
