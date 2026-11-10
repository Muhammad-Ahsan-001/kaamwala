/** The slice of an admin-managed Category that Jev needs. Jev holds no trade list of its own. */
export interface JevCategory {
  id: string;
  nameUr: string;
  nameRoman: string;
  nameEn: string;
  keywords: string[];
  skills: string[];
  /** Extra words that point at one skill, e.g. { "Fan repair": ["pankha", "پنکھا"] }. */
  skillAliases?: Record<string, string[]>;
  /** Inactive categories are left out of matching. Defaults to active. */
  active?: boolean;
}

export interface JevSkillMatch {
  skill: string;
  confidence: number;
}

export interface JevMatch {
  categoryId: string;
  /** 0 to 1, lowered when a second category scores almost as high. */
  confidence: number;
  /** 0 to 1, the raw evidence before the ambiguity adjustment. */
  score: number;
  matchedTerms: string[];
  skills: JevSkillMatch[];
}

export interface JevResult {
  input: string;
  tokens: string[];
  matches: JevMatch[];
  /** The top match when it clears the confidence threshold, otherwise null. */
  best: JevMatch | null;
}

export type JevUrgency = "low" | "normal" | "urgent";

export interface JevProfileHints {
  name: string | null;
  years: number | null;
  rate: number | null;
  area: string | null;
}

export type JevProfileField = keyof JevProfileHints;
