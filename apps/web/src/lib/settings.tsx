import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Lang = "ur" | "roman" | "en";

type Settings = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  sunlight: boolean;
  setSunlight: (on: boolean) => void;
  audioCues: boolean;
  setAudioCues: (on: boolean) => void;
  keepAwake: boolean;
  setKeepAwake: (on: boolean) => void;
  /** Whether the browser actually supports the Screen Wake Lock API. */
  wakeLockSupported: boolean;
  /** Pick the string for the current language: Urdu, Roman Urdu, English. */
  t: (ur: string, roman: string, en: string) => string;
};

const SettingsContext = createContext<Settings | null>(null);

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; settings then last for this visit only.
  }
}

function storedLang(): Lang {
  const value = read("kw.lang");
  return value === "en" || value === "roman" ? value : "ur";
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  const [sunlight, setSunlightState] = useState(() => read("kw.sunlight") === "1");
  const [audioCues, setAudioCuesState] = useState(() => read("kw.audio") !== "0");
  const [keepAwake, setKeepAwakeState] = useState(() => read("kw.awake") === "1");
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const wakeLockSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    document.documentElement.lang = lang === "ur" ? "ur" : lang === "roman" ? "ur-Latn" : "en";
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.sunlight = sunlight ? "on" : "off";
  }, [sunlight]);

  useEffect(() => {
    if (!keepAwake || !wakeLockSupported) return;
    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        wakeLock.current = sentinel;
      } catch {
        // The browser can refuse, for example on low battery. The app keeps working.
      }
    };

    // The lock drops when the tab is hidden, so take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLock.current?.release();
      wakeLock.current = null;
    };
  }, [keepAwake, wakeLockSupported]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    write("kw.lang", next);
  }, []);
  const setSunlight = useCallback((on: boolean) => {
    setSunlightState(on);
    write("kw.sunlight", on ? "1" : "0");
  }, []);
  const setAudioCues = useCallback((on: boolean) => {
    setAudioCuesState(on);
    write("kw.audio", on ? "1" : "0");
  }, []);
  const setKeepAwake = useCallback((on: boolean) => {
    setKeepAwakeState(on);
    write("kw.awake", on ? "1" : "0");
  }, []);

  const value = useMemo<Settings>(
    () => ({
      lang,
      setLang,
      sunlight,
      setSunlight,
      audioCues,
      setAudioCues,
      keepAwake,
      setKeepAwake,
      wakeLockSupported,
      t: (ur, roman, en) => (lang === "ur" ? ur : lang === "roman" ? roman : en),
    }),
    [lang, setLang, sunlight, setSunlight, audioCues, setAudioCues, keepAwake, setKeepAwake, wakeLockSupported],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
