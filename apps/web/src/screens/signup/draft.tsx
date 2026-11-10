import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Area, LatLng, OnboardField, WorkerProfileDraft } from "../../data";
import { useSession } from "../../lib/session";
import { isValidName, isValidRate, isValidYears, toLatinDigits } from "../../lib/validate";

export type WorkerDraft = {
  name: string;
  categoryIds: string[];
  tradeText: string;
  skills: string[];
  years: string;
  rate: string;
  area: string;
  /** From the phone's GPS, only when the person chose to share it. */
  location: LatLng | null;
  workingHours: string;
  transcript: string;
  /** Which AI filled this draft, if any. Null for a fully typed sign-up. */
  aiSource: "gemini" | "jev_only" | null;
};

export type CustomerDraft = {
  name: string;
  area: string;
  address: string;
  location: LatLng | null;
  transcript: string;
  aiSource: "gemini" | "jev_only" | null;
};

/** `created` is set once the worker exists, so a reload or retry can never register them twice. */
export type AgentFor = { phone: string; name: string; created?: { workerId: string; name: string; approved: boolean } } | null;

type Stored = { owner: string | null; worker: WorkerDraft; customer: CustomerDraft; agentFor: AgentFor };

const EMPTY_WORKER: WorkerDraft = {
  name: "",
  categoryIds: [],
  tradeText: "",
  skills: [],
  years: "",
  rate: "",
  area: "",
  location: null,
  workingHours: "",
  transcript: "",
  aiSource: null,
};
const EMPTY_CUSTOMER: CustomerDraft = { name: "", area: "", address: "", location: null, transcript: "", aiSource: null };
const STORAGE_KEY = "kw.signup-draft";

const blank = (owner: string | null = null): Stored => ({ owner, worker: EMPTY_WORKER, customer: EMPTY_CUSTOMER, agentFor: null });

function load(): Stored {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return blank();
    const saved = JSON.parse(raw) as Partial<Stored>;
    return {
      owner: saved.owner ?? null,
      worker: { ...EMPTY_WORKER, ...saved.worker },
      customer: { ...EMPTY_CUSTOMER, ...saved.customer },
      agentFor: saved.agentFor ?? null,
    };
  } catch {
    return blank();
  }
}

type DraftContext = Stored & {
  patchWorker: (patch: Partial<WorkerDraft>) => void;
  patchCustomer: (patch: Partial<CustomerDraft>) => void;
  setAgentFor: (agentFor: AgentFor) => void;
  resetWorker: () => void;
  resetCustomer: () => void;
};

const Context = createContext<DraftContext | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load);
  const { user } = useSession();
  const userId = user?.id ?? null;

  // A draft belongs to whoever started it. It never carries over to the next person on this phone.
  useEffect(() => {
    if (!userId) return;
    setState((s) => (s.owner === userId ? s : s.owner === null ? { ...s, owner: userId } : blank(userId)));
  }, [userId]);

  // Kept across a reload, so moving between voice and typing never loses input.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be refused; the draft still lives in memory for this visit.
    }
  }, [state]);

  const patchWorker = useCallback((patch: Partial<WorkerDraft>) => {
    setState((s) => ({ ...s, worker: { ...s.worker, ...patch } }));
  }, []);
  const patchCustomer = useCallback((patch: Partial<CustomerDraft>) => {
    setState((s) => ({ ...s, customer: { ...s.customer, ...patch } }));
  }, []);
  const setAgentFor = useCallback((agentFor: AgentFor) => setState((s) => ({ ...s, agentFor })), []);
  const resetWorker = useCallback(() => setState((s) => ({ ...s, worker: EMPTY_WORKER })), []);
  const resetCustomer = useCallback(() => setState((s) => ({ ...s, customer: EMPTY_CUSTOMER })), []);

  const value = useMemo(
    () => ({ ...state, patchWorker, patchCustomer, setAgentFor, resetWorker, resetCustomer }),
    [state, patchWorker, patchCustomer, setAgentFor, resetWorker, resetCustomer],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDraft() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useDraft must be used inside DraftProvider");
  return ctx;
}

