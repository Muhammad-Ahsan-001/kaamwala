/** MOCK: invented data for design screens only. See ./index.ts. */
import { DEFAULT_CENTER } from "../defaults";
import type { Job } from "@kaamwala/contracts";
import type {
  AdminWorkerRow,
  Category,
  Crew,
  Dispute,
  Earning,
  EarningsView,
  HirerView,
  LatLng,
  Message,
  Offer,
  ReviewView,
  WorkerCard,
  WorkerStatus,
} from "../types";

export const HOME: LatLng = DEFAULT_CENTER;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export const seedCategories: Category[] = [
  {
    id: "cat-electrician",
    nameUr: "الیکٹریشن",
    nameRoman: "Bijli wala",
    nameEn: "Electrician",
    icon: "zap",
    keywords: ["bijli", "pankha", "fan", "wiring", "switch", "پنکھا", "بجلی", "وائرنگ"],
    skills: ["pankha theek karna", "wiring", "switch board", "UPS lagana"],
    floorPrice: 500,
    step: 50,
    crewAllowed: true,
    active: true,
    sortOrder: 0,
  },
  {
    id: "cat-plumber",
    nameUr: "پلمبر",
    nameRoman: "Plumber",
    nameEn: "Plumber",
    icon: "droplets",
    keywords: ["nalka", "pipe", "pani", "leak", "geyser", "نلکا", "پانی", "پائپ"],
    skills: ["nalka theek karna", "pipe leakage", "motor lagana", "geyser"],
    floorPrice: 500,
    step: 50,
    crewAllowed: true,
    active: true,
    sortOrder: 1,
  },
  {
    id: "cat-ac",
    nameUr: "اے سی مکینک",
    nameRoman: "AC wala",
    nameEn: "AC technician",
    icon: "snowflake",
    keywords: ["ac", "thanda", "cooling", "gas", "اے سی", "ٹھنڈا"],
    skills: ["AC service", "gas bharna", "AC lagana"],
    floorPrice: 1000,
    step: 100,
    crewAllowed: false,
    active: true,
    sortOrder: 2,
  },
  {
    id: "cat-carpenter",
    nameUr: "ترکھان",
    nameRoman: "Tarkhan",
    nameEn: "Carpenter",
    icon: "hammer",
    keywords: ["lakri", "darwaza", "almari", "furniture", "لکڑی", "دروازہ", "الماری"],
    skills: ["darwaza banana", "almari theek karna", "furniture polish"],
    floorPrice: 800,
    step: 50,
    crewAllowed: true,
    active: true,
    sortOrder: 3,
  },
  {
    id: "cat-mechanic",
    nameUr: "مکینک",
    nameRoman: "Mechanic",
    nameEn: "Mechanic",
    icon: "wrench",
    keywords: ["gari", "car", "engine", "motorcycle", "bike", "گاڑی", "انجن"],
    skills: ["gari ka engine", "motorcycle repair", "oil change"],
    floorPrice: 700,
    step: 50,
    crewAllowed: false,
    active: true,
    sortOrder: 4,
  },
  {
    id: "cat-mistri",
    nameUr: "مستری",
    nameRoman: "Mistri",
    nameEn: "Mason",
    icon: "hard-hat",
    keywords: ["mistri", "deewar", "chinai", "plaster", "tile", "دیوار", "مستری", "ٹائل"],
    skills: ["chinai", "plaster", "tile lagana"],
    floorPrice: 1500,
    step: 100,
    crewAllowed: true,
    active: true,
    sortOrder: 5,
  },
  {
    id: "cat-labourer",
    nameUr: "مزدور",
    nameRoman: "Mazdoor",
    nameEn: "Labourer",
    icon: "shovel",
    keywords: ["mazdoor", "saman", "khudai", "مزدور", "سامان"],
    skills: ["saman uthana", "khudai", "safai"],
    floorPrice: 1000,
    step: 50,
    crewAllowed: true,
    active: true,
    sortOrder: 6,
  },
  {
    id: "cat-painter",
    nameUr: "رنگ ساز",
    nameRoman: "Rang saz",
    nameEn: "Painter",
    icon: "paint-roller",
    keywords: ["rang", "paint", "distemper", "رنگ", "پینٹ"],
    skills: ["rang karna", "distemper"],
    floorPrice: 1200,
    step: 100,
    crewAllowed: true,
    active: true,
    sortOrder: 7,
  },
  {
    id: "cat-maid",
    nameUr: "ماسی",
    nameRoman: "Maasi",
    nameEn: "Home maid",
    icon: "sparkles",
    keywords: ["maasi", "kaam wali", "ghar ki safai", "safai", "ماسی", "صفائی"],
    skills: ["ghar ki safai", "bartan dhona", "kapray dhona", "khana banana"],
    floorPrice: 500,
    step: 50,
    crewAllowed: false,
    active: true,
    sortOrder: 8,
  },
];

