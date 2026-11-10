import type { DataApi } from "../api";
import type { Crew, CrewInvite } from "../types";
import { me } from "./auth";
import { orNull, request } from "./http";

export const crewsApi: Pick<
  DataApi,
  "listCrews" | "listMyCrews" | "getCrew" | "createCrew" | "inviteToCrew" | "listCrewInvites" | "acceptCrewInvite" | "declineCrewInvite" | "leaveCrew"
> = {
  listCrews: async (categoryId) => (await request<{ items: Crew[] }>("GET", categoryId ? `/crews?categoryId=${encodeURIComponent(categoryId)}` : "/crews")).items,

  listMyCrews: async () => {
    const [{ worker }, { items }] = await Promise.all([me(), request<{ items: Crew[] }>("GET", "/crews")]);
    return worker ? items.filter((crew) => crew.members.some((member) => member.id === worker.id)) : [];
  },

  getCrew: (id) => orNull(request<Crew>("GET", `/crews/${encodeURIComponent(id)}`)),

  createCrew: (input) => request<Crew>("POST", "/crews", { body: { ...input, memberIds: input.memberIds ?? [] } }),

  inviteToCrew: (crewId, who) => request<Crew>("POST", `/crews/${crewId}/members`, { body: who }),

  listCrewInvites: async () => (await request<{ items: CrewInvite[] }>("GET", "/crews/invites")).items,

  acceptCrewInvite: (crewId) => request<Crew>("POST", `/crews/${crewId}/accept`),

  declineCrewInvite: async (crewId) => {
    await request("POST", `/crews/${crewId}/decline`);
  },

  leaveCrew: async (crewId) => {
    await request("POST", `/crews/${crewId}/leave`);
  },
};
