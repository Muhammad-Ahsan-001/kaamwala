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
   */
  onTimeRate: z.number(),
  /** "jawab": average minutes from a job being posted to this worker's reply. Null with no replies yet. */
  avgResponseMinutes: z.number().nullable(),
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
  cnicDuplicateChecked: z.boolean(),
  /** This phone completed an OTP sign-in. OTP delivery is mocked. */
  phoneChecked: z.boolean(),
  /** As the worker said it, e.g. "Subah 9 se shaam 6". */
  workingHours: z.string().nullable(),
  /** Past-work photo URLs. */
  photos: z.array(z.string()),
});
export type WorkerCard = z.infer<typeof WorkerCard>;

/** A worker's own view of themselves. Only ever sent to that worker, never in a listing. */
export const WorkerSelf = WorkerCard.extend({
  /** The trades of open jobs this worker chose to see. Empty means their own trades. */
  feedCategoryIds: z.array(z.string()),
});
export type WorkerSelf = z.infer<typeof WorkerSelf>;

/** One past-work photo. skill is what Gemini saw in it, null when AI did not run or saw no work. */
export const PastWork = z.object({ id: z.string(), url: z.string(), skill: z.string().nullable() });
export type PastWork = z.infer<typeof PastWork>;

/** GET /v1/admin/workers. */
export const AdminWorkerRow = WorkerCard.extend({
  phone: z.string(),
  suspended: z.boolean(),
  /** Name of the field agent who registered this worker, if one did. */
  createdByAgent: z.string().nullable(),
});
export type AdminWorkerRow = z.infer<typeof AdminWorkerRow>;

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
  /** Workers waiting for approval. Suspended accounts are not counted. */
  pendingWorkers: z.number().int(),
  /** Disputes nobody has resolved yet. */
  disputes: z.number().int(),
  /** Jobs created on each of the last 7 days in Pakistan, oldest first. Days with none are included. */
  jobsByDay: z.array(z.object({ date: z.string(), count: z.number().int() })),
  /** Workers per status. A status with no workers is left out. */
  workersByStatus: z.record(z.number().int()),
  /** Jobs per status. A status with no jobs is left out. */
  jobsByStatus: z.record(z.number().int()),
  customers: z.number().int(),
  activeCategories: z.number().int(),
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
  /** Completed jobs by trade. */
  jobTypes: z.array(z.object({ categoryId: z.string(), count: z.number().int() })),
  /** 0 to 100 among workers who said either way. Null when none has yet, so show a dash rather than a number. */
  paidOnTimePct: z.number().int().nullable(),
  paidExtraCount: z.number().int(),
  /** Only on your own profile. Null for everyone else's. */
  location: LatLng.nullable(),
  /** Only on your own profile. Workers see it on Job.address once a booking is confirmed. */
  address: z.string().nullable(),
});
export type HirerCard = z.infer<typeof HirerCard>;

/** Which single answer a re-recorded or re-typed reply is for. See POST /ai/onboard. */
export const OnboardField = z.enum(["name", "trade", "skills", "years", "rate", "area", "workingHours"]);
export type OnboardField = z.infer<typeof OnboardField>;

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
  durationDays: z.number().int().nullable(),
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
  crewId: z.string().nullable(),
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
  source: z.enum(["gemini", "template"]),
  skills: z.array(z.string()).optional(),
  durationDays: z.number().int(),
  startDate: z.string(), // YYYY-MM-DD
  pricePerDay: z.number().int(),
  totalPrice: z.number().int(),
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
  /** proposedPrice, agreedPrice and Offer.price are ALWAYS per day (for the whole crew on a crew job). */
  durationDays: z.number().int(),
  startDate: z.string(), // YYYY-MM-DD
  /** agreedPrice x durationDays once agreed. After an early finish, agreedPrice x completed days. */
  totalPrice: z.number().int().nullable(),
  /** Empty until both sides confirm. */
  days: z.array(JobDay),
  /** The customer's home address. Null until both sides have confirmed the booking. */
  address: z.string().nullable(),
});
export type Job = z.infer<typeof Job>;

/** A job in a worker's feed (GET /jobs/open). */
export const JobFeedItem = Job.extend({
  /** Per day. What the customer's analysis estimated, otherwise what workers in this trade really charge. */
  priceMin: z.number().int().nullable(),
  priceMax: z.number().int().nullable(),
  /** From this worker to the job's rounded location. */
  distanceKm: z.number(),
});
export type JobFeedItem = z.infer<typeof JobFeedItem>;

/** GET /v1/admin/disputes. Resolved disputes stay listed, with disputeResolution set. */
export const AdminDispute = Job.extend({
  disputeReason: z.string().nullable(),
  disputeResolution: z.string().nullable(),
  disputedAt: z.string().nullable(),
  workerNames: z.array(z.string()),
});
export type AdminDispute = z.infer<typeof AdminDispute>;

