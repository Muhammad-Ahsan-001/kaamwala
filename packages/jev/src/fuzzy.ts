import type { TokenForm } from "./normalize";

/** Optimal string alignment distance: Levenshtein plus adjacent transposition. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = new Array<number>(rows * cols).fill(0);
  const at = (i: number, j: number) => d[i * cols + j] as number;
  for (let i = 0; i < rows; i++) d[i * cols] = i;
  for (let j = 0; j < cols; j++) d[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      d[i * cols + j] = best;
    }
  }
  return at(a.length, b.length);
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - editDistance(a, b) / max;
}

const MIN_SKELETON = 3;
const MIN_FUZZY_LENGTH = 4;
const FUZZY_THRESHOLD = 0.78;
/** Skeletons across scripts carry no vowels to check, so only a near-identical long word counts. */
const CROSS_SCRIPT_THRESHOLD = 0.87;
const STEM_SCORE = 0.88;
const MIN_ING_TERM = 7;
const MIN_LONG_WORD = 7;

/** The vowels around each consonant: "soket" is ["", "o", "e", ""]. */
function vowelSlots(canon: string): string[] {
  const slots = [""];
  for (const letter of canon) {
    if ("aeiou".includes(letter)) slots[slots.length - 1] += letter;
    else slots.push("");
  }
  return slots;
}

/** Roman spellings swing between e and i, and between o and u, so each pair counts as one sound. */
const foldVowels = (slot: string) => slot.replace(/e/g, "i").replace(/u/g, "o");

function isSubsequence(short: string, long: string): boolean {
  let at = 0;
  for (const letter of long) if (letter === short[at]) at++;
  return at === short.length;
}

function slotsAgree(a: string, b: string): boolean {
  const x = foldVowels(a);
  const y = foldVowels(b);
  return isSubsequence(x, y) || isSubsequence(y, x);
}

/** Someone typing Roman in a hurry drops every vowel. Urdu leaves out short ones but writes a final one. */
const droppedEveryVowel = (form: TokenForm, slots: string[]) => !form.urdu && slots.every((s) => !s);

/**
 * Same consonants is not the same word: sakte and socket share s-k-t. Vowels written in the same
 * place must agree. A dropped interior vowel is fine (bijli, bjli and بجلی), but a word's ending
 * must match, because that is where khan and khana, or saman and سامنے, part ways.
 */
function vowelsAgree(a: TokenForm, b: TokenForm): boolean {
  const left = vowelSlots(a.canon);
  const right = vowelSlots(b.canon);
  if (droppedEveryVowel(a, left) || droppedEveryVowel(b, right)) return true;
  const last = left.length - 1;
  return left.every((slot, i) => {
    const other = right[i] as string;
    // A word-initial alif stands for any opening vowel: الیکٹریشن is electrician.
    if (i === 0 && a.urdu !== b.urdu) return true;
    if (!slot || !other) return i !== last || slot === other;
    return slotsAgree(slot, other);
  });
}

const sameWordShape = (a: TokenForm, b: TokenForm) =>
  a.skeleton.length >= MIN_SKELETON && a.skeleton === b.skeleton && vowelsAgree(a, b);

const isVowel = (letter: string | undefined) => letter !== undefined && "aeiou".includes(letter);

/** In a short word a final vowel makes a different word: khan and khana. In a long one it is a typo. */
function differOnlyByEnding(a: string, b: string): boolean {
  return Math.max(a.length, b.length) < MIN_LONG_WORD && isVowel(a.at(-1)) !== isVowel(b.at(-1));
}

/** "leaking" finds leak and "cleaner" finds cleaning, without "breaking" finding breaker. */
function stemMatches(text: TokenForm, term: TokenForm): boolean {
  const base = term.canon.length >= MIN_ING_TERM && term.canon.endsWith("ing") ? term.canon.slice(0, -3) : term.canon;
  return text.stem === base;
}

/** How alike a word in the text is to a dictionary word, 0 when they should not count as the same. */
export function tokenScore(a: TokenForm, b: TokenForm): number {
  if (a.raw === b.raw) return 1;

  if (a.urdu && b.urdu) {
    if (a.canon === b.canon) return 0.97;
    if (Math.min(a.raw.length, b.raw.length) < MIN_FUZZY_LENGTH) return 0;
    const sim = similarity(a.raw, b.raw);
    return sim >= 0.8 ? sim * 0.9 : 0;
  }

  if (a.urdu !== b.urdu) {
    if (a.canon === b.canon) return 0.95;
    if (sameWordShape(a, b)) return 0.82;
    if (Math.min(a.skeleton.length, b.skeleton.length) < MIN_FUZZY_LENGTH) return 0;
    if (a.skeleton[0] !== b.skeleton[0]) return 0;
    const sim = similarity(a.skeleton, b.skeleton);
    return sim >= CROSS_SCRIPT_THRESHOLD ? sim * 0.78 : 0;
  }

  if (a.canon === b.canon) return 0.97;
  if (stemMatches(a, b)) return STEM_SCORE;
  if (sameWordShape(a, b)) return 0.8;
  if (Math.min(a.canon.length, b.canon.length) < MIN_FUZZY_LENGTH) return 0;
  if (a.canon[0] !== b.canon[0] || differOnlyByEnding(a.canon, b.canon)) return 0;
  const sim = similarity(a.canon, b.canon);
  return sim >= FUZZY_THRESHOLD ? sim * 0.9 : 0;
}
