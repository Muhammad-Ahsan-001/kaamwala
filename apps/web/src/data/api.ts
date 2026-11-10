import type {
  AdminDispute,
  AdminStats,
  AdminWorkerRow,
  AgentLedgerEntry,
  AgentLedgerSummary,
  AppSettings,
  Area,
  AuthUser,
  Category,
  CategoryInput,
  ConnectionState,
  Crew,
  CrewInvite,
  CustomerPatch,
  EarningsView,
  HirerCard,
  HirerDetail,
  Job,
  JobFeedItem,
  Message,
  NewCrew,
  NewCustomer,
  NewJob,
  NewWorker,
  OfflinePreset,
  Offer,
  OnBehalf,
  OnboardField,
  PhotoUploadResult,
  ProblemAnalysis,
  ProblemInput,
  PushPublicKey,
  ReviewDraft,
  ReviewInput,
  ReviewView,
  Role,
  WorkerCard,
  WorkerExtras,
  WorkerFilter,
  WorkerPatch,
  WorkerProfileDraft,
  WsEvent,
} from "./types";

/**
 * Everything the screens need from the outside world.
 * Screens only ever talk to this interface.
 */
export interface DataApi {
  /** The real state of the status socket. Show "live" only when this says so. */
  connection(): ConnectionState;
  /** Called whenever connection() changes. Returns an unsubscribe function. */
  onConnection(listener: (state: ConnectionState) => void): () => void;
  /** Every server event, as it arrives. Returns an unsubscribe function. */
  onEvent(listener: (event: WsEvent) => void): () => void;

  requestOtp(phone: string): Promise<{ devOtp: string }>;
  /** Leave role out to keep the role this phone already has. */
  verifyOtp(phone: string, otp: string, role?: Role): Promise<AuthUser>;
  /** Asks the server who is signed in. Throws UNAUTHORIZED when nobody is. */
  session(): Promise<AuthUser>;
  /** The signed-in user as last known, with no network call. Null when signed out. */
  currentUser(): AuthUser | null;
  /** Called whenever the signed-in user or their profile changes. */
  onSessionChange(listener: () => void): () => void;
  signOut(): void;

  getPublicSettings(): Promise<AppSettings>;
  getAreas(): Promise<Area[]>;
  /** Stores a photo and returns the URL to send with a job or profile. */
  uploadImage(photo: Blob): Promise<string>;

  listCategories(options?: { all?: boolean }): Promise<Category[]>;
  saveCategory(input: CategoryInput, id?: string): Promise<Category>;
  reorderCategories(ids: string[]): Promise<void>;
  /** Called whenever the admin changes categories. Returns an unsubscribe function. */
  onCategoriesChanged(listener: () => void): () => void;
  matchTrade(text: string): Promise<Category | null>;

  listWorkers(filter?: WorkerFilter): Promise<WorkerCard[]>;
  /** "me" is the signed-in worker. Null when there is no such worker. */
  getWorker(id: string): Promise<WorkerCard | null>;
  getWorkerReviews(id: string): Promise<ReviewView[]>;
  getWorkerExtras(id: string): Promise<WorkerExtras>;
  getMyWorker(): Promise<WorkerCard>;
  updateMyWorker(patch: WorkerPatch): Promise<WorkerCard>;
  setAvailability(available: boolean, preset?: OfflinePreset): Promise<WorkerCard>;
  createWorker(profile: NewWorker): Promise<WorkerCard>;
  /** A photo is read by Gemini (503 AI_UNAVAILABLE without it). A typed number needs no AI. */
  uploadCnic(input: Blob | { cnic: string }, onBehalf?: OnBehalf): Promise<void>;
  uploadPhoto(kind: "profile" | "work", photo: Blob, onBehalf?: OnBehalf): Promise<PhotoUploadResult>;
  createCustomer(profile: NewCustomer): Promise<void>;
  updateMyCustomer(patch: CustomerPatch): Promise<HirerCard>;

  /** "me" is the signed-in customer. Null when there is no such customer. */
  getHirer(id: string): Promise<HirerDetail | null>;

  listCrews(categoryId?: string): Promise<Crew[]>;
  /** Crews the signed-in worker belongs to. */
  listMyCrews(): Promise<Crew[]>;
  getCrew(id: string): Promise<Crew | null>;
  createCrew(input: NewCrew): Promise<Crew>;
  /** By WorkerProfile id or phone number. The reply never reveals whether a phone is registered. */
  inviteToCrew(crewId: string, who: { workerId: string } | { phone: string }): Promise<Crew>;
  listCrewInvites(): Promise<CrewInvite[]>;
  acceptCrewInvite(crewId: string): Promise<Crew>;
  declineCrewInvite(crewId: string): Promise<void>;
  /** Throws CREW_JOB_ACTIVE during a job of this crew, LEADER_CANNOT_LEAVE for the leader. */
  leaveCrew(crewId: string): Promise<void>;

