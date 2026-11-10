/// <reference lib="webworker" />

/**
 * The service worker. It does four things and nothing else:
 *   1. keeps the app shell on the phone so the app opens with no internet,
 *   2. keeps recent map tiles,
 *   3. shows push notifications and opens the right screen when one is tapped,
 *   4. takes a new version when the page says the person agreed.
 * API responses and uploaded files are never answered from here.
 */

type PrecacheEntry = { url: string; revision: string | null };

declare const self: ServiceWorkerGlobalScope & typeof globalThis & { __WB_MANIFEST: PrecacheEntry[] };

const SHELL_CACHE = "kw-shell-v1";
const TILE_CACHE = "kw-tiles-v1";
/** Clips are kept under their own name, so bump this when any is re-recorded. */
const VOICE_CACHE = "kw-voices-v1";
const MAX_TILES = 300;
const TILE_HOST = "https://tile.openstreetmap.org";

/** Same-origin paths that belong to the API, should it ever share the web app's domain. */
const NEVER_CACHED = /^\/(v1|uploads|healthz)(\/|$)/;

/** Path -> cache key. A file without a hash in its name carries its revision in the key. */
const precache = new Map<string, string>();
for (const { url, revision } of self.__WB_MANIFEST) {
  const { pathname } = new URL(url, self.location.origin);
  precache.set(pathname, revision ? `${pathname}?__rev=${revision}` : pathname);
}

const keyOf = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname + url.search;
};

/** Some static hosts redirect /index.html to /. A navigation may not be answered with a redirected response. */
async function withoutRedirect(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const have = new Set((await cache.keys()).map(keyOf));
      await Promise.all(
        [...precache].map(async ([path, key]) => {
          if (have.has(key)) return;
          const response = await fetch(path, { cache: "reload" });
          if (!response.ok) throw new Error(`Could not store ${path}: ${response.status}`);
          await cache.put(key, await withoutRedirect(response));
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Anything else here is from an older version of the app.
      for (const name of await caches.keys()) {
        if (name !== SHELL_CACHE && name !== TILE_CACHE && name !== VOICE_CACHE) await caches.delete(name);
      }
      const cache = await caches.open(SHELL_CACHE);
      const wanted = new Set(precache.values());
      for (const request of await cache.keys()) {
        if (!wanted.has(keyOf(request))) await cache.delete(request);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});

async function fromPrecache(key: string, request: Request): Promise<Response> {
  return (await caches.match(key, { cacheName: SHELL_CACHE })) ?? fetch(request);
}

async function trimTiles(cache: Cache): Promise<void> {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_TILES)).map((key) => cache.delete(key)));
}

/** Show the saved tile at once and refresh it behind the scenes. */
async function tile(event: FetchEvent): Promise<Response> {
  const url = event.request.url;
  const cache = await caches.open(TILE_CACHE);
  const saved = await cache.match(url);
  // A CORS fetch rather than the map's no-cors one, because an opaque response costs megabytes of quota.
  const fresh = fetch(url, { mode: "cors", credentials: "omit" }).then(async (response) => {
    if (response.ok) {
      await cache.put(url, response.clone());
      await trimTiles(cache);
    }
    return response;
  });
  if (saved) {
    event.waitUntil(fresh.catch(() => undefined));
    return saved;
  }
  return fresh;
}

/**
 * A question clip, saved the first time it plays. Audio players ask for byte ranges and a
 * partial response cannot be stored, so the whole file is fetched and the range cut from it.
 */
async function voiceClip(path: string, range: string | null): Promise<Response> {
  const cache = await caches.open(VOICE_CACHE);
  let clip = await cache.match(path);
  if (!clip) {
    const fresh = await fetch(path);
    // Some hosts answer a missing file with the app's own page, which must not be saved as audio.
    if (!fresh.ok || !fresh.headers.get("content-type")?.includes("audio")) return fresh;
    await cache.put(path, fresh.clone());
    clip = fresh;
  }
  const wanted = range?.match(/^bytes=(\d+)-(\d*)$/);
  if (!wanted) return clip;
  const body = await clip.blob();
  const start = Number(wanted[1]);
  const end = wanted[2] ? Math.min(Number(wanted[2]), body.size - 1) : body.size - 1;
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${body.size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === TILE_HOST) {
    event.respondWith(tile(event));
    return;
  }
  if (url.origin !== self.location.origin || NEVER_CACHED.test(url.pathname)) return;

  if (url.pathname.startsWith("/voices/")) {
    event.respondWith(voiceClip(url.pathname, request.headers.get("range")));
    return;
  }

  if (request.mode === "navigate") {
    const shell = precache.get("/index.html");
    if (shell) event.respondWith(fromPrecache(shell, request));
    return;
  }
  const key = precache.get(url.pathname);
  if (key) event.respondWith(fromPrecache(key, request));
});

type PushContent = { title: string; body: string; url: string; tag?: string };

/** Only a path inside this app may be opened from a notification. */
const safePath = (url: unknown): string => (typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/app");

function readPush(event: PushEvent): PushContent {
  let payload: Partial<PushContent> = {};
  try {
    payload = (event.data?.json() ?? {}) as Partial<PushContent>;
  } catch {
    // Unreadable payload: the browser still requires a notification, so show the plain one.
  }
  return {
    title: payload.title || "کام والا",
    body: payload.body || "نئی اطلاع",
    url: safePath(payload.url),
    ...(payload.tag ? { tag: payload.tag } : {}),
  };
}

self.addEventListener("push", (event) => {
  const { title, body, url, tag } = readPush(event);
  // vibrate and renotify are real options that TypeScript's lib no longer lists.
  const options: NotificationOptions & { vibrate: number[]; renotify: boolean } = {
    body,
    data: { url },
    dir: "rtl",
    lang: "ur",
    icon: "/icons/icon-192.png",
    vibrate: [180, 80, 180],
    renotify: tag !== undefined,
    ...(tag ? { tag } : {}),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePath((event.notification.data as { url?: unknown } | null)?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // An open app moves there without a reload, so nothing on screen is lost.
        open.postMessage({ type: "kw-navigate", url });
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser replaced the subscription. Any open app sends the new one to the server.
self.addEventListener("pushsubscriptionchange", (event) => {
  (event as ExtendableEvent).waitUntil(
    (async () => {
      for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
        client.postMessage({ type: "kw-push-changed" });
      }
    })(),
  );
});

export {};
