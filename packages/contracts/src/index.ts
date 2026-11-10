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
  /** Extra words that point at one skill, keyed by skill name. */
  skillAliases: z.record(z.array(z.string())).optional(),
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
  /**
   * "waqt par": 0 to 1, the share of completed jobs finished within 4 hours of the agreed time.
   * 0 when the worker has no completed jobs, so hide it while jobCount is 0.
   * The API always sends this; it is optional only so existing fixtures keep compiling.
   */
  onTimeRate: z.number().optional(),
  /** "jawab": average minutes from a job being posted to this worker's reply. Null with no replies yet. */
  avgResponseMinutes: z.number().nullable().optional(),
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
  /** A CNIC hash is on file and is not a duplicate. This is NOT government or NADRA verification. */
  cnicChecked: z.boolean().optional(),
  /** This phone completed an OTP sign-in. OTP delivery is mocked. */
  phoneChecked: z.boolean().optional(),
});
export type WorkerCard = z.infer<typeof WorkerCard>;

/** Field-agent sign-up fee. Self-signup is free. Payment collection is mocked. */
export const AppSettings = z.object({
  agentSignupFee: z.number().int().nonnegative(),
  agentSharePercent: z.number().int().min(0).max(100),
});
export type AppSettings = z.infer<typeof AppSettings>;

export const AgentLedgerEntry = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  workerId: z.string(),
  workerName: z.string(),
  fee: z.number().int(),
  agentShare: z.number().int(),
  platformShare: z.number().int(),
  paymentStatus: z.literal("mock_collected"),
  createdAt: z.string(),
});
export type AgentLedgerEntry = z.infer<typeof AgentLedgerEntry>;

export const AgentLedgerSummary = z.object({
  agentId: z.string(),
  agentName: z.string(),
  phone: z.string(),
  signups: z.number().int(),
  totalFee: z.number().int(),
  agentShare: z.number().int(),
  platformShare: z.number().int(),
});
export type AgentLedgerSummary = z.infer<typeof AgentLedgerSummary>;

/** GET /v1/admin/stats. agentFeesWeek covers the last 7 days and is mocked money. */
export const AdminStats = z.object({
  availableNow: z.number().int(),
  engagedNow: z.number().int(),
  jobsToday: z.number().int(),
  agentFeesWeek: z.number().int(),
});
export type AdminStats = z.infer<typeof AdminStats>;

export const AuthUser = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string().nullable(),
  role: Role,
  workerId: z.string().nullable(), // WorkerProfile id, null until the worker has signed up
  hasHirerProfile: z.boolean(),
});
export type AuthUser = z.infer<typeof AuthUser>;

export const HirerCard = z.object({
  id: z.string(), // User id
  name: z.string(),
  photoUrl: z.string().nullable(),
  area: z.string().nullable(),
  jobCount: z.number().int(),
  rating: z.number(),
  ratingCount: z.number().int(),
  tags: z.array(z.object({ tag: z.string(), count: z.number().int() })),
});
export type HirerCard = z.infer<typeof HirerCard>;

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
  /** Working days the customer asked for, null when they did not say. */
  durationDays: z.number().int().nullable().optional(),
  summary: z.string(),
  confidence: z.number(),
  source: z.enum(["gemini", "jev_only"]),
});
export type ProblemAnalysis = z.infer<typeof ProblemAnalysis>;

export const Offer = z.object({
  id: z.string(),
  jobId: z.string(),
  worker: WorkerCard,
  /** Set when a crew leader made this offer for the whole crew. */
  crewId: z.string().nullable().optional(),
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
  /** "template" means Gemini was unavailable and the card was built from the job's own fields. */
  source: z.enum(["gemini", "template"]).optional(),
  skills: z.array(z.string()).optional(),
  durationDays: z.number().int().optional(),
  startDate: z.string().optional(), // YYYY-MM-DD
  pricePerDay: z.number().int().optional(),
  totalPrice: z.number().int().optional(),
});
export type JobCardData = z.infer<typeof JobCardData>;

