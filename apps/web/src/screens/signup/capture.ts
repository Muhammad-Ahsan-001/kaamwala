import { useCallback, useEffect, useRef, useState } from "react";
import { isSpeaking, speakNow } from "../../lib/audio";
import { stopVoice } from "../../lib/question-voices";
import { useRecorder } from "../../lib/useRecorder";

/** Shorter than this is a slip of the finger, and is not worth sending to the AI. */
const MIN_RECORDING_MS = 800;
/** Below the recorder's own limit, so a long answer is still read instead of being dropped. */
export const MAX_RECORDING_SECONDS = 60;

/** One recording at a time: start it with what to do with the audio, and stop it by tap or at the time limit. */
export function useVoiceCapture() {
  const { status, seconds, analyser, start: openMic, stop: closeMic } = useRecorder();
  const [working, setWorking] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const onAudio = useRef<((audio: Blob) => Promise<void>) | null>(null);
  const startedAt = useRef(0);
  const stopping = useRef(false);
  const wasRecording = useRef(false);

  const stop = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    const audio = await closeMic();
    stopping.current = false;
    const run = onAudio.current;
    onAudio.current = null;
    if (!audio || !run) return;
    if (Date.now() - startedAt.current < MIN_RECORDING_MS) {
      setTooShort(true);
      return;
    }
    setWorking(true);
    try {
      await run(audio);
    } finally {
      setWorking(false);
    }
  }, [closeMic]);

  const start = useCallback(
    async (handler: (audio: Blob) => Promise<void>) => {
      setTooShort(false);
      setInterrupted(false);
      onAudio.current = handler;
      const opened = await openMic();
      if (!opened) onAudio.current = null;
      startedAt.current = Date.now();
      return opened;
    },
    [openMic],
  );

  useEffect(() => {
    if (status === "recording" && seconds >= MAX_RECORDING_SECONDS) void stop();
  }, [status, seconds, stop]);

  // The microphone can end by itself, for example when a call comes in. That speech is gone, so say so.
  useEffect(() => {
    if (wasRecording.current && status !== "recording" && !stopping.current && onAudio.current) {
      onAudio.current = null;
      setInterrupted(true);
    }
    wasRecording.current = status === "recording";
  }, [status]);

  return {
    recording: status === "recording",
    working,
    busy: status === "recording" || working,
    blocked: status === "denied" || status === "unsupported",
    tooShort,
    interrupted,
    seconds,
    analyser,
    start,
    stop,
  };
}

/** Spoken Urdu with honest state: `noVoice` becomes true only when nothing could be heard. */
export function useSpeech() {
  const [noVoice, setNoVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const say = useCallback(
    (text: string) => {
      setSpeaking(true);
      setNoVoice(false);
      clear();
      void speakNow(text, true).then((heard) => {
        if (!heard) {
          setNoVoice(true);
          setSpeaking(false);
          return;
        }
        clear();
        timer.current = setInterval(() => {
          if (isSpeaking()) return;
          setSpeaking(false);
          clear();
        }, 250);
      });
    },
    [clear],
  );

  useEffect(
    () => () => {
      clear();
      stopVoice();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [clear],
  );

  return { noVoice, speaking, say };
}
