import type { AuthUser } from "../types";

const TOKEN_KEY = "kw.token";
const USER_KEY = "kw.user";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage. The sign-in then lasts for this visit only.
  }
}

function readUser(): AuthUser | null {
  try {
    const raw = read(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

let token = read(TOKEN_KEY);
let user = token ? readUser() : null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * The bearer token and the last known user, kept across reloads. The user is kept too so a
 * worker with no internet is still let in to read their saved jobs and earnings.
 */
export const sessionStore = {
  token: () => token,
  user: () => user,

  signIn(nextToken: string, nextUser: AuthUser): void {
    token = nextToken;
    user = nextUser;
    write(TOKEN_KEY, nextToken);
    write(USER_KEY, JSON.stringify(nextUser));
    notify();
  },

  setUser(nextUser: AuthUser): void {
    if (JSON.stringify(user) === JSON.stringify(nextUser)) return;
    user = nextUser;
    write(USER_KEY, JSON.stringify(nextUser));
    notify();
  },

  clear(): void {
    if (token === null && user === null) return;
    token = null;
    user = null;
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    notify();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

// Signing out in one tab signs out the others.
window.addEventListener("storage", (event) => {
  if (event.key !== TOKEN_KEY && event.key !== USER_KEY) return;
  token = read(TOKEN_KEY);
  user = token ? readUser() : null;
  notify();
});
