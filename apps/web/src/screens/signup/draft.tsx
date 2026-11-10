import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkerProfileDraft } from "../../data";
import { isValidName, isValidRate, isValidYears } from "../../lib/validate";

export type WorkerDraft = {
  name: string;
  categoryIds: string[];
  tradeText: string;
  skills: string[];
  years: string;
  rate: string;
  area: string;
  workingHours: string;
  transcript: string;
  /** Which AI filled this draft, if any. Null for a fully typed sign-up. */
  aiSource: "gemini" | "jev_only" | null;
};

export type CustomerDraft = { name: string; area: string; address: string };
export type AgentFor = { phone: string; name: string } | null;

type Stored = { worker: WorkerDraft; customer: CustomerDraft; agentFor: AgentFor };

const EMPTY_WORKER: WorkerDraft = {
  name: "",
  categoryIds: [],
  tradeText: "",
  skills: [],
  years: "",
  rate: "",
  area: "",
  workingHours: "",
  transcript: "",
  aiSource: null,
};
const EMPTY_CUSTOMER: CustomerDraft = { name: "", area: "", address: "" };
const STORAGE_KEY = "kw.signup-draft";

function load(): Stored {
  const fallback: Stored = { worker: EMPTY_WORKER, customer: EMPTY_CUSTOMER, agentFor: null };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Stored>) } : fallback;
  } catch {
    return fallback;
  }
}

type DraftContext = Stored & {
  patchWorker: (patch: Partial<WorkerDraft>) => void;
  patchCustomer: (patch: Partial<CustomerDraft>) => void;
  setAgentFor: (agentFor: AgentFor) => void;
  /** Add what voice heard, without overwriting anything the user already typed. */
  mergeVoiceDraft: (heard: WorkerProfileDraft) => void;
  resetWorker: () => void;
  resetCustomer: () => void;
};

const Context = createContext<DraftContext | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load);

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

  const mergeVoiceDraft = useCallback((heard: WorkerProfileDraft) => {
    setState((s) => {
      const w = s.worker;
      return {
        ...s,
        worker: {
          ...w,
          name: w.name || heard.name || "",
          categoryIds: w.categoryIds.length ? w.categoryIds : heard.categoryIds,
          skills: w.skills.length ? w.skills : heard.skills,
          years: w.years || (heard.years?.toString() ?? ""),
          rate: w.rate || (heard.rate?.toString() ?? ""),
          area: w.area || heard.area || "",
          workingHours: w.workingHours || heard.workingHours || "",
          transcript: heard.transcript,
          aiSource: heard.source,
        },
      };
    });
  }, []);

  const value = useMemo(
    () => ({ ...state, patchWorker, patchCustomer, setAgentFor, mergeVoiceDraft, resetWorker, resetCustomer }),
    [state, patchWorker, patchCustomer, setAgentFor, mergeVoiceDraft, resetWorker, resetCustomer],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDraft() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useDraft must be used inside DraftProvider");
  return ctx;
}

export type DraftProblem = "name" | "trade" | "area" | "years" | "rate";

/** The same rules apply to a voice-filled and a typed profile. */
export function draftProblems(worker: WorkerDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!isValidName(worker.name)) problems.push("name");
  if (worker.categoryIds.length === 0 && !worker.tradeText.trim()) problems.push("trade");
  if (!worker.area.trim()) problems.push("area");
  if (!isValidYears(worker.years)) problems.push("years");
  if (!isValidRate(worker.rate)) problems.push("rate");
  return problems;
}

export function hasAnyContent(worker: WorkerDraft) {
  return Boolean(worker.name || worker.categoryIds.length || worker.tradeText || worker.years || worker.rate || worker.area || worker.workingHours);
}
