const VOICE_WAIT_MS = 1_200;

const urduListed = () => window.speechSynthesis.getVoices().some((voice) => voice.lang.toLowerCase().startsWith("ur"));

/** Whether Urdu can be heard here. Online the server speaks it; offline it takes a real Urdu voice on the phone, and browsers list those late. */
export function hasUrduVoice(): Promise<boolean> {
  if (navigator.onLine) return Promise.resolve(true);
  if (!("speechSynthesis" in window)) return Promise.resolve(false);
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve(urduListed());
  return new Promise((resolve) => {
    const finish = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      clearTimeout(timer);
      resolve(urduListed());
    };
    const timer = setTimeout(finish, VOICE_WAIT_MS);
    window.speechSynthesis.addEventListener("voiceschanged", finish);
  });
}

export function stopSpeaking(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
