import type { Lang } from "../lib/settings";
import type { AppSettings, Area, Category, Offer, WorkerCard } from "./types";

/** Display labels for common Roman Urdu tags and skills. Unknown text is shown as it is. */
const PHRASES: Record<string, { ur: string; en: string }> = {
  "waqt ka paband": { ur: "وقت کا پابند", en: "On time" },
  "munasib qeemat": { ur: "مناسب قیمت", en: "Fair price" },
  "saaf kaam": { ur: "صاف کام", en: "Clean work" },
  "tameez se baat": { ur: "تمیز سے بات", en: "Polite" },
  mehnati: { ur: "محنتی", en: "Hard working" },
  "khush akhlaq": { ur: "خوش اخلاق", en: "Good manners" },
  tajurbakar: { ur: "تجربہ کار", en: "Experienced" },
  "jaldi pohancha": { ur: "جلدی پہنچا", en: "Came quickly" },
  "paisay waqt par": { ur: "پیسے وقت پر", en: "Paid on time" },
  "zyada diya": { ur: "زیادہ دیا", en: "Paid extra" },
  "izzat se baat": { ur: "عزت سے بات", en: "Respectful" },
  "waqt par adaigi": { ur: "وقت پر ادائیگی", en: "Paid on time" },
  "adaigi mein der": { ur: "ادائیگی میں دیر", en: "Paid late" },
  "extra diya": { ur: "زیادہ دیا", en: "Paid extra" },
  "acha rawaiya": { ur: "اچھا رویہ", en: "Good behaviour" },
  "bura rawaiya": { ur: "برا رویہ", en: "Poor behaviour" },
  "izzat se pesh aaye": { ur: "عزت سے پیش آئے", en: "Respectful" },
  "tameez daar": { ur: "تمیز دار", en: "Polite" },
  mahir: { ur: "ماہر", en: "Skilled" },
  "jaldi kaam": { ur: "جلدی کام", en: "Quick work" },
  "bharosay ka aadmi": { ur: "بھروسے کا آدمی", en: "Trustworthy" },
  "pankha theek karna": { ur: "پنکھا ٹھیک کرنا", en: "Fan repair" },
  wiring: { ur: "وائرنگ", en: "Wiring" },
  "switch board": { ur: "سوئچ بورڈ", en: "Switch board" },
  "UPS lagana": { ur: "یو پی ایس لگانا", en: "UPS install" },
  "nalka theek karna": { ur: "نلکا ٹھیک کرنا", en: "Tap repair" },
  "pipe leakage": { ur: "پائپ لیکیج", en: "Pipe leaks" },
  "motor lagana": { ur: "موٹر لگانا", en: "Water motor" },
  geyser: { ur: "گیزر", en: "Geyser" },
  "AC service": { ur: "اے سی سروس", en: "AC service" },
  "gas bharna": { ur: "گیس بھرنا", en: "Gas refill" },
  "AC lagana": { ur: "اے سی لگانا", en: "AC install" },
  "darwaza banana": { ur: "دروازہ بنانا", en: "Door making" },
  "almari theek karna": { ur: "الماری ٹھیک کرنا", en: "Wardrobe repair" },
  "furniture polish": { ur: "فرنیچر پالش", en: "Furniture polish" },
  "gari ka engine": { ur: "گاڑی کا انجن", en: "Car engine" },
  "motorcycle repair": { ur: "موٹر سائیکل مرمت", en: "Motorcycle repair" },
  "oil change": { ur: "آئل چینج", en: "Oil change" },
  chinai: { ur: "چنائی", en: "Brickwork" },
  plaster: { ur: "پلستر", en: "Plaster" },
  "tile lagana": { ur: "ٹائل لگانا", en: "Tiling" },
  "saman uthana": { ur: "سامان اٹھانا", en: "Lifting" },
  khudai: { ur: "کھدائی", en: "Digging" },
  safai: { ur: "صفائی", en: "Cleaning" },
  "rang karna": { ur: "رنگ کرنا", en: "Painting" },
  distemper: { ur: "ڈسٹمپر", en: "Distemper" },
  "ghar ki safai": { ur: "گھر کی صفائی", en: "House cleaning" },
  "bartan dhona": { ur: "برتن دھونا", en: "Dishwashing" },
  "kapray dhona": { ur: "کپڑے دھونا", en: "Laundry" },
  "khana banana": { ur: "کھانا بنانا", en: "Cooking" },
};