export const Crew = z.object({
  id: z.string(),
  name: z.string(),
  leaderId: z.string(),
  members: z.array(WorkerCard),
  categoryIds: z.array(z.string()),
  rate: z.number().int(),
  available: z.boolean(), // true only when every member is available
  /** People invited who have not answered yet. They are not in members and are never booked. */
  pendingCount: z.number().int(),
});
export type Crew = z.infer<typeof Crew>;

/** An invitation waiting for this worker's answer. */
export const CrewInvite = z.object({
  crewId: z.string(),
  crewName: z.string(),
  leaderName: z.string(),
  categoryIds: z.array(z.string()),
  rate: z.number().int(),
  invitedAt: z.string(),
});
export type CrewInvite = z.infer<typeof CrewInvite>;

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

/** A review as shown on a profile. authorName is a first name only: profiles are public. */
export const ReviewView = Review.extend({
  authorName: z.string(),
  authorArea: z.string().nullable(),
  categoryId: z.string(),
});
export type ReviewView = z.infer<typeof ReviewView>;

/** GET /v1/workers/:id. */
export const WorkerDetail = WorkerCard.extend({
  reviews: z.array(ReviewView),
  pastWork: z.array(PastWork),
});
export type WorkerDetail = z.infer<typeof WorkerDetail>;

/** GET /v1/customers/:id. */
export const HirerDetail = HirerCard.extend({ reviews: z.array(ReviewView) });
export type HirerDetail = z.infer<typeof HirerDetail>;

/** POST /v1/jobs/:id/reviews/draft: what a spoken review said, before it is submitted. Only Gemini can make one. */
export const ReviewDraft = z.object({
  transcript: z.string(),
  tags: z.array(z.string()),
  rating: z.number().int().min(1).max(5).nullable(),
  source: z.literal("gemini"),
});
export type ReviewDraft = z.infer<typeof ReviewDraft>;

/** POST /v1/ai/customer. */
export const CustomerDraft = z.object({
  name: z.string().nullable(),
  area: z.string().nullable(),
  address: z.string().nullable(),
  transcript: z.string(),
  source: z.enum(["gemini", "jev_only"]),
});
export type CustomerDraft = z.infer<typeof CustomerDraft>;

/** GET /v1/categories/match?q=. Jev only, no AI call. */
export const TradeMatch = z.object({
  category: Category.nullable(),
  confidence: z.number(),
  skills: z.array(z.string()),
});
export type TradeMatch = z.infer<typeof TradeMatch>;

/** GET /v1/areas. */
export const Area = z.object({ name: z.string(), nameUr: z.string(), lat: z.number(), lng: z.number() });
export type Area = z.infer<typeof Area>;

/** POST /v1/workers/me/photos. aiAvailable is null for a profile photo, false when skills could not be read. */
export const PhotoUploadResult = z.object({
  urls: z.array(z.string()),
  skillTags: z.array(z.string()),
  aiAvailable: z.boolean().nullable(),
  worker: WorkerCard,
});
export type PhotoUploadResult = z.infer<typeof PhotoUploadResult>;

/** GET /v1/push/public-key. */
export const PushPublicKey = z.object({ enabled: z.boolean(), publicKey: z.string().nullable() });
export type PushPublicKey = z.infer<typeof PushPublicKey>;

export const Earning = z.object({
  id: z.string(),
  jobId: z.string(),
  amount: z.number().int(),
  categoryId: z.string(),
  earnedAt: z.string(),
  dayNumber: z.number().int().nullable(),
});
export type Earning = z.infer<typeof Earning>;

/** GET /v1/workers/me/earnings. */
export const EarningsView = z.object({
  items: z.array(Earning),
  today: z.number().int(),
  week: z.number().int(),
  /** How many different jobs have paid this worker. */
  jobCount: z.number().int(),
  /** Each of the last 7 days in Pakistan, oldest first. Days with nothing earned are included. */
  daily: z.array(z.object({ date: z.string(), amount: z.number().int() })),
});
export type EarningsView = z.infer<typeof EarningsView>;

