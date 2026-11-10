import type { DataApi } from "../api";
import { ApiError } from "../errors";
import type { EarningsView, OnBehalf, PhotoUploadResult, WorkerCard, WorkerDetail } from "../types";
import { me } from "./auth";
import { AI_TIMEOUT_MS, compact, imageForm, orNull, request } from "./http";
import { sessionStore } from "./session-store";

/** A profile page asks for the card, the reviews and the extras at once. They are one request. */
const DETAIL_REUSE_MS = 1_500;
const details = new Map<string, Promise<WorkerDetail | null>>();

function loadDetail(id: string): Promise<WorkerDetail | null> {
  const existing = details.get(id);
  if (existing) return existing;
  const loading = orNull(request<WorkerDetail>("GET", `/workers/${encodeURIComponent(id)}`));
  details.set(id, loading);
  const forget = () => setTimeout(() => details.delete(id), DETAIL_REUSE_MS);
  loading.then(forget, forget);
  return loading;
}

async function resolveWorkerId(id: string): Promise<string | null> {
  if (id !== "me") return id;
  return sessionStore.user()?.workerId ?? (await me()).user.workerId;
}

async function detailFor(id: string): Promise<WorkerDetail | null> {
  const resolved = await resolveWorkerId(id);
  return resolved ? loadDetail(resolved) : null;
}

const onBehalfQuery = (onBehalf?: OnBehalf) => (onBehalf?.forWorkerId ? `?forWorkerId=${encodeURIComponent(onBehalf.forWorkerId)}` : "");

export const workersApi: Pick<
  DataApi,
  "listWorkers" | "getWorker" | "getWorkerReviews" | "getWorkerExtras" | "getMyWorker" | "updateMyWorker" | "setAvailability" | "createWorker" | "uploadCnic" | "uploadPhoto" | "getEarnings"
> = {
  listWorkers: async (filter = {}) => {
    const query = new URLSearchParams();
    if (filter.center) {
      query.set("lat", String(filter.center.lat));
      query.set("lng", String(filter.center.lng));
    }
    if (filter.radiusKm !== undefined) query.set("radiusKm", String(filter.radiusKm));
    if (filter.categoryId) query.set("categoryId", filter.categoryId);
    if (filter.q) query.set("q", filter.q);
    if (filter.minRating !== undefined) query.set("minRating", String(filter.minRating));
    return (await request<{ items: WorkerCard[] }>("GET", `/workers?${query.toString()}`)).items;
  },

  getWorker: (id) => detailFor(id),

  getWorkerReviews: async (id) => (await detailFor(id))?.reviews ?? [],

  getWorkerExtras: async (id) => {
    const detail = await detailFor(id);
    return { pastWork: detail?.pastWork ?? [], cnicDuplicateChecked: detail?.cnicDuplicateChecked ?? false };
  },

  getMyWorker: async () => {
    const { worker } = await me();
    if (!worker) throw new ApiError("NOT_FOUND", "Finish worker sign-up first.", 404);
    return worker;
  },

  updateMyWorker: (patch) => request<WorkerCard>("PATCH", "/workers/me", { body: compact(patch) }),

  setAvailability: (available, preset) => request<WorkerCard>("POST", "/workers/me/availability", { body: compact({ available, preset }) }),

  createWorker: async (profile) => {
    const card = await request<WorkerCard>("POST", "/workers", {
      body: compact({
        name: profile.name,
        area: profile.area,
        categoryIds: profile.categoryIds.length > 0 ? profile.categoryIds : undefined,
        trade: profile.trade,
        skills: profile.skills.length > 0 ? profile.skills : undefined,
        years: profile.years,
        rate: profile.rate,
        location: profile.location,
        workingHours: profile.workingHours,
        photoUrl: profile.photoUrl,
        forPhone: profile.forPhone,
      }),
    });
    // The signed-in user now has a worker profile, unless an agent made this one for someone else.
    if (!profile.forPhone) await me();
    return card;
  },

  uploadCnic: async (input, onBehalf) => {
    const path = `/workers/me/cnic${onBehalfQuery(onBehalf)}`;
    if (input instanceof Blob) await request("POST", path, { form: imageForm(input), timeoutMs: AI_TIMEOUT_MS });
    else await request("POST", path, { body: { cnic: input.cnic } });
  },

  uploadPhoto: (kind, photo, onBehalf) =>
    request<PhotoUploadResult>("POST", `/workers/me/photos${onBehalfQuery(onBehalf)}`, {
      form: imageForm(photo, { kind }),
      timeoutMs: AI_TIMEOUT_MS,
    }),

  getEarnings: () => request<EarningsView>("GET", "/workers/me/earnings"),
};