/** A category skill's own Urdu word and each area's Urdu name, from the API. See rememberNames. */
const skillUrdu = new Map<string, string>();
const areaUrdu = new Map<string, string>();

/** Keeps the names only the API knows, so a screen can show them without loading the lists itself. */
export function rememberNames(areas: Area[], categories: Category[]): void {
  for (const area of areas) areaUrdu.set(area.name, area.nameUr);
  for (const category of categories) {
    for (const skill of category.skills) {
      const word = category.skillAliases?.[skill]?.find((alias) => !isLatin(alias));
      if (word) skillUrdu.set(skill, word);
    }
  }
}

export function phrase(text: string, lang: Lang): string {
  const entry = PHRASES[text] ?? PHRASES[text.trim().toLowerCase()];
  if (lang === "roman") return text;
  if (lang === "en") return entry?.en ?? text;
  return entry?.ur ?? skillUrdu.get(text) ?? text;
}

type Words = { ur: string; roman: string; en: string };
type Translate = (ur: string, roman: string, en: string) => string;

/** Tapping one of these saves the words in whatever language the person was using. */
export const HOUR_PRESETS: Words[] = [
  { ur: "صبح 9 سے شام 6", roman: "Subah 9 se sham 6", en: "9 am to 6 pm" },
  { ur: "سارا دن", roman: "Saara din", en: "All day" },
  { ur: "صرف شام کو", roman: "Sirf sham ko", en: "Evenings only" },
];

export const DISPUTE_REASONS: Words[] = [
  { ur: "کام پورا نہیں ہوا", roman: "Kaam poora nahi hua", en: "The work was not finished" },
  { ur: "پیسوں کا مسئلہ", roman: "Paison ka masla", en: "A problem with payment" },
  { ur: "برا رویہ", roman: "Bura rawaiya", en: "Bad behaviour" },
  { ur: "نہیں آیا", roman: "Nahi aaya", en: "They did not come" },
];

const SAVED_CHOICES: Words[] = [
  ...HOUR_PRESETS,
  ...DISPUTE_REASONS,
  // Other wordings of working hours that are already on profiles.
  { ur: "صبح 9 سے شام 6", roman: "Subah 9 se shaam 6", en: "9 am to 6 pm" },
  { ur: "صبح 8 سے دوپہر 2", roman: "Subah 8 se dopahar 2", en: "8 am to 2 pm" },
  { ur: "دوپہر 12 سے رات 8", roman: "Dopahar 12 se raat 8", en: "12 pm to 8 pm" },
  { ur: "پورا دن", roman: "Poora din", en: "All day" },
];

/** A saved choice in the reader's language. Anything the person wrote themselves stays as they wrote it. */
export function savedChoice(text: string, t: Translate): string {
  const wanted = text.trim().toLowerCase();
  const entry = SAVED_CHOICES.find((words) => [words.ur, words.roman.toLowerCase(), words.en.toLowerCase()].includes(wanted));
  return entry ? t(entry.ur, entry.roman, entry.en) : text;
}

