import { openDB } from "idb";

const db = () =>
  openDB("kaamwala", 1, {
    upgrade(database) {
      database.createObjectStore("cache");
    },
  });

export type Cached<T> = { value: T; stale: boolean; savedAt: number };

/** Load fresh data and save it; if the network fails, return the last saved copy. */
export async function cached<T>(key: string, load: () => Promise<T>): Promise<Cached<T>> {
  try {
    const value = await load();
    try {
      await (await db()).put("cache", { value, savedAt: Date.now() }, key);
    } catch {
      // Private windows can refuse IndexedDB; fresh data is still shown.
    }
    return { value, stale: false, savedAt: Date.now() };
  } catch (error) {
    const saved = (await (await db()).get("cache", key)) as { value: T; savedAt: number } | undefined;
    if (!saved) throw error;
    return { ...saved, stale: true };
  }
}
