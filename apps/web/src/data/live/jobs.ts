import type { DataApi } from "../api";
import type { Job, JobFeedItem, Message, Offer, ReviewDraft } from "../types";
import { AI_TIMEOUT_MS, audioForm, compact, orNull, request } from "./http";

const UPCOMING: Job["status"][] = ["engaged", "pending_confirmation"];

async function mine(): Promise<Job[]> {
  return (await request<{ items: Job[] }>("GET", "/jobs/mine")).items;
}

const action = (jobId: string, verb: string, body?: unknown) => request<Job>("POST", `/jobs/${jobId}/${verb}`, { body });

export const jobsApi: Pick<
  DataApi,
  | "listOpenJobs"
  | "listMyJobs"
  | "listUpcomingJobs"
  | "getJob"
  | "createJob"
  | "sendOffer"
  | "listOffers"
  | "acceptOffer"
  | "acceptRequest"
  | "declineRequest"
  | "cancelJob"
  | "openDispute"
  | "adjustPrice"
  | "generateCard"
  | "confirmJob"
  | "completeDay"
  | "completeJob"
  | "listMessages"
  | "sendVoiceNote"
  | "sendTextMessage"
  | "transcribeReview"
  | "submitReview"
> = {
  listOpenJobs: async () => (await request<{ items: JobFeedItem[] }>("GET", "/jobs/open")).items,
  listMyJobs: mine,
  listUpcomingJobs: async () => (await mine()).filter((job) => UPCOMING.includes(job.status)),
  getJob: (id) => orNull(request<Job>("GET", `/jobs/${encodeURIComponent(id)}`)),

  createJob: (input) => request<Job>("POST", "/jobs", { body: compact(input) }),

  sendOffer: (jobId, price, options) => request<Offer>("POST", `/jobs/${jobId}/offers`, { body: compact({ price, ...options }) }),
  listOffers: async (jobId) => (await request<{ items: Offer[] }>("GET", `/jobs/${jobId}/offers`)).items,
  acceptOffer: (jobId, offerId) => action(jobId, `offers/${offerId}/accept`),

  acceptRequest: (jobId) => action(jobId, "accept"),
  declineRequest: (jobId) => action(jobId, "decline"),
  cancelJob: (jobId) => action(jobId, "cancel"),
  openDispute: (jobId, reason) => action(jobId, "dispute", { reason }),

  adjustPrice: (jobId, direction) => action(jobId, "price", { direction }),
  generateCard: (jobId) => request<Job>("POST", `/jobs/${jobId}/card`, { timeoutMs: AI_TIMEOUT_MS }),
  confirmJob: (jobId) => action(jobId, "confirm"),
  completeDay: (jobId, dayNumber) => action(jobId, `days/${dayNumber}/complete`),
  completeJob: (jobId) => action(jobId, "complete"),

  listMessages: async (jobId) => (await request<{ items: Message[] }>("GET", `/jobs/${jobId}/messages`)).items,
  sendVoiceNote: (jobId, audio) => request<Message>("POST", `/jobs/${jobId}/messages`, { form: audioForm(audio), timeoutMs: AI_TIMEOUT_MS }),
  sendTextMessage: (jobId, text) => request<Message>("POST", `/jobs/${jobId}/messages`, { body: { text } }),

  transcribeReview: (jobId, audio) => request<ReviewDraft>("POST", `/jobs/${jobId}/reviews/draft`, { form: audioForm(audio), timeoutMs: AI_TIMEOUT_MS }),

  submitReview: async (jobId, review) => {
    const fields = compact({
      rating: review.rating > 0 ? String(review.rating) : undefined,
      tags: JSON.stringify(review.tags),
      paidOnTime: review.paidOnTime === undefined ? undefined : String(review.paidOnTime),
      paidExtra: review.paidExtra === undefined ? undefined : String(review.paidExtra),
      behaviour: review.behaviour,
    }) as Record<string, string>;
    if (review.audio) {
      await request("POST", `/jobs/${jobId}/reviews`, { form: audioForm(review.audio, fields), timeoutMs: AI_TIMEOUT_MS });
    } else {
      await request("POST", `/jobs/${jobId}/reviews`, { body: fields });
    }
  },
};
