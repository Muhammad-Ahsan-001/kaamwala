import type { Category, JobMode, LatLng, Urgency } from "@kaamwala/contracts";

export type {
  AdminDispute,
  AdminStats,
  AdminWorkerRow,
  AgentLedgerEntry,
  AgentLedgerSummary,
  AppSettings,
  Area,
  AuthUser,
  Category,
  Crew,
  CrewInvite,
  CustomerDraft,
  Earning,
  EarningsView,
  HirerCard,
  HirerDetail,
  Job,
  JobCardData,
  JobDay,
  JobFeedItem,
  JobMode,
  LatLng,
  Message,
  OfflinePreset,
  Offer,
  OnboardField,
  PastWork,
  PhotoUploadResult,
  ProblemAnalysis,
  PushPublicKey,
  Review,
  ReviewDraft,
  ReviewView,
  Role,
  TradeMatch,
  Urgency,
  WorkerCard,
  WorkerDetail,
  WorkerProfileDraft,
  WorkerStatus,
  WsEvent,
  WsEventType,
} from "@kaamwala/contracts";

/** "live" only while the real status socket is open. Screens must not claim live data otherwise. */
export type ConnectionState = "live" | "connecting" | "offline";

export type CategoryInput = Omit<Category, "id" | "sortOrder">;

export type WorkerFilter = {
  categoryId?: string;
  q?: string;
  center?: LatLng;
  radiusKm?: number;
  minRating?: number;
};

/** Only what the profile page shows on top of the card. */
export type WorkerExtras = {
  pastWork: import("@kaamwala/contracts").PastWork[];
  /** True only means the CNIC hash was checked for duplicates. It is not government verification. */
  cnicDuplicateChecked: boolean;
};

export type ProblemInput = { text?: string; audio?: Blob; image?: Blob };

export type NewWorker = {
  name: string;
  categoryIds: string[];
  /** Free text in Urdu, Roman Urdu or English. Jev reads it when no category was picked. */
  trade?: string;
  skills: string[];
  years: number | null;
  rate: number | null;
  area: string;
  workingHours: string | null;
  location?: LatLng;
  photoUrl?: string;
  /** Set when a field agent signs someone up. */
  forPhone?: string;
};

export type WorkerPatch = Partial<Omit<NewWorker, "forPhone" | "years" | "rate" | "workingHours">> & {
  years?: number;
  rate?: number;
  workingHours?: string;
};

export type NewCustomer = { name: string; area: string; address: string; location?: LatLng };

export type CustomerPatch = Partial<NewCustomer> & { photoUrl?: string };

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
  /** The estimate from the analysis, per day. Shown to workers in their feed. */
  priceMin?: number | null;
  priceMax?: number | null;
  photoUrls?: string[];
  scheduledFor?: string;
};

export type NewCrew = {
  name: string;
  categoryIds: string[];
  /** Per day for the whole crew. */
  rate: number;
  /** WorkerProfile ids to invite. Nobody joins until they accept. */
  memberIds?: string[];
};

export type ReviewInput = {
  rating: number;
  tags: string[];
  audio?: Blob;
  paidOnTime?: boolean;
  paidExtra?: boolean;
  behaviour?: "good" | "okay" | "bad";
};

/** Who a sign-up photo or CNIC belongs to, when a field agent is doing it for them. */
export type OnBehalf = { forWorkerId?: string };
