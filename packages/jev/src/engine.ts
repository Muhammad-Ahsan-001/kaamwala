import { tokenScore } from "./fuzzy";
import { RUPEE_UNITS, STOP_WORDS, YEAR_UNITS, readAmount, readCount } from "./language";
import { canonicalRoman, isUrduScript, normalizeUrdu, tokenForm, tokenize, type TokenForm } from "./normalize";
import type { JevCategory, JevMatch, JevProfileField, JevProfileHints, JevResult } from "./types";

interface Term {
  display: string;
  forms: TokenForm[];
  joined: string;
  categoryId: string;
  skill: string | null;
  weight: number;
}

interface Hit {
  term: Term;
  effective: number;
  tokens: number[];
}

const WEIGHT_NAME = 1;
const WEIGHT_KEYWORD = 0.92;
const WEIGHT_SKILL = 0.85;
const PHRASE_TOKEN_MIN = 0.7;
const PHRASE_GAP = 1;
const BEST_THRESHOLD = 0.4;
/** Jev is synchronous on the main thread, so no single text may be long enough to stall it. */
const MAX_TEXT_CHARS = 4000;
/** No adjacent open-ended whitespace runs: this one is walked on untrusted text. */
const SECTOR_PATTERN = /\b([defghi])[\s-]{0,4}(\d{1,2})(?:\s{0,2}\/\s{0,2}(\d))?\b/i;

const round = (n: number) => Math.round(n * 1000) / 1000;
const bounded = (text: string) => text.slice(0, MAX_TEXT_CHARS);

function buildTerm(display: string, categoryId: string, skill: string | null, weight: number): Term | null {
  const tokens = tokenize(display);
  if (!tokens.length) return null;
  const forms = tokens.map(tokenForm);
  return { display, forms, joined: forms.map((f) => f.canon).join(""), categoryId, skill, weight };
}

export interface MatchOptions {
  limit?: number;
}

export class Jev {
  private terms: Term[] = [];
  /** How many categories share a term, so a word common to many trades counts for less. */
  private spread = new Map<string, number>();
  private known = new Set<string>();
  private categoryIds = new Set<string>();

  constructor(categories: JevCategory[] = []) {
    this.load(categories);
  }

  /** Replaces the dictionary. Call whenever a category changes. */
  load(categories: JevCategory[]): void {
    const terms: Term[] = [];
    const owners = new Map<string, Set<string>>();
    const known = new Set<string>();
    const categoryIds = new Set<string>();

    const add = (text: string, categoryId: string, skill: string | null, weight: number) => {
      const term = buildTerm(text, categoryId, skill, weight);
      if (!term) return;
      terms.push(term);
      for (const form of term.forms) known.add(form.canon);
      const owner = owners.get(term.joined) ?? new Set<string>();
      owner.add(categoryId);
      owners.set(term.joined, owner);
    };

    for (const c of categories) {
      if (c.active === false) continue;
      categoryIds.add(c.id);
      for (const name of [c.nameUr, c.nameRoman, c.nameEn]) add(name, c.id, null, WEIGHT_NAME);
      for (const keyword of c.keywords) add(keyword, c.id, null, WEIGHT_KEYWORD);
      for (const skill of c.skills) {
        add(skill, c.id, skill, WEIGHT_SKILL);
        for (const alias of c.skillAliases?.[skill] ?? []) add(alias, c.id, skill, WEIGHT_SKILL);
      }
    }

    this.terms = terms;
    this.known = known;
    this.categoryIds = categoryIds;
    this.spread = new Map([...owners].map(([k, v]) => [k, v.size]));
  }

  hasCategory(id: string): boolean {
    return this.categoryIds.has(id);
  }

  match(text: string, options: MatchOptions = {}): JevResult {
    const limit = options.limit ?? 5;
    const tokens = tokenize(bounded(text));
    const forms = tokens.map(tokenForm);
    const hits = this.findHits(tokens, forms);

    const byCategory = new Map<string, Hit[]>();
    for (const hit of hits) {
      const list = byCategory.get(hit.term.categoryId) ?? [];
      list.push(hit);
      byCategory.set(hit.term.categoryId, list);
    }

    const scored = [...byCategory].map(([categoryId, list]) => this.scoreCategory(categoryId, list));
    scored.sort((a, b) => b.score - a.score);

    const matches: JevMatch[] = scored.slice(0, limit).map((m, i) => {
      const rival = i === 0 ? (scored[1]?.score ?? 0) : (scored[0]?.score ?? 0);
      const ambiguity = m.score > 0 ? Math.min(1, rival / m.score) : 0;
      return { ...m, confidence: round(m.score * (1 - 0.25 * ambiguity)) };
    });

    const top = matches[0];
    // An exact tie would otherwise be settled by dictionary order, which means nothing.
    const tied = scored.length > 1 && scored[0]?.score === scored[1]?.score;
    return {
      input: text,
      tokens,
      matches,
      best: top && !tied && top.confidence >= BEST_THRESHOLD ? top : null,
    };
  }

