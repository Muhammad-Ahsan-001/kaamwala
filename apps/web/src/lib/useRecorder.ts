import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "denied" | "unsupported";

const MAX_SECONDS = 90;

/** Record from the microphone. Permission problems are reported, never thrown. */
export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const resolveStop = useRef<((blob: Blob | null) => void) | null>(null);

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void context.current?.close();
    context.current = null;
    setAnalyser(null);
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const active = recorder.current;
        if (!active || active.state === "inactive") {
          resolve(null);
          return;
        }
        resolveStop.current = resolve;
        active.stop();
      }),
    [],
  );

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("unsupported");
      return false;
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = mic;
      chunks.current = [];

      // Real input levels drive the on-screen waveform.
      if (window.AudioContext) {
        const audio = new AudioContext();
        const node = audio.createAnalyser();
        node.fftSize = 128;
        node.smoothingTimeConstant = 0.72;
        audio.createMediaStreamSource(mic).connect(node);
        context.current = audio;
        setAnalyser(node);
      }

      const media = new MediaRecorder(mic);
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      media.onstop = () => {
        releaseMic();
        setStatus("idle");
        const blob = chunks.current.length ? new Blob(chunks.current, { type: media.mimeType }) : null;
        resolveStop.current?.(blob);
        resolveStop.current = null;
      };
      recorder.current = media;
      media.start();
      setSeconds(0);
      setStatus("recording");
      return true;
    } catch {
      releaseMic();
      setStatus("denied");
      return false;
    }
  }, [releaseMic]);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "recording" && seconds >= MAX_SECONDS) void stop();
  }, [status, seconds, stop]);

  // Never leave the microphone open after leaving a screen.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      releaseMic();
    },
    [releaseMic],
  );

  return { status, seconds, analyser, start, stop };
}

export function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
