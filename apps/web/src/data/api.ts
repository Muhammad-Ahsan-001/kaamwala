import type { Role } from "@kaamwala/contracts";
import type {
  AdminStats,
  AdminWorkerRow,
  AgentLedgerEntry,
  AgentLedgerSummary,
  AppSettings,
  AuthUser,
  Category,
  CategoryInput,
  Crew,
  Dispute,
  EarningsView,
  HirerView,
  Job,
  JobFeedItem,
  Message,
  NewCustomer,
  NewJob,
  NewWorker,
  OfflinePreset,
  Offer,
  OnboardField,
  WorkerExtras,
  ProblemAnalysis,
  ProblemInput,
  ReviewDraft,
  ReviewInput,
  ReviewView,

  WorkerCard,
  WorkerFilter,
  WorkerProfileDraft,
} from "./types";

/**
 * Everything the screens need from the outside world.
 * Screens only ever talk to this interface, so wiring the real API
 * means writing one new implementation of it.
 */
export interface DataApi {
  /** "live" only when a real status channel is connected. Screens must not claim live data otherwise. */
  connection(): "live" | "demo";

  requestOtp(phone: string): Promise<{ devOtp: string }>;
  verifyOtp(phone: string, otp: string, role: Role): Promise<AuthUser>;
  session(): Promise<AuthUser>;

  getPublicSettings(): Promise<AppSettings>;

  listCategories(options?: { all?: boolean }): Promise<Category[]>;
  saveCategory(input: CategoryInput, id?: string): Promise<Category>;
  reorderCategories(ids: string[]): Promise<void>;
  /** Called whenever the admin changes categories. Returns an unsubscribe function. */
  onCategoriesChanged(listener: () => void): () => void;
  matchTrade(text: string): Promise<Category | null>;

  listWorkers(filter?: WorkerFilter): Promise<WorkerCard[]>;
  getWorker(id: string): Promise<WorkerCard | null>;
  getWorkerReviews(id: string): Promise<ReviewView[]>;
  getWorkerExtras(id: string): Promise<WorkerExtras>;
  getMyWorker(): Promise<WorkerCard>;
  setAvailability(available: boolean, preset?: OfflinePreset): Promise<WorkerCard>;
  createWorker(profile: NewWorker): Promise<WorkerCard>;
  uploadCnic(photo: Blob): Promise<void>;
  uploadPhoto(kind: "profile" | "work", photo: Blob): Promise<void>;
  createCustomer(profile: NewCustomer): Promise<void>;

  getHirer(id: string): Promise<HirerView | null>;

  listCrews(categoryId?: string): Promise<Crew[]>;
  getCrew(id: string): Promise<Crew | null>;

  listOpenJobs(): Promise<JobFeedItem[]>;
  listMyJobs(): Promise<Job[]>;
  listUpcomingJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  createJob(input: NewJob): Promise<Job>;
  sendOffer(jobId: string, price: number): Promise<void>;
  listOffers(jobId: string): Promise<Offer[]>;
  acceptOffer(jobId: string, offerId: string): Promise<Job>;
  /** Move the price one admin-set step. Throws BELOW_FLOOR rather than going under the floor. */
  adjustPrice(jobId: string, direction: "up" | "down"): Promise<Job>;
  generateCard(jobId: string): Promise<Job>;
  confirmJob(jobId: string): Promise<Job>;
  /** Mark one day of a multi-day job finished. The last day completes the job. */
  completeDay(jobId: string, dayNumber: number): Promise<Job>;
  /** Finish a job now. Only completed days are charged on a multi-day job. */
  completeJob(jobId: string): Promise<Job>;

  listMessages(jobId: string): Promise<Message[]>;
  sendVoiceNote(jobId: string, audio: Blob): Promise<Message>;

  transcribeReview(audio: Blob): Promise<ReviewDraft>;
  submitReview(jobId: string, review: ReviewInput): Promise<void>;

  getEarnings(): Promise<EarningsView>;

  transcribeOnboarding(audio?: Blob): Promise<WorkerProfileDraft>;
  transcribeField(field: OnboardField, audio?: Blob): Promise<string>;
  transcribeCustomer(audio?: Blob): Promise<NewCustomer & { transcript: string }>;
  analyzeProblem(input: ProblemInput): Promise<ProblemAnalysis>;

  adminStats(): Promise<AdminStats>;
  adminWorkers(): Promise<AdminWorkerRow[]>;
  adminJobs(): Promise<Job[]>;
  adminDisputes(): Promise<Dispute[]>;
  adminSetWorkerState(id: string, action: "approve" | "suspend"): Promise<void>;
  adminGetSettings(): Promise<AppSettings>;
  adminSaveSettings(settings: AppSettings): Promise<AppSettings>;
  adminAgents(): Promise<AgentLedgerSummary[]>;
  adminAgentLedger(id: string): Promise<{ summary: AgentLedgerSummary; entries: AgentLedgerEntry[] } | null>;
  adminAddAgent(name: string, phone: string): Promise<void>;
}