  /** Skills within one category that the text points at. */
  skillsFor(text: string, categoryId: string): string[] {
    const found = this.match(text, { limit: Number.MAX_SAFE_INTEGER }).matches.find(
      (m) => m.categoryId === categoryId,
    );
    return found ? found.skills.map((s) => s.skill) : [];
  }

  /**
   * Maps free-text skill tags onto the official skill names of the given categories.
   * Tags Jev cannot place are kept, tidied, so a real skill is never thrown away.
   */
  normalizeSkills(tags: string[], categoryIds: string[]): string[] {
    const out = new Map<string, string>();
    for (const tag of tags) {
      const cleaned = tag.trim();
      if (!cleaned) continue;
      const found = this.match(cleaned, { limit: Number.MAX_SAFE_INTEGER }).matches.find(
        (m) => categoryIds.includes(m.categoryId) && m.skills.length > 0,
      );
      const skill = found?.skills[0]?.skill ?? cleaned;
      out.set(skill.toLowerCase(), skill);
    }
    return [...out.values()];
  }

  /** Best-effort reading of a typed or transcribed self-introduction. Empty when nothing is found. */
  parseProfile(raw: string, options: { areas?: string[] } = {}): JevProfileHints {
    const text = bounded(raw);
    const tokens = tokenize(text);
    return {
      name: this.findName(text, tokens),
      years: this.findYears(tokens),
      rate: this.findRate(tokens),
      area: this.findArea(text, tokens, options.areas ?? []),
    };
  }

  /**
   * Reads a reply that answers one question, such as "پانچ" when asked for years of experience.
   * Only that field is filled, and a bare number is taken as the answer.
   */
  parseField(raw: string, field: JevProfileField, options: { areas?: string[] } = {}): JevProfileHints {
    const text = bounded(raw);
    const tokens = tokenize(text);
    const hints: JevProfileHints = { name: null, years: null, rate: null, area: null };
    if (field === "name") hints.name = this.findName(text, tokens) ?? bareName(text);
    if (field === "years") hints.years = this.findYears(tokens) ?? firstCount(tokens, 70);
    if (field === "rate") hints.rate = this.findRate(tokens) ?? firstAmount(tokens);
    if (field === "area") hints.area = this.findArea(text, tokens, options.areas ?? []);
    return hints;
  }

  private findHits(tokens: string[], forms: TokenForm[]): Hit[] {
    const hits: Hit[] = [];
    for (const term of this.terms) {
      const discount = 1 / Math.sqrt(this.spread.get(term.joined) ?? 1);
      const push = (score: number, used: number[]) =>
        hits.push({ term, effective: score * term.weight * discount, tokens: used });

      if (term.forms.length === 1) {
        const form = term.forms[0] as TokenForm;
        forms.forEach((f, i) => {
          if (STOP_WORDS.has(tokens[i] as string)) return;
          const score = tokenScore(f, form);
          if (score > 0) push(score, [i]);
        });
        for (let i = 0; i + 1 < forms.length; i++) {
          const a = forms[i] as TokenForm;
          const b = forms[i + 1] as TokenForm;
          if (a.urdu === b.urdu && a.canon + b.canon === form.canon) push(0.9, [i, i + 1]);
        }
        continue;
      }

      forms.forEach((f, i) => {
        if (STOP_WORDS.has(tokens[i] as string)) return;
        if (f.canon.length >= 4 && f.canon === term.joined) push(0.95, [i]);
      });

      for (let start = 0; start < forms.length; start++) {
        const phrase = this.matchPhrase(term, forms, start);
        if (phrase) push(phrase.score, phrase.used);
      }
    }
    return hits;
  }

  private matchPhrase(term: Term, forms: TokenForm[], start: number) {
    const used: number[] = [];
    let total = 0;
    let pos = start;
    for (let t = 0; t < term.forms.length; t++) {
      const want = term.forms[t] as TokenForm;
      let found = -1;
      let foundScore = 0;
      const limit = t === 0 ? start : pos + PHRASE_GAP;
      for (let i = pos; i <= limit && i < forms.length; i++) {
        const score = tokenScore(forms[i] as TokenForm, want);
        if (score >= PHRASE_TOKEN_MIN) {
          found = i;
          foundScore = score;
          break;
        }
      }
      if (found < 0) return null;
      used.push(found);
      total += foundScore;
      pos = found + 1;
    }
    return { used, score: total / term.forms.length };
  }

