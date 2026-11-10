/** Text normalisation for Urdu script, Roman Urdu and English. */

const URDU_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const INVISIBLE = /[​-‏‪-‮⁠﻿]/g;
const URDU_LETTER = /[؀-ۿݐ-ݿ]/;

const URDU_VARIANTS: Record<string, string> = {
  "ي": "ی", // Arabic yeh
  "ى": "ی", // alef maksura
  "ئ": "ی", // yeh with hamza
  "ے": "ی", // bari yeh
  "ك": "ک", // Arabic kaf
  "ه": "ہ", // Arabic heh
  "ة": "ہ", // teh marbuta
  "ۃ": "ہ",
  "ۂ": "ہ",
  "أ": "ا", // alef variants
  "إ": "ا",
  "آ": "ا",
  "ؤ": "و", // waw with hamza
};

const DIGITS: Record<string, string> = {};
"۰۱۲۳۴۵۶۷۸۹".split("").forEach((d, i) => (DIGITS[d] = String(i)));
"٠١٢٣٤٥٦٧٨٩".split("").forEach((d, i) => (DIGITS[d] = String(i)));

export function isUrduScript(text: string): boolean {
  return URDU_LETTER.test(text);
}

export function normalizeDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] ?? d);
}

export function normalizeUrdu(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .replace(URDU_MARKS, "")
    .replace(/[؀-ۿ]/g, (c) => URDU_VARIANTS[c] ?? c);
}

const URDU_TO_ROMAN: Record<string, string> = {
  "ا": "a",
  "ب": "b",
  "پ": "p",
  "ت": "t",
  "ٹ": "t",
  "ث": "s",
  "ج": "j",
  "چ": "ch",
  "ح": "h",
  "خ": "kh",
  "د": "d",
  "ڈ": "d",
  "ذ": "z",
  "ر": "r",
  "ڑ": "r",
  "ز": "z",
  "ژ": "zh",
  "س": "s",
  "ش": "sh",
  "ص": "s",
  "ض": "z",
  "ط": "t",
  "ظ": "z",
  "ع": "",
  "غ": "gh",
  "ف": "f",
  "ق": "k",
  "ک": "k",
  "گ": "g",
  "ل": "l",
  "م": "m",
  "ن": "n",
  "ں": "n",
  "ھ": "h",
  "ء": "",
};

/** Letter-level Urdu to Roman. Short vowels are not written in Urdu, so this is a consonant-rich key. */
export function urduToRoman(word: string): string {
  const letters = Array.from(normalizeUrdu(word));
  let out = "";
  letters.forEach((c, i) => {
    const first = i === 0;
    const last = i === letters.length - 1;
    // Before an alif these letters are consonants: دروازہ is darwaza, not "droaza".
    const beforeAlif = letters[i + 1] === "ا";
    if (c === "و") out += first || beforeAlif ? "v" : "o";
    else if (c === "ی") out += first || beforeAlif ? "y" : "i";
    else if (c === "ہ") out += last ? "a" : "h";
    else out += URDU_TO_ROMAN[c] ?? "";
  });
  return out;
}

/** Folds common Roman Urdu and English spelling differences into one form. */
export function canonicalRoman(word: string): string {
  let w = word.toLowerCase();
  w = w.replace(/cian$/, "shan").replace(/[ts]ion$/, "shan");
  w = w.replace(/ck/g, "k").replace(/q/g, "k").replace(/x/g, "ks").replace(/w/g, "v");
  w = w.replace(/ph/g, "f");
  w = w.replace(/c(?!h)/g, "k");
  w = w.replace(/a{2,}/g, "a").replace(/(?:e{2,}|i{2,})/g, "i").replace(/(?:o{2,}|u{2,})/g, "u");
  w = w.replace(/(?:ey|ay|ai)$/, "e");
  w = w.replace(/y$/, "i");
  w = w.replace(/([aeiou])h$/, "$1");
  w = w.replace(/([b-df-hj-np-tv-z])\1/g, "$1");
  return w;
}

/** Consonants only. Catches vowel-dropping SMS spellings such as "bjli" and "mstri". */
export function skeleton(canon: string): string {
  return canon.replace(/[aeiou]/g, "");
}

export function tokenize(text: string): string[] {
  const cleaned = normalizeDigits(normalizeUrdu(text.normalize("NFKC")))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return cleaned ? cleaned.split(/\s+/) : [];
}

const ENGLISH_ENDINGS = ["ings", "ers", "ing", "iti", "er", "ed", "s"];
const MIN_STEM = 4;

/** English endings on a canonical word. "iti" is -ity after canonicalRoman has folded it. */
export function englishStem(canon: string): string {
  for (const ending of ENGLISH_ENDINGS) {
    if (canon.endsWith(ending) && canon.length - ending.length >= MIN_STEM) return canon.slice(0, -ending.length);
  }
  return canon;
}

export interface TokenForm {
  raw: string;
  canon: string;
  skeleton: string;
  urdu: boolean;
  stem: string;
}

export function tokenForm(raw: string): TokenForm {
  const urdu = isUrduScript(raw);
  const canon = canonicalRoman(urdu ? urduToRoman(raw) : raw);
  return { raw, canon, skeleton: skeleton(canon), urdu, stem: urdu ? canon : englishStem(canon) };
}

/** One spelling-independent string for a phrase, used to merge trust tags and similar labels. */
export function canonicalText(text: string): string {
  return tokenize(text)
    .map((t) => tokenForm(t).canon)
    .join(" ");
}