type Row = [
  id: string,
  name: string,
  category: string,
  skills: string[],
  years: number,
  rate: number,
  area: string,
  lat: number,
  lng: number,
  status: WorkerStatus,
  rating: number,
  jobs: number,
  response: number,
  tags: string[],
];

const ROWS: Row[] = [
  ["w1", "Muhammad Akram", "cat-electrician", ["pankha theek karna", "wiring", "switch board"], 10, 2000, "G-9", 33.6921, 73.0352, "available", 4.8, 142, 0.96, ["waqt ka paband", "saaf kaam", "munasib qeemat"]],
  ["w2", "Bashir Ahmed", "cat-plumber", ["nalka theek karna", "pipe leakage", "motor lagana"], 14, 1800, "G-10", 33.6802, 73.0194, "available", 4.7, 201, 0.91, ["tajurbakar", "munasib qeemat"]],
  ["w3", "Ghulam Rasool", "cat-mistri", ["chinai", "plaster", "tile lagana"], 22, 2500, "G-8", 33.6963, 73.0472, "available", 4.9, 318, 0.88, ["tajurbakar", "saaf kaam", "mehnati"]],
  ["w4", "Shahid Mehmood", "cat-ac", ["AC service", "gas bharna"], 8, 2200, "F-8", 33.7068, 73.0401, "available", 4.6, 96, 0.94, ["jaldi pohancha", "khush akhlaq"]],
  ["w5", "Naveed Iqbal", "cat-electrician", ["wiring", "UPS lagana"], 6, 1600, "I-8", 33.6688, 73.0716, "available", 4.5, 74, 0.89, ["munasib qeemat"]],
  ["w6", "Zafar Hussain", "cat-carpenter", ["darwaza banana", "almari theek karna"], 17, 2400, "F-10", 33.6951, 73.0121, "available", 4.8, 156, 0.86, ["saaf kaam", "waqt ka paband"]],
  ["w7", "Imran Masih", "cat-painter", ["rang karna", "distemper"], 11, 2000, "I-9", 33.6617, 73.0482, "available", 4.4, 88, 0.83, ["mehnati"]],
  ["w8", "Nasreen Bibi", "cat-maid", ["ghar ki safai", "bartan dhona"], 9, 900, "G-9", 33.6868, 73.0279, "available", 4.9, 243, 0.97, ["waqt ka paband", "khush akhlaq", "saaf kaam"]],
  ["w9", "Shabana Bibi", "cat-maid", ["kapray dhona", "khana banana"], 5, 800, "G-10", 33.6775, 73.0142, "available", 4.7, 112, 0.92, ["mehnati", "khush akhlaq"]],
  ["w10", "Rafaqat Ali", "cat-labourer", ["saman uthana", "khudai"], 4, 1200, "G-9", 33.6945, 73.0268, "available", 4.3, 51, 0.8, ["mehnati"]],
  ["w11", "Tariq Mehmood", "cat-mechanic", ["motorcycle repair", "oil change"], 13, 1500, "I-10", 33.6529, 73.0398, "available", 4.6, 133, 0.87, ["jaldi pohancha", "munasib qeemat"]],
  ["w12", "Sajid Ali", "cat-electrician", ["pankha theek karna", "switch board"], 3, 1200, "H-9", 33.6752, 73.0468, "available", 4.2, 29, 0.85, ["khush akhlaq"]],
  ["w13", "Aslam Pervaiz", "cat-plumber", ["geyser", "pipe leakage"], 19, 2100, "Satellite Town", 33.6349, 73.0702, "engaged", 4.8, 287, 0.9, ["tajurbakar"]],
  ["w14", "Kashif Javed", "cat-ac", ["AC lagana", "AC service"], 7, 2300, "Saddar", 33.5973, 73.0479, "offline", 4.5, 67, 0.82, ["waqt ka paband"]],
];

export const workers: WorkerCard[] = ROWS.map(
  ([id, name, category, skills, years, rate, area, lat, lng, status, rating, jobs, response, tags]) => ({
    id,
    userId: `u-${id}`,
    name,
    photoUrl: null,
    categoryIds: [category],
    skills,
    years,
    rate,
    area,
    location: { lat, lng },
    status,
    offlineUntil: null,
    approved: true,
    trust: {
      jobCount: jobs,
      rating,
      ratingCount: Math.round(jobs * 0.8),
      responseRate: response,
      tags: tags.map((tag, index) => ({ tag, count: Math.max(4, Math.round(jobs * 0.45) - index * 9) })),
      jobTypes: [{ categoryId: category, count: jobs }],
    },
  }),
);

const worker = (id: string) => workers.find((w) => w.id === id)!;

