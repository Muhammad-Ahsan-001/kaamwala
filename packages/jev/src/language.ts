/** General language knowledge only. Trade words live in the Category table, never here. */
import { normalizeUrdu, tokenize } from "./normalize";

const ROMAN_STOP = `
hai hain he hay h ka ki ke ko se mein main mai me mera meri mere mujhe muje hamara hamari
nahi nahin nai aur or par pe bhi ye yeh wo woh ek hoon hun hu ho gaya gayi gai gya gyi raha
rahi rha rhi kar karo karna karni karne krna kro chahiye chahye chahiey theek thik tik kharab
khrab ji bhai sahab sahib kya kyun kaise kab kahan koi kuch hua hui tha thi the wala wali wale
kaam kam the a an is am i my of to in on at and for not need needs please plz pls it its was
have has with this that we you
aa aao aana aaj aap ap abhi kal phir ab sa si se bohat bahut bhot thora thori liye lie
sakta sakti sakte saktay saktey sakun saken chhota chhoti chhote chota choti chote
samne samnay saamne samney someone anyone some one wrong number kehna kaha kehta kehti kehte
`;

const URDU_STOP = `
ہے ہیں کا کی کے کو سے میں میرا میری میرے مجھے ہمارا ہماری نہیں اور پر بھی یہ وہ ایک ہوں ہو گیا گئی
رہا رہی کر کرو کرنا کرنی کرنے چاہیے ٹھیک خراب جی بھائی صاحب کیا کیوں کیسے کب کہاں کوئی کچھ ہوا ہوئی تھا تھی
تھے والا والی والے کام
آ آپ آج کل ابھی پھر اب سا سی بہت تھوڑا تھوڑی لیے سکتا سکتی سکتے چھوٹا چھوٹی چھوٹے سامنے کہنا کہا کہتا کہتی کہتے
`;

export const STOP_WORDS: ReadonlySet<string> = new Set([
  ...ROMAN_STOP.trim().split(/\s+/),
  ...URDU_STOP.trim().split(/\s+/).map(normalizeUrdu),
]);

/** The words of a search that carry meaning. "need painting done" is painting and done. */
export const significantWords = (text: string): string[] =>
  tokenize(text).filter((word) => word.length > 1 && !STOP_WORDS.has(word));

const urdu = (words: string[]) => words.map(normalizeUrdu);

const NUMBER_WORDS: Record<string, number> = {};
const addNumbers = (value: number, words: string[]) => {
  for (const w of [...words, ...urdu(words)]) NUMBER_WORDS[w] = value;
};
addNumbers(1, ["ek", "aik", "one", "ایک"]);
addNumbers(2, ["do", "two", "دو"]);
addNumbers(3, ["teen", "tin", "three", "تین"]);
addNumbers(4, ["char", "chaar", "four", "چار"]);
addNumbers(5, ["panch", "paanch", "five", "پانچ"]);
addNumbers(6, ["che", "chay", "chhe", "chah", "six", "چھ"]);
addNumbers(7, ["saat", "sat", "seven", "سات"]);
addNumbers(8, ["aath", "ath", "eight", "آٹھ"]);
addNumbers(9, ["nau", "no", "nine", "نو"]);
addNumbers(10, ["das", "dus", "ten", "دس"]);
addNumbers(11, ["gyara", "gyarah", "گیارہ"]);
addNumbers(12, ["bara", "barah", "بارہ"]);
addNumbers(13, ["tera", "terah", "تیرہ"]);
addNumbers(14, ["chauda", "chodah", "chaudah", "چودہ"]);
addNumbers(15, ["pandra", "pandrah", "پندرہ"]);
addNumbers(16, ["sola", "solah", "سولہ"]);
addNumbers(17, ["satra", "satrah", "سترہ"]);
addNumbers(18, ["athara", "atharah", "اٹھارہ"]);
addNumbers(19, ["unees", "انیس"]);
addNumbers(20, ["bees", "bis", "بیس"]);
addNumbers(25, ["pachees", "پچیس"]);
addNumbers(30, ["tees", "تیس"]);
addNumbers(40, ["chalees", "چالیس"]);
addNumbers(50, ["pachas", "پچاس"]);

/** Holds each word as written and in normalised Urdu, so lookups on tokenised text succeed. */
export const wordSet = (words: string[]): ReadonlySet<string> => new Set([...words, ...urdu(words)]);

export const YEAR_UNITS = wordSet(["saal", "sal", "baras", "years", "year", "yrs", "yr", "سال", "برس"]);
export const RUPEE_UNITS = wordSet(["rs", "rupay", "rupaye", "rupees", "rupee", "rupe", "pkr", "روپے", "روپیہ", "روپی"]);
const HUNDRED = wordSet(["sau", "so", "hundred", "سو"]);
const THOUSAND = wordSet(["hazar", "hazaar", "thousand", "ہزار"]);

const parseCount = (token: string | undefined): number | null => {
  if (token === undefined) return null;
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
};

/** Reads "do hazaar paanch sau", "pandra sau" or "1500" starting at position i. */
export function readAmount(tokens: string[], i: number): { value: number; length: number } | null {
  let pos = i;
  let total = 0;
  let matched = false;
  for (const [units, factor] of [
    [THOUSAND, 1000],
    [HUNDRED, 100],
  ] as const) {
    const count = parseCount(tokens[pos]);
    const unit = tokens[pos + 1];
    if (count !== null && unit !== undefined && units.has(unit)) {
      total += count * factor;
      pos += 2;
      matched = true;
    }
  }
  if (matched) return { value: total, length: pos - i };
  const token = tokens[i];
  if (token !== undefined && /^\d+$/.test(token)) return { value: Number(token), length: 1 };
  return null;
}

export function readCount(token: string | undefined): number | null {
  return parseCount(token);
}

const LOW_URGENCY = [
  /koi jaldi nahi/,
  /jaldi nahi/,
  /no hurry/,
  /not urgent/,
  /agl[ae] haft[ae]/,
  /next week/,
  /کوئی جلدی نہیں/,
  /جلدی نہیں/,
].map((r) => new RegExp(normalizeUrdu(r.source), "u"));

const URGENT = [
  /\bfor[ao]n\b/,
  /\bfauran\b/,
  /\bjaldi\b/,
  /\babhi\b/,
  /\burgent\b/,
  /\bemergency\b/,
  /\basap\b/,
  /\bimmediately\b/,
  /\bright now\b/,
  /فوری/,
  /فورا/,
  /جلدی/,
  /ابھی/,
  /ہنگامی/,
].map((r) => new RegExp(normalizeUrdu(r.source), "u"));

export function detectUrgency(text: string): "low" | "normal" | "urgent" {
  const t = normalizeUrdu(text.toLowerCase());
  if (LOW_URGENCY.some((r) => r.test(t))) return "low";
  if (URGENT.some((r) => r.test(t))) return "urgent";
  return "normal";
}
