import { useCallback, useEffect } from "react";
import { Navigate, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import type { AuthUser } from "../data";

/**
 * Going back, for the header's back button and the phone's own back gesture.
 *
 * React Router numbers each history entry (history.state.idx), so 0 means nothing
 * of this app sits behind the current page. Deep links, reloads in a new tab,
 * notifications and a cold PWA start all begin there. navigate(-1) from entry 0
 * leaves the app, or does nothing at all in an installed PWA.
 *
 * A small per-tab trail remembers what each entry shows, so a back button can
 * pop to its parent when the parent is behind it and replace itself when it is not.
 * Pushing the parent instead would make the phone's back gesture return to the child.
 */

const TRAIL_KEY = "kw.back-trail";

type Trail = Record<string, string>;

function readTrail(): Trail {
  try {
    return JSON.parse(window.sessionStorage.getItem(TRAIL_KEY) ?? "{}") as Trail;
  } catch {
    return {};
  }
}

function writeTrail(trail: Trail): void {
  try {
    window.sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail));
  } catch {
    // Without storage every back button uses its logical parent, which is still correct.
  }
}

/** This entry's position in the app's history. */
function position(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : 0;
}

const pathOf = (entry: string) => entry.split(/[?#]/)[0] ?? entry;

/** Null when nothing of this app is behind the current page. */
function previousEntry(): string | null {
  const here = position();
  return here > 0 ? (readTrail()[String(here - 1)] ?? null) : null;
}

/** Position of the page shown before the current one rendered. Kept in memory, so a reload starts fresh. */
let lastPosition: number | null = null;
let lastEntry: string | null = null;
/** True while a back press is walking past pages this person can no longer open. */
let skipping = false;

/** Rendered once inside the router. Records what each history entry shows. */
export function HistoryTrail() {
  const location = useLocation();
  const type = useNavigationType();
  const entry = location.pathname + location.search;

  useEffect(() => {
    const here = position();
    const trail = readTrail();
    // A push throws away whatever was forward of this point.
    if (type === "PUSH") {
      for (const key of Object.keys(trail)) if (Number(key) > here) delete trail[key];
    }
    trail[String(here)] = entry;
    writeTrail(trail);
    lastPosition = here;
    lastEntry = entry;
    skipping = false;
  }, [location.key, entry, type]);

  return null;
}

/**
 * For a screen with a back button. A string is that screen's parent. `true` means
 * "wherever I came from", with `fallback` when nothing is behind this page.
 */
export function useGoBack(target: true | string, fallback: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    const previous = previousEntry();
    const goal = target === true ? (previous ?? fallback) : target;
    if (previous !== null && pathOf(previous) === pathOf(goal)) navigate(-1);
    else navigate(goal, { replace: true });
  }, [target, fallback, navigate]);
}

/** Where a "go back to wherever I came from" button lands when there is no history. */
export function parentOf(pathname: string, user: AuthUser | null, home: string): string {
  if (pathname === "/app/settings") {
    if (user?.role === "worker" && user.workerId) return "/app/workers/me";
    if (user?.role === "customer" && user.hasHirerProfile) return "/app/hirers/me";
    return home;
  }
  if (/^\/app\/hirers\/[^/]+$/.test(pathname) && user?.role === "worker") return "/app/jobs";
  return home;
}

let leftKey: string | null = null;

/**
 * Sends someone away from a page they cannot open. Normally that is a redirect.
 * If the phone's back gesture landed here from the very page we would send them to,
 * the redirect would look like a dead button, so keep going back instead.
 */
export function LeaveRoute({ to }: { to: string }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  const here = position();
  const pressedBack = lastPosition !== null && here < lastPosition;
  const walkBack = pressedBack && here > 0 && (skipping || (lastEntry !== null && pathOf(lastEntry) === pathOf(to)));

  useEffect(() => {
    if (!walkBack) return;
    skipping = true;
    // React runs effects twice in development. One press must only move once.
    if (leftKey === key) return;
    leftKey = key;
    navigate(-1);
  }, [walkBack, key, navigate]);

  return walkBack ? null : <Navigate to={to} replace />;
}