/**
 * Server-to-client events on GET /v1/ws?token=<jwt> (token optional for public events).
 * The server also sends the text frame {"type":"heartbeat"} every 30 seconds. It is not a WsEvent:
 * it exists because a browser cannot see WebSocket pings, so silence is the only sign of a dead socket.
 */
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
  /** To the invited worker only. Read the details from GET /crews/invites. */
  z.object({ type: z.literal("crew.invited"), crewId: z.string() }),
  /** Public: an open job has left the feed, because an offer was accepted or it was cancelled. */
  z.object({ type: z.literal("job.closed"), jobId: z.string() }),
]);
export type WsEvent = z.infer<typeof WsEvent>;
export type WsEventType = WsEvent["type"];

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
 *   POST /ai/customer  -> CustomerDraft, for a spoken or typed customer sign-up
 *
 * Workers
 *   POST  /workers                 create from a confirmed draft (agents may pass forPhone)
 *   GET   /workers?lat&lng&radiusKm&categoryId&q&minRating   available only, sorted by distance, rating, response rate
 *   GET   /workers/:id           -> WorkerDetail
 *   POST  /workers/me/availability {available, preset?}  rejected with 409 while engaged
 *   POST  /workers/me/photos       multipart; returns skill tags
 *   POST  /workers/me/cnic         multipart; stores only a salted SHA-256 hash, 409 on duplicate
 *   GET   /workers/me/earnings     -> EarningsView
 *
 * Crews
 *   GET /crews?categoryId   GET /crews/:id   POST /crews   POST /crews/:id/members
 *   Anyone named in memberIds or added by workerId or phone is invited, and joins only by accepting.
 *   Crew.members lists accepted members only, Crew.pendingCount counts the rest.
 *   GET  /crews/invites            -> {items: CrewInvite[]} this worker's invitations
 *   POST /crews/:id/accept         POST /crews/:id/decline
 *   POST /crews/:id/leave          409 CREW_JOB_ACTIVE during a job of this crew, 422 for the leader
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
 *   POST /jobs/:id/reviews/draft  multipart audio -> ReviewDraft, 503 without Gemini
 *   POST /jobs/:id/reviews        multipart audio and/or {rating, tags, paidOnTime?, paidExtra?, behaviour?}
 *
 * Push
 *   GET /push/public-key   POST /push/subscribe   POST /push/unsubscribe {endpoint}
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
 *   POST /customers                typed customer sign-up {name, area?, location?, address?}
 *   GET  /customers/:id            -> HirerDetail; "me" means the caller
 *   PATCH /customers/me            {name?, area?, location?, address?, photoUrl?}
 *   GET  /categories/match?q=      -> TradeMatch, Jev only
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
 *   GET /me returns {user: AuthUser, worker: WorkerSelf | null, hirer: HirerCard | null}.
 *   PATCH /workers/me and POST /workers/me/availability return WorkerSelf.
 *   GET /workers/:id returns WorkerDetail. GET /jobs/open returns JobFeedItem[].
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
 * Who sees what
 *   Exact location and full name go only to the customer, workers on the job and admins. On an open
 *   job, workers who may bid get customerName as a first name and location rounded to about 1 km.
 *   A worker whose offer was rejected loses access to the job; GET /jobs/:id/offers still shows
 *   them their own offer with its status.
 *   Message.audioUrl and Review.audioUrl are signed links that stop working after an hour. Refetch
 *   the message or review to get a new one.
 *
 * Limits
 *   Text fields on /jobs/:id/messages, /ai/onboard and /ai/problem are capped at 2000 characters
 *   (413 TEXT_TOO_LONG). A customer may hold 3 unanswered direct or crew requests at once
 *   (409 TOO_MANY_REQUESTS). An unanswered request expires after 30 minutes, an idle negotiation after 12 hours.
 *   photoUrl and photoUrls must be URLs returned by this API's upload routes.
 *
 * POST /ai/onboard also takes field (one of OnboardField) to read a reply answering only that
 * question. Only that part of the draft is filled in.
 *
 * Open crew jobs: POST /jobs {mode: "crew"} with no crewId is published for crews to bid on.
 * A crew leader offers with POST /jobs/:id/offers {price, crewId}.
 *
 * Trust fields on a hirer come from reviews. A worker's paidOnTime, paidExtra and behaviour answers
 * are stored as the tags "waqt par adaigi", "adaigi mein der", "extra diya", "acha rawaiya", "bura rawaiya".
 *
 * A review whose audio was read by POST /jobs/:id/reviews/draft is not sent to Gemini again when it is
 * submitted, and the tags sent with it are final: tags the reviewer removed stay removed.
 *
 * POST /jobs also takes priceMin and priceMax, the per-day estimate the customer was shown.
 *
 * Errors worth handling: 403 ACCOUNT_SUSPENDED, 409 WORKER_NOT_AVAILABLE, 409 WORKER_ENGAGED, 422 BELOW_FLOOR,
 * 409 CNIC_DUPLICATE, 503 AI_UNAVAILABLE (audio or image could not be processed),
 * 422 WRONG_TRADE, 422 CANNOT_HIRE_SELF, 409 TOO_MANY_REQUESTS, 409 PHONE_IN_USE,
 * 409 CARD_OUTDATED (the job card's start date passed: generate a new card).
 */
