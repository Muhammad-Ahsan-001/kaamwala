import { AlertCircle, LoaderCircle, Mic, Pause, Play, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clock } from "../lib/useRecorder";
import { useSettings } from "../lib/settings";
import { Auto, cx } from "./primitives";

export function BigMic({ recording, onClick, size = 104, label, disabled }: { recording: boolean; onClick: () => void; size?: number; label: string; disabled?: boolean }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size * 1.4, height: size * 1.4 }}>
      {recording && (
        <>
          <span className="absolute rounded-full bg-busy-100" style={{ width: size * 1.36, height: size * 1.36 }} aria-hidden />
          <span className="absolute animate-ring rounded-full bg-busy-500/25" style={{ width: size, height: size }} aria-hidden />
        </>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={recording}
        style={{ width: size, height: size }}
        className={cx("relative flex items-center justify-center rounded-full text-white shadow-lift transition active:scale-95 disabled:opacity-50", recording ? "bg-busy-500" : "bg-brand-600")}
      >
        {recording ? <Square style={{ width: size * 0.3, height: size * 0.3 }} className="fill-current" aria-hidden /> : <Mic style={{ width: size * 0.42, height: size * 0.42 }} aria-hidden />}
      </button>
    </div>
  );
}

const WAVE_TONES = { brand: "bg-brand-500", busy: "bg-busy-500", white: "bg-white" };

/** Bars are decorative. With `progress` (0 to 1) they show how much of a note has really been played. */
export function Waveform({ bars = 26, active, tone = "brand", className, progress }: { bars?: number; active?: boolean; tone?: keyof typeof WAVE_TONES; className?: string; progress?: number }) {
  const heights = useMemo(() => Array.from({ length: bars }, (_, i) => 30 + ((i * 47) % 70)), [bars]);
  return (
    <span dir="ltr" className={cx("flex h-8 items-center gap-[3px] overflow-hidden", className)} aria-hidden>
      {heights.map((height, index) => (
        <span
          key={index}
          className={cx("w-[3px] shrink-0 rounded-full", WAVE_TONES[tone], progress === undefined && active && "animate-wave", progress !== undefined && index / bars >= progress && "opacity-40")}
          style={{ height: `${height}%`, animationDelay: `${index * 45}ms`, transformOrigin: "center" }}
        />
      ))}
    </span>
  );
}

/** Bars driven by real microphone levels. Writes to the DOM directly so it stays smooth on cheap phones. */
export function LiveWave({ analyser, bars = 30, tone = "busy", className }: { analyser: AnalyserNode | null; bars?: number; tone?: keyof typeof WAVE_TONES; className?: string }) {
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element || !analyser) return;
    const spans = Array.from(element.children) as HTMLElement[];
    const levels = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 33) return;
      last = now;
      analyser.getByteFrequencyData(levels);
      const middle = (spans.length - 1) / 2;
      spans.forEach((span, index) => {
        const bin = Math.floor((Math.abs(index - middle) / middle) * levels.length * 0.6);
        span.style.transform = `scaleY(${Math.max(0.1, (levels[bin] ?? 0) / 255)})`;
      });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);

  return (
    <span ref={root} dir="ltr" className={cx("flex h-10 items-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: bars }, (_, index) => (
        <span key={index} className={cx("h-full w-[3px] shrink-0 rounded-full", WAVE_TONES[tone])} style={{ transform: "scaleY(0.1)", transformOrigin: "center" }} />
      ))}
    </span>
  );
}

/** Reveal a transcript word by word as it arrives. */
export function Typewriter({ text }: { text: string }) {
  const words = useMemo(() => text.split(" "), [text]);
  const [shown, setShown] = useState(0);

  useEffect(() => setShown(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? words.length : 0), [text, words.length]);
  useEffect(() => {
    if (shown >= words.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), 70);
    return () => clearTimeout(timer);
  }, [shown, words]);

  return <Auto text={words.slice(0, shown).join(" ")} />;
}

/** Only one note plays at a time. */
let nowPlaying: HTMLAudioElement | null = null;

/** Finds a recording's real length. Files from MediaRecorder only state it once the end has been seeked to. */
function readDuration(url: string, done: (seconds: number) => void): () => void {
  const probe = new Audio();
  probe.preload = "metadata";
  const stop = () => {
    probe.onloadedmetadata = null;
    probe.ondurationchange = null;
    probe.removeAttribute("src");
    probe.load();
  };
  const report = () => {
    if (Number.isFinite(probe.duration) && probe.duration > 0) {
      done(probe.duration);
      stop();
    }
  };
  probe.onloadedmetadata = () => {
    if (Number.isFinite(probe.duration)) report();
    else probe.currentTime = 1e7;
  };
  probe.ondurationchange = report;
  probe.src = url;
  return stop;
}

type PlayState = "idle" | "loading" | "playing" | "failed";

/** "pending" while a transcript may still arrive, "none" when no transcript was made. */
export type TranscriptState = "pending" | "none";

/**
 * A voice note with its automatic transcript shown underneath.
 * onExpired fetches a new link when the signed one has stopped working.
 */
