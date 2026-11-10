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

/** How alike two words are, 0 when they should not count as the same word. */
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
    if (a.skeleton.length >= MIN_SKELETON && a.skeleton === b.skeleton) return 0.82;
    if (Math.min(a.skeleton.length, b.skeleton.length) < MIN_FUZZY_LENGTH) return 0;
    const sim = similarity(a.skeleton, b.skeleton);
    return sim >= 0.8 ? sim * 0.78 : 0;
  }

  if (a.canon === b.canon) return 0.97;
  if (a.skeleton.length >= MIN_SKELETON && a.skeleton === b.skeleton) return 0.8;
  if (Math.min(a.canon.length, b.canon.length) < MIN_FUZZY_LENGTH) return 0;
  if (a.canon[0] !== b.canon[0]) return 0;
  const sim = similarity(a.canon, b.canon);
  return sim >= FUZZY_THRESHOLD ? sim * 0.9 : 0;
}
