import type { Lang } from "../lib/settings";
import type { AppSettings, Category, Offer, WorkerCard } from "./types";

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

export function phrase(text: string, lang: Lang): string {
  const entry = PHRASES[text];
  if (!entry || lang === "roman") return text;
  return lang === "ur" ? entry.ur : entry.en;
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
  return lang === "ur" ? (AREAS[area] ?? area) : area;
}

export function categoryName(category: Category | undefined, lang: Lang): string {
  if (!category) return "";
  return lang === "ur" ? category.nameUr : lang === "roman" ? category.nameRoman : category.nameEn;
}

/** True when the text has no Urdu or Arabic letters, so it should use the Latin font. */
export function isLatin(text: string): boolean {
  return !/[؀-ۿ]/.test(text);
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