export function VoiceNote({
  src,
  transcript,
  transcriptState,
  mine,
  onExpired,
  sending,
  meta,
}: {
  src?: string | null;
  transcript: string | null;
  transcriptState?: TranscriptState;
  mine?: boolean;
  onExpired?: () => Promise<string | null>;
  sending?: boolean;
  meta?: ReactNode;
}) {
  const { t } = useSettings();
  const [state, setState] = useState<PlayState>("idle");
  const [duration, setDuration] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const retried = useRef(false);
  const latest = useRef({ src, onExpired });
  latest.current = { src, onExpired };
  const playable = Boolean(src && /^(https?:|blob:|\/)/.test(src));

  useEffect(() => {
    if (!playable || !latest.current.src) return;
    return readDuration(latest.current.src, setDuration);
  }, [playable]);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (nowPlaying === audio.current) nowPlaying = null;
    },
    [],
  );

  const begin = (element: HTMLAudioElement) => {
    if (nowPlaying && nowPlaying !== element) nowPlaying.pause();
    nowPlaying = element;
    setState("loading");
    element.play().catch((error: unknown) => {
      // A broken or expired link arrives through onerror. Only a blocked play lands here.
      if (error instanceof DOMException && error.name === "NotAllowedError") setState("idle");
    });
  };

  const build = (url: string) => {
    const element = new Audio(url);
    element.onplaying = () => setState("playing");
    element.onpause = () => setState((now) => (now === "failed" ? now : "idle"));
    element.onended = () => {
      setState("idle");
      setPosition(0);
    };
    element.ontimeupdate = () => setPosition(element.currentTime);
    element.ondurationchange = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) setDuration(element.duration);
    };
    element.onerror = () => {
      const refresh = latest.current.onExpired;
      if (retried.current || !refresh) {
        setState("failed");
        return;
      }
      retried.current = true;
      refresh().then(
        (fresh) => {
          if (!fresh) {
            setState("failed");
            return;
          }
          element.src = fresh;
          begin(element);
        },
        () => setState("failed"),
      );
    };
    return element;
  };

  const toggle = () => {
    if (!playable || !src) return;
    audio.current ??= build(src);
    if (state === "playing") {
      audio.current.pause();
      return;
    }
    retried.current = false;
    if (state === "failed") audio.current.src = src;
    begin(audio.current);
  };

  const shownTime = state === "playing" ? clock(Math.floor(position)) : duration !== null ? clock(Math.max(1, Math.round(duration))) : null;

  return (
    <div className={cx("w-fit max-w-[86%] rounded-3xl p-3", mine ? "ms-auto bg-brand-600 text-white" : "me-auto border border-line bg-surface")}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!playable}
          aria-label={state === "playing" ? t("روکیں", "Rokein", "Pause") : t("سنیں", "Sunein", "Play")}
          className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50", mine ? "bg-white/20" : "bg-brand-100 text-brand-700")}
        >
          {state === "loading" ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : state === "playing" ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
        </button>
        <Waveform active={state === "playing"} progress={duration ? Math.min(1, position / duration) : undefined} tone={mine ? "white" : "brand"} className="min-w-0 flex-1" />
        {sending ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin opacity-80" aria-label={t("بھیج رہے ہیں", "Bhej rahe hain", "Sending")} /> : shownTime && <span className={cx("latin shrink-0 text-xs", mine ? "text-white/80" : "text-soft")}>{shownTime}</span>}
      </div>
      {state === "failed" && (
        <p className={cx("mt-1 flex items-center gap-1 text-sm font-semibold", mine ? "text-white" : "text-busy-700")}>
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {t("آواز نہیں چل سکی", "Awaz nahi chal saki", "This note could not be played")}
        </p>
      )}
      {transcript ? (
        <p className="mt-1 break-words text-base">
          <Auto text={transcript} />
        </p>
      ) : transcriptState === "pending" ? (
        <p className={cx("mt-1 flex items-center gap-1 text-sm", mine ? "text-white/80" : "text-soft")}>
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          {t("لکھائی بن رہی ہے…", "Likhai ban rahi hai…", "Transcribing…")}
        </p>
      ) : transcriptState === "none" ? (
        <p className={cx("mt-1 text-sm", mine ? "text-white/80" : "text-soft")}>{t("اس نوٹ کی لکھائی نہیں بن سکی", "Is note ki likhai nahi ban saki", "No transcript for this note")}</p>
      ) : null}
      {meta && <div className={cx("mt-0.5 text-xs", mine ? "text-white/80" : "text-soft")}>{meta}</div>}
    </div>
  );
}

/** A typed message in the same thread as the voice notes. */
export function TextBubble({ text, mine, meta }: { text: string; mine?: boolean; meta?: ReactNode }) {
  return (
    <div className={cx("w-fit max-w-[86%] rounded-3xl px-4 py-2", mine ? "ms-auto bg-brand-600 text-white" : "me-auto border border-line bg-surface")}>
      <p className="break-words text-base">
        <Auto text={text} />
      </p>
      {meta && <div className={cx("text-xs", mine ? "text-white/80" : "text-soft")}>{meta}</div>}
    </div>
  );
}
