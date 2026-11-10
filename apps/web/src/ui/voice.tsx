import { Mic, Pause, Play, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

export function Waveform({ bars = 26, active, tone = "brand", className }: { bars?: number; active?: boolean; tone?: keyof typeof WAVE_TONES; className?: string }) {
  const heights = useMemo(() => Array.from({ length: bars }, (_, i) => 30 + ((i * 47) % 70)), [bars]);
  return (
    <span dir="ltr" className={cx("flex h-8 items-center gap-[3px] overflow-hidden", className)} aria-hidden>
      {heights.map((height, index) => (
        <span
          key={index}
          className={cx("w-[3px] shrink-0 rounded-full", WAVE_TONES[tone], active && "animate-wave")}
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

/** A voice note with its automatic transcript shown underneath. */
export function VoiceNote({ src, transcript, duration = "0:12", mine }: { src?: string | null; transcript: string | null; duration?: string; mine?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const { t } = useSettings();
  const playable = Boolean(src && /^(https?:|blob:|\/)/.test(src));

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = () => {
    if (!playable) return;
    audio.current ??= new Audio(src ?? undefined);
    audio.current.onended = () => setPlaying(false);
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      void audio.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className={cx("max-w-[86%] rounded-3xl p-3", mine ? "ms-auto bg-brand-600 text-white" : "me-auto border border-line bg-surface")}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!playable}
          aria-label={playing ? t("روکیں", "Rokein", "Pause") : t("سنیں", "Sunein", "Play")}
          className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", mine ? "bg-white/20" : "bg-brand-100 text-brand-700")}
        >
          {playing ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
        </button>
        <Waveform active={playing} tone={mine ? "white" : "brand"} className="min-w-0 flex-1" />
        <span className={cx("latin text-xs", mine ? "text-white/80" : "text-soft")}>{duration}</span>
      </div>
      {transcript && (
        <p className="mt-1 text-base">
          <Auto text={transcript} />
        </p>
      )}
    </div>
  );
}