const REVIEW_LINES: { rating: number; author: string; transcript: string; tags: string[] }[] = [
  { rating: 5, author: "Ayesha Malik", transcript: "وقت پر آئے اور بہت صاف کام کیا۔ پنکھا آدھے گھنٹے میں ٹھیک ہو گیا۔", tags: ["waqt ka paband", "saaf kaam"] },
  { rating: 5, author: "Noman Raza", transcript: "قیمت مناسب تھی، پہلے سے بتا دیا کہ کتنا خرچ آئے گا۔", tags: ["munasib qeemat"] },
  { rating: 4, author: "Hina Saeed", transcript: "کام اچھا تھا، بس تھوڑی دیر سے پہنچے۔", tags: ["saaf kaam"] },
];

export function reviewsFor(id: string): ReviewView[] {
  const target = worker(id) ?? workers[0]!;
  return REVIEW_LINES.map((line, index) => ({
    id: `${id}-r${index}`,
    jobId: "j-done",
    direction: "customer_to_worker",
    rating: line.rating,
    audioUrl: "mock",
    transcript: line.transcript,
    tags: line.tags,
    createdAt: hoursAgo(26 * (index + 1)),
    authorName: line.author,
    categoryId: target.categoryIds[0]!,
  }));
}

export const hirers: HirerView[] = [
  {
    id: "h1",
    name: "Ayesha Malik",
    area: "G-9",
    photoUrl: null,
    jobsPosted: 23,
    rating: 4.9,
    ratingCount: 21,
    paidOnTimePct: 96,
    paidExtraCount: 4,
    tags: [
      { tag: "paisay waqt par", count: 19 },
      { tag: "izzat se baat", count: 16 },
      { tag: "zyada diya", count: 4 },
    ],
    jobTypes: [
      { categoryId: "cat-electrician", count: 9 },
      { categoryId: "cat-plumber", count: 8 },
      { categoryId: "cat-maid", count: 6 },
    ],
    reviews: [
      {
        id: "hr1",
        jobId: "j-done",
        direction: "worker_to_customer",
        rating: 5,
        audioUrl: "mock",
        transcript: "باجی نے پورے پیسے وقت پر دیے اور چائے بھی پوچھی۔",
        tags: ["paisay waqt par", "izzat se baat"],
        createdAt: hoursAgo(40),
        authorName: "Muhammad Akram",
        categoryId: "cat-electrician",
      },
    ],
  },
];

const baseJob: Job = {
  id: "",
  mode: "open",
  status: "open",
  customerId: "h1",
  customerName: "Ayesha Malik",
  categoryId: "cat-electrician",
  description: "گھر کا پنکھا نہیں چل رہا، آواز بھی آ رہی ہے۔",
  urgency: "urgent",
  area: "G-9/2",
  location: HOME,
  scheduledFor: hoursAhead(2),
  photoUrls: [],
  floor: 500,
  step: 50,
  proposedPrice: null,
  proposedBy: null,
  agreedPrice: null,
  workerIds: [],
  crewId: null,
  card: null,
  customerConfirmed: false,
  workerConfirmed: false,
  createdAt: hoursAgo(0.2),
  completedAt: null,
};

export const jobs: Job[] = [
  { ...baseJob, id: "j-open" },
  {
    ...baseJob,
    id: "j-open-2",
    categoryId: "cat-plumber",
    description: "باتھ روم کا نلکا ٹپک رہا ہے۔",
    area: "G-10/3",
    urgency: "normal",
    floor: 500,
  },
  {
    ...baseJob,
    id: "j-nego",
    mode: "direct",
    status: "negotiating",
    proposedPrice: 1200,
    proposedBy: "u-w1",
    workerIds: ["w1"],
  },
  {
    ...baseJob,
    id: "j-card",
    mode: "direct",
    status: "pending_confirmation",
    agreedPrice: 1100,
    workerIds: ["w1"],
    customerConfirmed: false,
    workerConfirmed: true,
    card: {
      task: "کمرے کا پنکھا ٹھیک کرنا اور آواز چیک کرنا",
      addressArea: "G-9/2، اسلام آباد",
      time: "آج شام 5 بجے",
      agreedPrice: 1100,
    },
  },
  {
    ...baseJob,
    id: "j-engaged",
    mode: "direct",
    status: "engaged",
    agreedPrice: 1400,
    workerIds: ["w1"],
    customerConfirmed: true,
    workerConfirmed: true,
    description: "کچن کی وائرنگ ٹھیک کرنا",
    area: "F-10/2",
    card: {
      task: "کچن کی وائرنگ اور دو سوئچ بورڈ",
      addressArea: "F-10/2، اسلام آباد",
      time: "کل صبح 10 بجے",
      agreedPrice: 1400,
    },
  },
  {
    ...baseJob,
    id: "j-done",
    mode: "direct",
    status: "completed",
    agreedPrice: 1100,
    workerIds: ["w1"],
    customerConfirmed: true,
    workerConfirmed: true,
    completedAt: hoursAgo(1),
    card: {
      task: "کمرے کا پنکھا ٹھیک کرنا",
      addressArea: "G-9/2، اسلام آباد",
      time: "آج",
      agreedPrice: 1100,
    },
  },
  {
    ...baseJob,
    id: "j-crew",
    mode: "crew",
    status: "negotiating",
    categoryId: "cat-mistri",
    description: "چھت کی مرمت، دو دن کا کام۔ مستری، مزدور اور بجلی والا چاہیے۔",
    area: "I-8/3",
    floor: 4000,
    step: 100,
    proposedPrice: 9500,
    crewId: "c1",
    workerIds: ["w3", "w10", "w1"],
  },
];

