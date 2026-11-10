import { openDB, type IDBPDatabase } from "idb";
import { sessionStore } from "../data/live/session-store";

const COPIES = "cache";
const QUEUE = "queue";
const NOTICES = "notices";

let connection: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  connection ??= openDB("kaamwala", 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(COPIES)) database.createObjectStore(COPIES);
      if (!database.objectStoreNames.contains(QUEUE)) database.createObjectStore(QUEUE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(NOTICES)) database.createObjectStore(NOTICES, { keyPath: "id" });
    },
    blocking(_current, _next, event) {
      (event.target as IDBDatabase).close();
      connection = null;
    },
    terminated() {
      connection = null;
    },
  }).catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

/** Saved copies belong to whoever was signed in, so a shared phone never shows one person's data to another. */
export function copyKey(key: string): string {
  return `${sessionStore.user()?.id ?? "public"}:${key}`;
}

export type Saved<T> = { value: T; savedAt: number };

/** Pass a key from copyKey, taken before the network call that produced the value. */
export async function saveCopy(scopedKey: string, value: unknown): Promise<void> {
  try {
    await (await db()).put(COPIES, { value, savedAt: Date.now() }, scopedKey);
  } catch {
    // Private windows can refuse IndexedDB; fresh data is still shown.
  }
}

export async function readCopy<T>(scopedKey: string): Promise<Saved<T> | null> {
  try {
    return ((await (await db()).get(COPIES, scopedKey)) as Saved<T> | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Removes every saved copy that does not belong to this user. */
export async function forgetCopiesExcept(userId: string | null): Promise<void> {
  try {
    const store = (await db()).transaction(COPIES, "readwrite").store;
    const keep = userId ? `${userId}:` : "public:";
    for (const key of await store.getAllKeys()) {
      if (typeof key === "string" && !key.startsWith(keep) && !key.startsWith("public:")) await store.delete(key);
    }
  } catch {
    // Nothing was saved if IndexedDB is unavailable.
  }
}

const staleValues = new WeakMap<object, number>();

/** Tags a value as having come from a saved copy rather than the server. */
export function markStale<T extends object>(value: T, savedAt: number): T {
  staleValues.set(value, savedAt);
  return value;
}

/** When the copy was saved, or null for a value that came from the server. */
export function staleSince(value: unknown): number | null {
  return typeof value === "object" && value !== null ? (staleValues.get(value) ?? null) : null;
}

export type Cached<T> = { value: T; stale: boolean; savedAt: number };

/** Load fresh data and save it; if the network fails, return the last saved copy. */
export async function cached<T>(key: string, load: () => Promise<T>): Promise<Cached<T>> {
  const scoped = copyKey(key);
  try {
    const value = await load();
    const since = staleSince(value);
    if (since !== null) return { value, stale: true, savedAt: since };
    await saveCopy(scoped, value);
    return { value, stale: false, savedAt: Date.now() };
  } catch (error) {
    const saved = await readCopy<T>(scoped);
    if (!saved) throw error;
    return { ...saved, stale: true };
  }
}

/** A persistent list of records with an `id`. Reads and writes throw when IndexedDB is unavailable. */
function records<T extends { id: string }>(store: string) {
  return {
    all: async (): Promise<T[]> => (await (await db()).getAll(store)) as T[],
    put: async (record: T): Promise<void> => {
      await (await db()).put(store, record);
    },
    remove: async (id: string): Promise<void> => {
      await (await db()).delete(store, id);
    },
  };
}

export const queueStore = <T extends { id: string }>() => records<T>(QUEUE);
export const noticeStore = <T extends { id: string }>() => records<T>(NOTICES);
