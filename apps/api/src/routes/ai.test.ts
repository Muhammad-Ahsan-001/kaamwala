import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://unit:test@localhost:1/none";
  process.env.JWT_SECRET = "unit-test-secret-unit-test-secret";
  process.env.CNIC_SALT = "unit-test-salt-unit-test-salt-00";
});

vi.mock("../db", () => ({ prisma: { workerProfile: { findMany: async () => [] } } }));

import { CATEGORIES } from "../../prisma/categories";
import type { OnboardingExtract, ProblemExtract } from "../gemini";
import { jev } from "../jev";
import { buildAnalysis, buildDraft } from "./ai";

beforeAll(() => {
  jev.load(
    CATEGORIES.map((c) => ({
      id: c.id,
      nameUr: c.nameUr,
      nameRoman: c.nameRoman,
      nameEn: c.nameEn,
      keywords: c.keywords,
      skills: Object.keys(c.skills),
      skillAliases: c.skills,
    })),
  );
});

const onboarding = (over: Partial<OnboardingExtract>): OnboardingExtract => ({
  transcript: "",
  name: null,
  categoryIds: [],
  skills: [],
  years: null,
  rate: null,
  area: null,
  workingHours: null,
  ...over,
});

const problem = (over: Partial<ProblemExtract>): ProblemExtract => ({
  transcript: null,
  categoryId: null,
  skills: [],
  urgency: "normal",
  priceMin: null,
  priceMax: null,
  durationDays: null,
  summary: "summary",
  confidence: 0.3,
  ...over,
});

describe("buildDraft", () => {
  it("adds nothing to a valid Gemini answer", () => {
    const transcript = "pankha theek karta hoon, safai bhi";
    const draft = buildDraft(transcript, onboarding({ transcript, categoryIds: ["home-maid"], skills: ["safai"] }), null);
    expect(draft.categoryIds).toEqual(["home-maid"]);
    expect(draft.skills).toEqual(["House cleaning"]);
  });

  it("drops a category Gemini invented and falls back to Jev", () => {
    const transcript = "main electrician hoon";
    const draft = buildDraft(transcript, onboarding({ transcript, categoryIds: ["astronaut"] }), null);
    expect(draft.categoryIds).toEqual(["electrician"]);
  });

  it("uses Jev when Gemini is unavailable", () => {
    const draft = buildDraft("pankha theek karta hoon", null, null);
    expect(draft.categoryIds).toEqual(["electrician"]);
    expect(draft.source).toBe("jev_only");
  });

  it("reads a one-word answer as the field that was asked about", () => {
    const draft = buildDraft("پانچ", null, "years");
    expect(draft.years).toBe(5);
    expect(draft.rate).toBeNull();
    expect(draft.categoryIds).toEqual([]);
  });

  it("keeps only the corrected field from a model answer", () => {
    const transcript = "paanch";
    const draft = buildDraft(transcript, onboarding({ transcript, years: 5, rate: 1500, name: "Ali" }), "years");
    expect(draft.years).toBe(5);
    expect(draft.rate).toBeNull();
    expect(draft.name).toBeNull();
  });

  it("takes a bare name as the name", () => {
    expect(buildDraft("imran khan", null, "name").name).toBe("Imran Khan");
  });

  it("takes a spoken amount as the rate", () => {
    expect(buildDraft("pandra sau", null, "rate").rate).toBe(1500);
  });

  it("keeps working hours as said", () => {
    expect(buildDraft("subah 9 se shaam 6", null, "workingHours").workingHours).toBe("subah 9 se shaam 6");
  });
});

describe("buildAnalysis", () => {
  it("lets Gemini say no category fits", async () => {
    const result = await buildAnalysis("nalka tapak raha hai", problem({ categoryId: null }));
    expect(result.categoryId).toBeNull();
    expect(result.skills).toEqual([]);
  });

  it("keeps Gemini's category", async () => {
    const result = await buildAnalysis("pankha", problem({ categoryId: "home-maid" }));
    expect(result.categoryId).toBe("home-maid");
  });

  it("treats an invented id as no answer and asks Jev", async () => {
    const result = await buildAnalysis("nalka tapak raha hai", problem({ categoryId: "astronaut" }));
    expect(result.categoryId).toBe("plumber");
  });

  it("uses Jev when Gemini is unavailable", async () => {
    const result = await buildAnalysis("nalka tapak raha hai", null);
    expect(result.categoryId).toBe("plumber");
    expect(result.source).toBe("jev_only");
  });

  it("respects Gemini's null duration", async () => {
    const result = await buildAnalysis("teen din ka kaam hai", problem({ categoryId: "plumber", durationDays: null }));
    expect(result.durationDays).toBeNull();
  });

  it("keeps Gemini's duration", async () => {
    const result = await buildAnalysis("kaam hai", problem({ categoryId: "plumber", durationDays: 4 }));
    expect(result.durationDays).toBe(4);
  });

  it("reads the duration from words when Gemini is unavailable", async () => {
    const result = await buildAnalysis("teen din ka nalka ka kaam hai", null);
    expect(result.durationDays).toBe(3);
  });
});