  listOpenJobs(): Promise<JobFeedItem[]>;
  listMyJobs(): Promise<Job[]>;
  listUpcomingJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  createJob(input: NewJob): Promise<Job>;
  /** A crew leader passes crewId to bid for the whole crew. Price is per day. */
  sendOffer(jobId: string, price: number, options?: { etaMinutes?: number; crewId?: string }): Promise<Offer>;
  listOffers(jobId: string): Promise<Offer[]>;
  acceptOffer(jobId: string, offerId: string): Promise<Job>;
  /** The worker takes a direct or crew request. */
  acceptRequest(jobId: string): Promise<Job>;
  /** The worker refuses a direct or crew request. */
  declineRequest(jobId: string): Promise<Job>;
  /** Throws DAYS_ALREADY_COMPLETED once a day has been paid. */
  cancelJob(jobId: string): Promise<Job>;
  /** Reason is 3 to 1000 characters. On a job under way this ends the work. */
  openDispute(jobId: string, reason: string): Promise<Job>;
  /** Move the price one admin-set step. Throws BELOW_FLOOR rather than going under the floor. */
  adjustPrice(jobId: string, direction: "up" | "down"): Promise<Job>;
  generateCard(jobId: string): Promise<Job>;
  /** Throws CARD_OUTDATED when the card's start date has passed: generate a new card. */
  confirmJob(jobId: string): Promise<Job>;
  /** Mark one day of a multi-day job finished. The last day completes the job. */
  completeDay(jobId: string, dayNumber: number): Promise<Job>;
  /** Finish a job now. Only completed days are charged on a multi-day job. */
  completeJob(jobId: string): Promise<Job>;

  listMessages(jobId: string): Promise<Message[]>;
  /** Comes back with transcript null. A message.transcribed event delivers the transcript if AI ran. */
  sendVoiceNote(jobId: string, audio: Blob): Promise<Message>;
  sendTextMessage(jobId: string, text: string): Promise<Message>;

  /** What a spoken review said, before submitting. Throws AI_UNAVAILABLE without Gemini: offer the tap path. */
  transcribeReview(jobId: string, audio: Blob): Promise<ReviewDraft>;
  submitReview(jobId: string, review: ReviewInput): Promise<void>;

  getEarnings(): Promise<EarningsView>;

  /** The audio functions throw AI_UNAVAILABLE without Gemini and NOTHING_HEARD for silence: offer typing. */
  transcribeOnboarding(audio: Blob, field?: OnboardField): Promise<WorkerProfileDraft>;
  transcribeField(field: OnboardField, audio: Blob): Promise<string>;
  transcribeCustomer(audio: Blob): Promise<NewCustomer & { transcript: string }>;
  analyzeProblem(input: ProblemInput): Promise<ProblemAnalysis>;
  /** The Urdu sentence to read back before a worker confirms. */
  readBackLine(draft: Partial<WorkerProfileDraft>): Promise<string>;
  /** Spoken Urdu as an audio file, for lines that have no recording. Throws when it cannot be made. */
  speak(text: string): Promise<Blob>;

  getPushKey(): Promise<PushPublicKey>;
  subscribePush(subscription: PushSubscriptionJSON): Promise<void>;
  unsubscribePush(endpoint: string): Promise<void>;

  adminStats(): Promise<AdminStats>;
  adminWorkers(): Promise<AdminWorkerRow[]>;
  adminJobs(): Promise<Job[]>;
  adminDisputes(): Promise<AdminDispute[]>;
  /** Resolution is 3 to 1000 characters. */
  adminResolveDispute(jobId: string, resolution: string): Promise<Job>;
  adminSetWorkerState(id: string, action: "approve" | "suspend"): Promise<void>;
  adminGetSettings(): Promise<AppSettings>;
  adminSaveSettings(settings: AppSettings): Promise<AppSettings>;
  adminAgents(): Promise<AgentLedgerSummary[]>;
  adminAgentLedger(id: string): Promise<{ summary: AgentLedgerSummary; entries: AgentLedgerEntry[] } | null>;
  adminAddAgent(name: string, phone: string): Promise<void>;
}