export const offers: Offer[] = [
  { id: "o1", jobId: "j-open", worker: worker("w1"), price: 1100, etaMinutes: 20, status: "pending", createdAt: hoursAgo(0.1) },
  { id: "o2", jobId: "j-open", worker: worker("w12"), price: 900, etaMinutes: 35, status: "pending", createdAt: hoursAgo(0.08) },
  { id: "o3", jobId: "j-open", worker: worker("w5"), price: 1000, etaMinutes: 45, status: "pending", createdAt: hoursAgo(0.05) },
];

export const messages: Message[] = [
  {
    id: "m1",
    jobId: "j-nego",
    senderId: "h1",
    audioUrl: "mock",
    transcript: "بھائی پنکھا بالکل نہیں چل رہا، ہزار روپے میں ہو جائے گا؟",
    text: null,
    createdAt: hoursAgo(0.3),
  },
  {
    id: "m2",
    jobId: "j-nego",
    senderId: "u-w1",
    audioUrl: "mock",
    transcript: "باجی کیپیسٹر بھی بدلنا پڑ سکتا ہے، بارہ سو لگیں گے۔",
    text: null,
    createdAt: hoursAgo(0.25),
  },
];

const member = (id: string): WorkerCard => worker(id);

export const crews: Crew[] = [
  {
    id: "c1",
    name: "Ghulam Rasool Team",
    leaderId: "w3",
    members: [member("w3"), member("w10"), member("w1")],
    categoryIds: ["cat-mistri", "cat-labourer", "cat-electrician"],
    rate: 9500,
    available: true,
  },
  {
    id: "c2",
    name: "Zafar Hussain Team",
    leaderId: "w6",
    members: [member("w6"), member("w7")],
    categoryIds: ["cat-carpenter", "cat-painter"],
    rate: 7000,
    available: true,
  },
  {
    id: "c3",
    name: "Aslam Pervaiz Team",
    leaderId: "w13",
    members: [member("w13"), member("w2")],
    categoryIds: ["cat-plumber"],
    rate: 6000,
    available: false,
  },
];

export function earnings(): EarningsView {
  const amounts = [3200, 1800, 2600, 0, 4100, 2300, 1100];
  const daily = amounts.map((amount, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (amounts.length - 1 - index));
    return { date: date.toISOString(), amount };
  });
  const items: Earning[] = [
    { id: "e1", jobId: "j-done", amount: 1100, categoryId: "cat-electrician", earnedAt: hoursAgo(1), dayNumber: null },
    { id: "e2", jobId: "j2", amount: 1400, categoryId: "cat-electrician", earnedAt: hoursAgo(27), dayNumber: 2 },
    { id: "e3", jobId: "j3", amount: 900, categoryId: "cat-electrician", earnedAt: hoursAgo(30), dayNumber: 1 },
    { id: "e4", jobId: "j4", amount: 2100, categoryId: "cat-electrician", earnedAt: hoursAgo(50), dayNumber: null },
    { id: "e5", jobId: "j5", amount: 2000, categoryId: "cat-electrician", earnedAt: hoursAgo(54), dayNumber: null },
  ];
  return { items, today: amounts[amounts.length - 1] ?? 0, week: amounts.reduce((a, b) => a + b, 0), jobCount: 14, daily };
}


export function adminWorkers(): AdminWorkerRow[] {
  return workers.slice(0, 8).map((w, index) => ({
    ...w,
    approved: index > 2,
    phone: `0300-55501${String(index).padStart(2, "0")}`,
    cnicDuplicateChecked: index % 2 === 0,
    createdByAgent: index === 1 ? "Bilal Khan" : null,
    suspended: false,
  }));
}

export function adminDisputes(): Dispute[] {
  return [
    {
      id: "d1",
      jobId: "j-done",
      categoryId: "cat-plumber",
      customerName: "Noman Raza",
      workerName: "Bashir Ahmed",
      reason: "Customer says the leak returned the next day; worker says the agreed job was only the tap.",
      agreedPrice: 1500,
      openedAt: hoursAgo(5),
    },
  ];
}