  private scoreCategory(categoryId: string, hits: Hit[]) {
    const ordered = [...hits].sort((a, b) => b.effective - a.effective);
    const consumed = new Set<number>();
    const accepted: Hit[] = [];
    for (const hit of ordered) {
      if (hit.tokens.some((t) => consumed.has(t))) continue;
      hit.tokens.forEach((t) => consumed.add(t));
      accepted.push(hit);
    }

    const score = Math.min(0.99, 1 - accepted.reduce((left, h) => left * (1 - h.effective), 1));

    const skills = new Map<string, number>();
    for (const hit of ordered) {
      const skill = hit.term.skill;
      if (skill) skills.set(skill, Math.max(skills.get(skill) ?? 0, hit.effective));
    }

    return {
      categoryId,
      score: round(score),
      matchedTerms: [...new Set(accepted.map((h) => h.term.display))],
      skills: [...skills]
        .sort((a, b) => b[1] - a[1])
        .map(([skill, confidence]) => ({ skill, confidence: round(confidence) })),
    };
  }

  private findName(text: string, tokens: string[]): string | null {
    const roman = text.match(
      /(?:mera\s+naam|my\s+name\s+is|name\s+is)\s+([a-z]+(?:\s+[a-z]+){0,2}?)(?=\s+(?:hai|he|hay|h)\b|\s*[,.]|\s*$)/i,
    );
    if (roman?.[1]) return titleCase(roman[1]);

    const urdu = normalizeUrdu(text).match(/میرا\s+نام\s+([؀-ۿ]+(?:\s+[؀-ۿ]+){0,2}?)\s+ہ/u);
    if (urdu?.[1]) return urdu[1].trim();

    const intro = tokens.findIndex((t, i) => t === "main" && /^(hoon|hun|hu)$/.test(tokens[i + 2] ?? ""));
    const candidate = intro >= 0 ? tokens[intro + 1] : undefined;
    if (candidate && !STOP_WORDS.has(candidate) && !this.known.has(canonicalRoman(candidate))) {
      return titleCase(candidate);
    }
    return null;
  }

  private findYears(tokens: string[]): number | null {
    for (let i = 1; i < tokens.length; i++) {
      if (!YEAR_UNITS.has(tokens[i] as string)) continue;
      const count = readCount(tokens[i - 1]);
      if (count !== null && count <= 70) return count;
    }
    return null;
  }

  private findRate(tokens: string[]): number | null {
    for (let i = 0; i < tokens.length; i++) {
      if (RUPEE_UNITS.has(tokens[i] as string)) {
        const after = readAmount(tokens, i + 1);
        if (after && after.value >= 50) return after.value;
      }
      const amount = readAmount(tokens, i);
      if (!amount) continue;
      const isWords = !/^\d+$/.test(tokens[i] as string);
      const next = tokens[i + amount.length];
      if (isWords && amount.value >= 100) return amount.value;
      if (next !== undefined && RUPEE_UNITS.has(next) && amount.value >= 50) return amount.value;
    }
    return null;
  }

  private findArea(text: string, tokens: string[], areas: string[]): string | null {
    const sector = text.match(SECTOR_PATTERN);
    if (sector?.[1] && sector[2]) {
      const base = `${sector[1].toUpperCase()}-${sector[2]}`;
      return sector[3] ? `${base}/${sector[3]}` : base;
    }

    const forms = tokens.map(tokenForm);
    for (const area of areas) {
      const parts = tokenize(area).map(tokenForm);
      if (!parts.length) continue;
      for (let start = 0; start + parts.length <= forms.length; start++) {
        const all = parts.every((p, j) => tokenScore(forms[start + j] as TokenForm, p) >= 0.8);
        if (all) return area;
      }
    }
    return null;
  }
}

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const MAX_NAME_WORDS = 4;

function bareName(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > MAX_NAME_WORDS || /\d/.test(text)) return null;
  return isUrduScript(text) ? words.join(" ") : titleCase(words.join(" "));
}

function firstCount(tokens: string[], max: number): number | null {
  for (const token of tokens) {
    const count = readCount(token);
    if (count !== null && count <= max) return count;
  }
  return null;
}

const MIN_RATE = 50;

function firstAmount(tokens: string[]): number | null {
  for (let i = 0; i < tokens.length; i++) {
    const value = readAmount(tokens, i)?.value;
    if (value !== undefined && value >= MIN_RATE) return value;
  }
  return null;
}
