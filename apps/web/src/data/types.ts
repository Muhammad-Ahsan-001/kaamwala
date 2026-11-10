import type {
  AgentLedgerEntry,
  AgentLedgerSummary,
  AppSettings,
  AuthUser,
  Category,
  Crew,
  Earning as ContractEarning,
  Job as ContractJob,
  JobCardData as ContractJobCardData,
  JobMode,
  LatLng,
  Message,
  OfflinePreset,
  Offer,
  ProblemAnalysis as ContractProblemAnalysis,
  Review,
  Urgency,
  WorkerCard,
  WorkerProfileDraft,
  WorkerStatus,
} from "@kaamwala/contracts";

export type {
  AgentLedgerEntry,
  AgentLedgerSummary,
  AppSettings,
  AuthUser,
  Category,
  Crew,
  JobMode,
  LatLng,
  Message,
  OfflinePreset,
  Offer,
  Review,
  Urgency,
  WorkerCard,
  WorkerProfileDraft,
  WorkerStatus,
};

/* The multi-day fields below mirror what is being added to @kaamwala/contracts. */
export type JobDay = {
  dayNumber: number;
  date: string;
  status: "scheduled" | "completed" | "skipped";
  completedAt: string | null;
};

export type JobCardData = ContractJobCardData & {
  durationDays: number;
  startDate: string;
  pricePerDay: number;
  totalPrice: number;
};

/** proposedPrice, agreedPrice and Offer.price always mean per day. */
export type Job = Omit<ContractJob, "card"> & {
  card: JobCardData | null;
  durationDays: number;
  startDate: string;
  totalPrice: number | null;
  days: JobDay[];
};

export type Earning = ContractEarning & { dayNumber: number | null };
export type ProblemAnalysis = ContractProblemAnalysis & { durationDays: number | null };

export type CategoryInput = Omit<Category, "id" | "sortOrder">;

export type WorkerFilter = {
  categoryId?: string;
  q?: string;
  center?: LatLng;
  radiusKm?: number;
  minRating?: number;
};

export type ReviewView = Review & { authorName: string; authorArea?: string; categoryId: string };

export type HirerView = {
  id: string;
  name: string;
  area: string;
  photoUrl: string | null;
  jobsPosted: number;
  rating: number;
  ratingCount: number;
  paidOnTimePct: number;
  paidExtraCount: number;
  tags: { tag: string; count: number }[];
  jobTypes: { categoryId: string; count: number }[];
  reviews: ReviewView[];
};

export type PastWork = { id: string; url: string | null; skill: string };

export type WorkerExtras = {
  pastWork: PastWork[];
  /** True only means the CNIC hash was checked for duplicates. It is not government verification. */
  cnicDuplicateChecked: boolean;
};

/** A job as shown in a worker's feed, with the AI's per-day estimate when one exists. */
export type JobFeedItem = Job & { priceMin: number | null; priceMax: number | null; distanceKm?: number };

export type EarningsView = {
  items: Earning[];
  today: number;
  week: number;
  jobCount: number;
  daily: { date: string; amount: number }[];
};

export type ProblemInput = { text?: string; audio?: Blob; image?: Blob };

export type OnboardField = "name" | "trade" | "skills" | "years" | "rate" | "area" | "workingHours";

export type NewWorker = {
  name: string;
  categoryIds: string[];
  trade?: string;
  skills: string[];
  years: number | null;
  rate: number | null;
  area: string;
  workingHours: string | null;
  /** Set when a field agent signs someone up. */
  forPhone?: string;
};

export type NewCustomer = { name: string; area: string; address: string };

export type NewJob = {
  mode: JobMode;
  categoryId: string;
  description: string;
  area: string;
  location: LatLng;
  urgency: Urgency;
  durationDays: number;
  startDate: string;
  workerId?: string;
  crewId?: string;
  /** Per day. */
  proposedPrice?: number;
};

export type ReviewInput = {
  rating: number;
  tags: string[];
  audio?: Blob;
  paidOnTime?: boolean;
  paidExtra?: boolean;
  behaviour?: "good" | "okay" | "bad";
};

export type ReviewDraft = { transcript: string; tags: string[]; source: "gemini" | "jev_only" };

export type AdminStats = {
  availableNow: number;
  engagedNow: number;
  jobsToday: number;
  agentFeesWeek: number;
  pendingWorkers: number;
  disputes: number;
  jobsByDay: { date: string; count: number }[];
};

export type AdminWorkerRow = WorkerCard & {
  phone: string;
  /** True only means the CNIC hash was checked for duplicates. It is not government verification. */
  cnicDuplicateChecked: boolean;
  createdByAgent: string | null;
  suspended: boolean;
};

export type Dispute = {
  id: string;
  jobId: string;
  categoryId: string;
  customerName: string;
  workerName: string;
  reason: string;
  agreedPrice: number;
  openedAt: string;
};