export const JobDay = z.object({
  dayNumber: z.number().int(),
  date: z.string(), // YYYY-MM-DD
  status: z.enum(["scheduled", "completed", "skipped"]),
  completedAt: z.string().nullable(),
});
export type JobDay = z.infer<typeof JobDay>;

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
  /**
   * proposedPrice, agreedPrice and Offer.price are ALWAYS per day (for the whole crew on a crew job).
   * The API always sends the fields below. They are optional only so existing fixtures keep compiling.
   */
  durationDays: z.number().int().optional(),
  startDate: z.string().optional(), // YYYY-MM-DD
  /** agreedPrice x durationDays once agreed. After an early finish, agreedPrice x completed days. */
  totalPrice: z.number().int().nullable().optional(),
  /** Empty until both sides confirm. */
  days: z.array(JobDay).optional(),
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
  dayNumber: z.number().int().nullable().optional(),
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
 *
 * Additions beyond the original list
 *   GET  /healthz  (not under /v1)
 *   GET  /areas                    Islamabad/Rawalpindi areas with coordinates
 *   POST /uploads/image            multipart `image` -> {url}
 *   PATCH /workers/me              typed edit of one or more fields
 *   POST /customers                typed customer sign-up {name, area?, location?}
 *   GET  /customers/:id            -> HirerCard
 *   POST /jobs/:id/accept          worker takes a direct or crew request -> negotiating
 *   POST /jobs/:id/decline         worker refuses a request
 *   POST /jobs/:id/dispute         {reason}
 *   GET  /jobs/:id/offers          -> {items: Offer[]}
 *   GET  /admin/agents[?days=7]    -> {items: AgentLedgerSummary[]}
 *   GET  /admin/agents/:id/ledger  -> {summary: AgentLedgerSummary, entries: AgentLedgerEntry[]}
 *   GET  /settings/public          -> AppSettings (no sign-in needed)
 *   GET  /admin/settings           -> AppSettings
 *   PATCH /admin/settings          {agentSignupFee?, agentSharePercent?} -> AppSettings
 *   POST /admin/disputes/:id/resolve {resolution}
 *
 * Response shapes
 *   Lists return {items: [...]}. GET /workers also returns
 *   detected: {categoryId, confidence, skills} | null, when `q` was given.
 *   GET /me returns {user: AuthUser, worker: WorkerCard | null, hirer: HirerCard | null}.
 *   GET /workers/:id returns WorkerCard plus reviews: Review[].
 *
 * Typed sign-up (no audio, no Gemini needed)
 *   POST /workers {name, area, categoryIds? or trade (free text, Urdu/Roman/English), skills?,
 *   years?, rate?, location?, workingHours?, cnic?, forPhone? (agents only)}.
 *   An unrecognised trade returns 422 TRADE_NOT_RECOGNISED. Show the category picker then.
 *   A signup with forPhone records one mock_collected ledger entry in the same transaction.
 *   Self-signup is free and records nothing. A blocked or duplicate signup records nothing.
 *   POST /workers/me/cnic accepts JSON {cnic} as well as a photo.
 *
 * Multi-day jobs (all modes)
 *   POST /jobs also takes durationDays (1 to 30, default 1) and startDate (YYYY-MM-DD, today to
 *   14 days ahead in Pakistan, default today). A worker is engaged from confirmation through
 *   the last day, even if the job starts later.
 *   POST /jobs/:id/days/:dayNumber/complete   assigned worker or crew leader, idempotent, pays that day.
 *   POST /jobs/:id/complete   finishes early: remaining days are skipped and only completed days
 *   are charged. 409 NO_DAYS_COMPLETED when none are done; cancel instead.
 *   POST /jobs/:id/cancel returns 409 DAYS_ALREADY_COMPLETED once a day has been paid.
 *
 * Open crew jobs: POST /jobs {mode: "crew"} with no crewId is published for crews to bid on.
 * A crew leader offers with POST /jobs/:id/offers {price, crewId}.
 *
 * Errors worth handling: 409 WORKER_NOT_AVAILABLE, 409 WORKER_ENGAGED, 422 BELOW_FLOOR,
 * 409 CNIC_DUPLICATE, 503 AI_UNAVAILABLE (audio or image could not be processed).
 */