const NAME_WORDS: Record<string, string> = {
  muhammad: "محمد",
  akram: "اکرم",
  bashir: "بشیر",
  ahmed: "احمد",
  ghulam: "غلام",
  rasool: "رسول",
  shahid: "شاہد",
  mehmood: "محمود",
  naveed: "نوید",
  iqbal: "اقبال",
  zafar: "ظفر",
  hussain: "حسین",
  imran: "عمران",
  masih: "مسیح",
  nasreen: "نسرین",
  bibi: "بی بی",
  shabana: "شبانہ",
  rafaqat: "رفاقت",
  ali: "علی",
  tariq: "طارق",
  sajid: "ساجد",
  aslam: "اسلم",
  pervaiz: "پرویز",
  kashif: "کاشف",
  javed: "جاوید",
  yousaf: "یوسف",
  khan: "خان",
  arshad: "ارشد",
  sadia: "سعدیہ",
  malik: "ملک",
  ayesha: "عائشہ",
  noman: "نعمان",
  raza: "رضا",
  fatima: "فاطمہ",
  hina: "حنا",
  usman: "عثمان",
  waqas: "وقاص",
  sana: "ثناء",
  rashid: "راشد",
  saeed: "سعید",
  bilal: "بلال",
  crew: "کریو",
};

/** Show a Roman name in Urdu script when every word is known, otherwise leave it alone. */
export function personName(name: string, lang: Lang): string {
  if (lang !== "ur") return name;
  const words = name.trim().split(/\s+/);
  const mapped = words.map((word) => NAME_WORDS[word.toLowerCase()]);
  return mapped.every(Boolean) ? mapped.join(" ") : name;
}

export function firstName(name: string, lang: Lang): string {
  return personName(name, lang).split(" ")[0] ?? name;
}

const AREAS: Record<string, string> = {
  Saddar: "صدر",
  "Satellite Town": "سیٹلائٹ ٹاؤن",
  "Blue Area": "بلیو ایریا",
  "Bahria Town": "بحریہ ٹاؤن",
};

export function areaName(area: string, lang: Lang): string {
  // Sector codes such as G-9 are read the same way in both scripts.
  if (lang !== "ur" || /^[A-Z]-\d+$/.test(area)) return area;
  return areaUrdu.get(area) ?? AREAS[area] ?? area;
}

export function categoryName(category: Category | undefined, lang: Lang): string {
  if (!category) return "";
  return lang === "ur" ? category.nameUr : lang === "roman" ? category.nameRoman : category.nameEn;
}

/** True when the text has no Urdu or Arabic letters, so it should use the Latin font. */
export function isLatin(text: string): boolean {
  return !/[؀-ۿ]/.test(text);
}

/** One person's part of a crew's per-day price, as the server pays it: equal shares, the leader keeps the remainder. */
export function crewShare(perDay: number, people: number, isLeader: boolean): number {
  const share = Math.floor(perDay / Math.max(1, people));
  return isLeader ? perDay - share * (people - 1) : share;
}

export function rupees(amount: number): string {
  return `Rs ${amount.toLocaleString("en-PK")}`;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function splitFee(settings: AppSettings) {
  const agentShare = Math.round((settings.agentSignupFee * settings.agentSharePercent) / 100);
  return { fee: settings.agentSignupFee, agentShare, platformShare: settings.agentSignupFee - agentShare };
}

/** Share of reviews that praised punctuality, or null when there are no reviews yet. */
export function onTimePercent(worker: WorkerCard): number | null {
  if (worker.trust.ratingCount === 0) return null;
  const tagged = worker.trust.tags.find((t) => t.tag === "waqt ka paband")?.count ?? 0;
  return Math.min(100, Math.round((tagged / worker.trust.ratingCount) * 100));
}

/** The offer that best balances rating, distance and price. Not an AI decision. */
export function bestOfferId(offers: Offer[]): string | null {
  let best: { id: string; score: number } | null = null;
  const lowest = Math.min(...offers.map((o) => o.price));
  for (const offer of offers) {
    const score = offer.worker.trust.rating * 2 - (offer.worker.distanceKm ?? 0) * 0.3 - (offer.price - lowest) / 200;
    if (!best || score > best.score) best = { id: offer.id, score };
  }
  return best?.id ?? null;
}
