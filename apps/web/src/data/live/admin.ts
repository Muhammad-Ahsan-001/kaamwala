import type { DataApi } from "../api";
import type { AdminDispute, AdminStats, AdminWorkerRow, AgentLedgerEntry, AgentLedgerSummary, AppSettings, Job } from "../types";
import { orNull, request } from "./http";

export const adminApi: Pick<
  DataApi,
  | "adminStats"
  | "adminWorkers"
  | "adminJobs"
  | "adminDisputes"
  | "adminResolveDispute"
  | "adminSetWorkerState"
  | "adminGetSettings"
  | "adminSaveSettings"
  | "adminAgents"
  | "adminAgentLedger"
  | "adminAddAgent"
> = {
  adminStats: () => request<AdminStats>("GET", "/admin/stats"),
  adminWorkers: async () => (await request<{ items: AdminWorkerRow[] }>("GET", "/admin/workers")).items,
  adminJobs: async () => (await request<{ items: Job[] }>("GET", "/admin/jobs")).items,
  adminDisputes: async () => (await request<{ items: AdminDispute[] }>("GET", "/admin/disputes")).items,
  adminResolveDispute: (jobId, resolution) => request<Job>("POST", `/admin/disputes/${jobId}/resolve`, { body: { resolution } }),

  adminSetWorkerState: async (id, action) => {
    await request("POST", `/admin/workers/${id}/${action}`);
  },

  adminGetSettings: () => request<AppSettings>("GET", "/admin/settings"),
  adminSaveSettings: (settings) => request<AppSettings>("PATCH", "/admin/settings", { body: settings }),

  adminAgents: async () => (await request<{ items: AgentLedgerSummary[] }>("GET", "/admin/agents")).items,
  adminAgentLedger: (id) => orNull(request<{ summary: AgentLedgerSummary; entries: AgentLedgerEntry[] }>("GET", `/admin/agents/${id}/ledger`)),

  adminAddAgent: async (name, phone) => {
    await request("POST", "/admin/agents", { body: { name, phone } });
  },
};
