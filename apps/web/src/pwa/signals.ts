/**
 * The data layer and the screens need to tell each other a little, but the UI code imports the
 * data layer, so these live apart to keep that one-way.
 */

let endpoint: string | null = null;

/** The push endpoint this phone registered, known ahead of time so signing out can stay synchronous. */
export const pushEndpoint = {
  get: () => endpoint,
  set: (next: string | null) => {
    endpoint = next;
  },
};

const askListeners = new Set<() => void>();

/** Something just happened that makes notifications obviously useful, such as posting a job. */
export function askForPushSoon(): void {
  for (const listener of askListeners) listener();
}

export function onPushAskWanted(listener: () => void): () => void {
  askListeners.add(listener);
  return () => {
    askListeners.delete(listener);
  };
}
