/**
 * The shared contract between apps/web and apps/api.
 * Change it here first, so both sides stay in step.
 *
 * REST routes are prefixed with /v1. Auth is `Authorization: Bearer <jwt>`.
 * Errors are `{ error: { code: string, message: string } }`.
 */
import { z } from "zod";

export const Role = z.enum(["worker", "customer", "admin", "agent"]);
export type Role = z.infer<typeof Role>;

/** offline <-> available -> requested -> engaged -> completed -> available */
export const WorkerStatus = z.enum(["offline", "available", "requested", "engaged", "completed"]);
export type WorkerStatus = z.infer<typeof WorkerStatus>;

export const OfflinePreset = z.enum(["1h", "2h", "today", "manual"]);
export type OfflinePreset = z.infer<typeof OfflinePreset>;

export const JobMode = z.enum(["direct", "open", "crew"]);
export type JobMode = z.infer<typeof JobMode>;

export const JobStatus = z.enum([
  "open", // published, collecting offers
  "requested", // sent to a worker or crew, waiting for a reply
  "negotiating", // both sides adjusting price
  "pending_confirmation", // job card generated, waiting for both confirmations
  "engaged", // both confirmed, work under way
  "completed",
  "cancelled",
  "disputed",
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const Urgency = z.enum(["low", "normal", "urgent"]);
export type Urgency = z.infer<typeof Urgency>;

export const Category = z.object({
  id: z.string(),
  nameUr: z.string(),
  nameRoman: z.string(),
  nameEn: z.string(),
  icon: z.string(),
  keywords: z.array(z.string()),
  skills: z.array(z.string()),
  floorPrice: z.number().int().nonnegative(),
  step: z.number().int().positive(),
  crewAllowed: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type Category = z.infer<typeof Category>;

export const LatLng = z.object({ lat: z.number(), lng: z.number() });
export type LatLng = z.infer<typeof LatLng>;

export const TrustSummary = z.object({
  jobCount: z.number().int(),
  rating: z.number(),
  ratingCount: z.number().int(),
  responseRate: z.number(), // 0 to 1
  tags: z.array(z.object({ tag: z.string(), count: z.number().int() })),
  jobTypes: z.array(z.object({ categoryId: z.string(), count: z.number().int() })),
});
export type TrustSummary = z.infer<typeof TrustSummary>;

export const WorkerCard = z.object({
  id: z.string(), // WorkerProfile id
  userId: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  categoryIds: z.array(z.string()),
  skills: z.array(z.string()),
  years: z.number().int(),
  rate: z.number().int(),
  area: z.string(),
  location: LatLng,
  status: WorkerStatus,
  offlineUntil: z.string().nullable(), // ISO date
  approved: z.boolean(),
  trust: TrustSummary,
  distanceKm: z.number().optional(),
});
export type WorkerCard = z.infer<typeof WorkerCard>;

export const WorkerProfileDraft = z.object({
  name: z.string().nullable(),
  categoryIds: z.array(z.string()),
  skills: z.array(z.string()),
  years: z.number().int().nullable(),
  rate: z.number().int().nullable(),
  area: z.string().nullable(),
  workingHours: z.string().nullable(),
  transcript: z.string(),
  source: z.enum(["gemini", "jev_only"]),
});
export type WorkerProfileDraft = z.infer<typeof WorkerProfileDraft>;

export const ProblemAnalysis = z.object({
  transcript: z.string().nullable(),
  categoryId: z.string().nullable(),
  skills: z.array(z.string()),
  urgency: Urgency,
  priceMin: z.number().int().nullable(),
  priceMax: z.number().int().nullable(),
  summary: z.string(),
  confidence: z.number(),
  source: z.enum(["gemini", "jev_only"]),
});
export type ProblemAnalysis = z.infer<typeof ProblemAnalysis>;

export const Offer = z.object({
  id: z.string(),
  jobId: z.string(),
  worker: WorkerCard,
  price: z.number().int(),
  etaMinutes: z.number().int().nullable(),
  status: z.enum(["pending", "accepted", "rejected", "withdrawn"]),
  createdAt: z.string(),
});
export type Offer = z.infer<typeof Offer>;

export const Message = z.object({
  id: z.string(),
  jobId: z.string(),
  senderId: z.string(),
  audioUrl: z.string().nullable(),
  transcript: z.string().nullable(),
  text: z.string().nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof Message>;

export const JobCardData = z.object({
  task: z.string(),
  addressArea: z.string(),
  time: z.string(),
  agreedPrice: z.number().int(),
});
export type JobCardData = z.infer<typeof JobCardData>;

export const Job = z.object({
  id: z.string(),
  mode: JobMode,
  status: JobStatus,
  customerId: z.string(),
  customerName: z.string(),
  categoryId: z.string(),
  description: z.string(),
  urgency: Urgency,
  area: z.string(),
  location: LatLng,
  scheduledFor: z.string().nullable(),
  photoUrls: z.array(z.string()),
  floor: z.number().int(),
  step: z.number().int(),
  proposedPrice: z.number().int().nullable(),
  proposedBy: z.string().nullable(), // userId
  agreedPrice: z.number().int().nullable(),
  workerIds: z.array(z.string()), // WorkerProfile ids engaged or requested
  crewId: z.string().nullable(),
  card: JobCardData.nullable(),
  customerConfirmed: z.boolean(),
  workerConfirmed: z.boolean(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Job = z.infer<typeof Job>;

export const Crew = z.object({
  id: z.string(),
  name: z.string(),
  leaderId: z.string(),
  members: z.array(WorkerCard),
  categoryIds: z.array(z.string()),
  rate: z.number().int(),
  available: z.boolean(), // true only when every member is available
});
export type Crew = z.infer<typeof Crew>;

export const Review = z.object({
  id: z.string(),
  jobId: z.string(),
  direction: z.enum(["customer_to_worker", "worker_to_customer"]),
  rating: z.number().int().min(1).max(5),
  audioUrl: z.string().nullable(),
  transcript: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
});
export type Review = z.infer<typeof Review>;

export const Earning = z.object({
  id: z.string(),
  jobId: z.string(),
  amount: z.number().int(),
  categoryId: z.string(),
  earnedAt: z.string(),
});
export type Earning = z.infer<typeof Earning>;

/** Server-to-client events on GET /v1/ws?token=<jwt> (token optional for public events). */
export const WsEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("worker.status"),
    workerId: z.string(),
    status: WorkerStatus,
    offlineUntil: z.string().nullable(),
  }),
  z.object({ type: z.literal("job.updated"), job: Job }),
  z.object({ type: z.literal("offer.created"), offer: Offer }),
  z.object({ type: z.literal("offer.updated"), offer: Offer }),
  z.object({ type: z.literal("message.created"), message: Message }),
  z.object({ type: z.literal("message.transcribed"), message: Message }),
  z.object({ type: z.literal("categories.changed") }),
]);
export type WsEvent = z.infer<typeof WsEvent>;

/**
 * REST surface, all under /v1.
 *
 * Auth
 *   POST /auth/otp/request {phone} -> {devOtp} (OTP is mocked and shown on screen, disclosed)
 *   POST /auth/otp/verify {phone, otp, role?} -> {token, user}
 *   GET  /me
 *
 * Categories (public read, admin write)
 *   GET    /categories            active only; ?all=1 for admin
 *   POST   /admin/categories
 *   PATCH  /admin/categories/:id
 *   POST   /admin/categories/reorder {ids}
 *
 * AI (multipart, field `audio` and/or `image`; or JSON {text})
 *   POST /ai/onboard   -> WorkerProfileDraft
 *   POST /ai/problem   -> ProblemAnalysis
 *   POST /ai/tts-text  -> {text} Urdu read-back line; the browser or pre-recorded audio speaks it
 *
 * Workers
 *   POST  /workers                 create from a confirmed draft (agents may pass forPhone)
 *   GET   /workers?lat&lng&radiusKm&categoryId&q   available only, sorted by distance, rating, response rate
 *   GET   /workers/:id
 *   POST  /workers/me/availability {available, preset?}  rejected with 409 while engaged
 *   POST  /workers/me/photos       multipart; returns skill tags
 *   POST  /workers/me/cnic         multipart; stores only a salted SHA-256 hash, 409 on duplicate
 *   GET   /workers/me/earnings     -> {items, today, week}
 *
 * Crews
 *   GET /crews?categoryId   GET /crews/:id   POST /crews   POST /crews/:id/members
 *
 * Jobs
 *   POST /jobs                    {mode, workerId?, crewId?, categoryId, description, area, location, ...}
 *   GET  /jobs/mine               GET /jobs/open (worker feed)   GET /jobs/:id
 *   POST /jobs/:id/offers         {price, etaMinutes?}
 *   POST /jobs/:id/offers/:offerId/accept     transaction with row lock
 *   POST /jobs/:id/price          {direction: "up" | "down"}  fixed step, never below floor
 *   POST /jobs/:id/card           generate job card
 *   POST /jobs/:id/confirm        one-tap; both confirmed -> engaged, in one transaction with row lock
 *   POST /jobs/:id/complete       POST /jobs/:id/cancel
 *   GET  /jobs/:id/messages       POST /jobs/:id/messages (multipart audio or JSON text)
 *   POST /jobs/:id/reviews        multipart audio and/or {rating, tags}
 *
 * Push
 *   GET /push/public-key   POST /push/subscribe
 *
 * Admin
 *   GET /admin/workers   POST /admin/workers/:id/approve|suspend
 *   GET /admin/jobs      GET /admin/disputes   GET /admin/stats
 *   POST /admin/agents   {phone, name}
 */