/** Adds what voice heard, without overwriting anything the person already gave. */
export function mergeHeard(worker: WorkerDraft, heard: WorkerProfileDraft): WorkerDraft {
  return {
    ...worker,
    name: worker.name || heard.name || "",
    categoryIds: worker.categoryIds.length ? worker.categoryIds : heard.categoryIds,
    skills: worker.skills.length ? worker.skills : heard.skills,
    years: worker.years || (heard.years?.toString() ?? ""),
    rate: worker.rate || (heard.rate?.toString() ?? ""),
    area: worker.area || heard.area || "",
    workingHours: worker.workingHours || heard.workingHours || "",
    transcript: heard.transcript,
    aiSource: heard.source,
  };
}

/** What a re-recorded answer changes. Null when the answer held nothing usable for that field. */
export function fieldPatch(field: OnboardField, heard: WorkerProfileDraft, worker: WorkerDraft): Partial<WorkerDraft> | null {
  switch (field) {
    case "name":
      return heard.name ? { name: heard.name } : null;
    case "years":
      return heard.years === null ? null : { years: String(heard.years) };
    case "rate":
      return heard.rate === null ? null : { rate: String(heard.rate) };
    case "area":
      return heard.area ? { area: heard.area, location: null } : null;
    case "workingHours":
      return heard.workingHours ? { workingHours: heard.workingHours } : null;
    case "skills":
      return heard.skills.length ? { skills: heard.skills } : null;
    case "trade": {
      if (!heard.categoryIds.length) return null;
      // Skills belong to a trade: a new trade replaces them, but saying the same trade again keeps them.
      const sameTrade = heard.categoryIds.length === worker.categoryIds.length && heard.categoryIds.every((id) => worker.categoryIds.includes(id));
      return { categoryIds: heard.categoryIds, tradeText: "", skills: sameTrade && !heard.skills.length ? worker.skills : heard.skills };
    }
  }
}

const areaKey = (text: string) =>
  toLatinDigits(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const hasPhrase = (text: string, phrase: string) => phrase !== "" && ` ${text} `.includes(` ${phrase} `);

export const sameArea = (a: string, b: string) => areaKey(a) === areaKey(b);
export const areaMatches = (query: string, area: Area) => {
  const key = areaKey(query);
  return areaKey(area.name).includes(key) || areaKey(area.nameUr).includes(key);
};

const SECTOR = /\b[d-i][\s-]{0,4}(\d{1,2})/i;

/** The server places a worker from the area name, so an unknown name needs a pick from the list or GPS. */
export function areaIsKnown(text: string, areas: Area[]): boolean {
  const wanted = areaKey(text);
  if (!wanted) return false;
  if (areas.some((a) => hasPhrase(wanted, areaKey(a.name)) || hasPhrase(wanted, areaKey(a.nameUr)))) return true;
  const sector = toLatinDigits(text).match(SECTOR);
  const number = sector ? Number(sector[1]) : 0;
  return number >= 5 && number <= 18;
}

export type DraftProblem = "name" | "trade" | "area" | "years" | "rate";

/** The same rules apply to a voice-filled and a typed profile. Pass areas to also check the area can be placed. */
export function draftProblems(worker: WorkerDraft, areas?: Area[] | null): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!isValidName(worker.name)) problems.push("name");
  if (worker.categoryIds.length === 0 && !worker.tradeText.trim()) problems.push("trade");
  if (!worker.area.trim() || (areas && !worker.location && !areaIsKnown(worker.area, areas))) problems.push("area");
  if (!isValidYears(worker.years)) problems.push("years");
  if (!isValidRate(worker.rate)) problems.push("rate");
  return problems;
}

export function hasAnyContent(worker: WorkerDraft) {
  return Boolean(worker.name || worker.categoryIds.length || worker.tradeText || worker.years || worker.rate || worker.area || worker.workingHours);
}
