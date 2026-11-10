import { describe, expect, it } from "vitest";
import { Jev, canonicalText, detectUrgency, editDistance, extractDurationDays, urduToRoman } from "./index";
import type { JevCategory } from "./index";

const electrician: JevCategory = {
  id: "electrician",
  nameUr: "الیکٹریشن",
  nameRoman: "bijli wala",
  nameEn: "Electrician",
  keywords: ["bijli", "wiring", "switch", "pankha", "fan", "بجلی", "پنکھا", "وائرنگ", "ups", "short circuit"],
  skills: ["Fan repair", "House wiring", "UPS installation"],
  skillAliases: {
    "Fan repair": ["pankha", "fan", "پنکھا"],
    "House wiring": ["wiring", "وائرنگ"],
  },
};

const plumber: JevCategory = {
  id: "plumber",
  nameUr: "پلمبر",
  nameRoman: "plumber",
  nameEn: "Plumber",
  keywords: ["nalka", "pipe", "leak", "tanki", "نلکا", "پائپ", "geyser", "pani ka masla"],
  skills: ["Tap repair", "Leak fixing", "Geyser fitting"],
  skillAliases: {
    "Tap repair": ["nalka", "tap", "نلکا"],
    "Leak fixing": ["leak", "leakage", "رساؤ"],
  },
};

const ac: JevCategory = {
  id: "ac",
  nameUr: "اے سی ٹیکنیشن",
  nameRoman: "ac wala",
  nameEn: "AC technician",
  keywords: ["ac", "air conditioner", "cooling", "gas refill", "اے سی"],
  skills: ["AC service", "Gas refill"],
};

const mechanic: JevCategory = {
  id: "mechanic",
  nameUr: "مکینک",
  nameRoman: "mechanic",
  nameEn: "Mechanic",
  keywords: ["car", "gari", "bike", "engine", "گاڑی"],
  skills: ["Engine tuning"],
};

const mistri: JevCategory = {
  id: "mistri",
  nameUr: "مستری",
  nameRoman: "mistri",
  nameEn: "Mason",
  keywords: ["deewar", "plaster", "cement", "دیوار"],
  skills: ["Plastering"],
};

const homeMaid: JevCategory = {
  id: "home-maid",
  nameUr: "ماسی",
  nameRoman: "maasi",
  nameEn: "Home maid",
  keywords: ["maasi", "kaam wali", "ghar ki safai", "ماسی", "کام والی", "گھر کی صفائی", "bartan"],
  skills: ["House cleaning", "Dish washing"],
  skillAliases: { "Dish washing": ["bartan", "برتن"] },
};

const base = [electrician, plumber, ac, mechanic, mistri];
const engine = new Jev(base);
const bestId = (jev: Jev, text: string) => jev.match(text).best?.categoryId ?? null;

describe("English", () => {
  it("matches a plain trade name", () => {
    expect(bestId(engine, "I need an electrician")).toBe("electrician");
    expect(bestId(engine, "Need a plumber today")).toBe("plumber");
  });

  it("matches a keyword and the skill behind it", () => {
    const best = engine.match("my fan stopped working").best;
    expect(best?.categoryId).toBe("electrician");
    expect(best?.skills[0]?.skill).toBe("Fan repair");
  });

  it("tolerates typos", () => {
    expect(bestId(engine, "elektrishan chahiye")).toBe("electrician");
    expect(bestId(engine, "need plumbr")).toBe("plumber");
    expect(bestId(engine, "electrcian")).toBe("electrician");
  });

  it("matches a phrase", () => {
    expect(bestId(engine, "there is a short circuit in the kitchen")).toBe("electrician");
  });
});

describe("Roman Urdu", () => {
  it("matches common words", () => {
    expect(bestId(engine, "mera pankha kharab hai")).toBe("electrician");
    expect(bestId(engine, "nalka leak kar raha hai")).toBe("plumber");
    expect(bestId(engine, "gari start nahi ho rahi")).toBe("mechanic");
  });

  it("folds spelling variants", () => {
    for (const text of ["punkha", "pankhaa", "pankha", "pnkha"]) {
      expect(bestId(engine, `${text} theek karna hai`)).toBe("electrician");
    }
    for (const text of ["bijli", "bijlee", "bjli"]) {
      expect(bestId(engine, `${text} nahi aa rahi`)).toBe("electrician");
    }
    for (const text of ["mistri", "mistry", "mstri"]) {
      expect(bestId(engine, `${text} chahiye`)).toBe("mistri");
    }
  });

  it("joins words written apart", () => {
    expect(bestId(engine, "a c thanda nahi kar raha")).toBe("ac");
  });

  it("does not read the verb kar as car", () => {
    expect(engine.match("kar do").best).toBeNull();
  });

  it("lets a gap sit inside a phrase", () => {
    const jev = new Jev([homeMaid]);
    expect(bestId(jev, "ghar ki poori safai karni hai")).toBe("home-maid");
  });
});

describe("Urdu script", () => {
  it("matches exact words", () => {
    expect(bestId(engine, "میرا پنکھا خراب ہے")).toBe("electrician");
    expect(bestId(engine, "نلکا ٹپک رہا ہے")).toBe("plumber");
    expect(bestId(engine, "مجھے الیکٹریشن چاہیے")).toBe("electrician");
  });

  it("returns the skill", () => {
    expect(engine.match("پنکھا ٹھیک کرنا ہے").best?.skills[0]?.skill).toBe("Fan repair");
  });

  it("handles Arabic letter forms and diacritics", () => {
    expect(bestId(engine, "بِجلی")).toBe("electrician");
    expect(bestId(engine, "گاڑي")).toBe("mechanic");
  });

  it("matches Urdu text against Roman-only keywords", () => {
    const jev = new Jev([
      { id: "x", nameUr: "", nameRoman: "darzi", nameEn: "Tailor", keywords: ["silai"], skills: [] },
    ]);
    expect(bestId(jev, "درزی چاہیے")).toBe("x");
  });
});

describe("look-alike words stay apart", () => {
  it("does not read darzi as the Urdu word for door", () => {
    const carpenter: JevCategory = {
      id: "carpenter",
      nameUr: "بڑھئی",
      nameRoman: "tarkhan",
      nameEn: "Carpenter",
      keywords: ["darwaza", "دروازہ"],
      skills: ["Door repair"],
      skillAliases: { "Door repair": ["darwaza", "door", "دروازہ"] },
    };
    expect(new Jev([carpenter]).match("darzi chahiye").best).toBeNull();
    expect(bestId(new Jev([carpenter]), "darwaza theek karna hai")).toBe("carpenter");
    expect(bestId(new Jev([carpenter]), "دروازہ ٹوٹ گیا")).toBe("carpenter");
  });

  it("romanises waw and yeh before alif as consonants", () => {
    expect(urduToRoman("دروازہ")).toBe("drvaza");
    expect(urduToRoman("کیا")).toBe("kya");
  });
});

describe("categories are data", () => {
  it("does not know a category before it is added", () => {
    const jev = new Jev(base);
    expect(jev.match("maasi chahiye ghar ki safai ke liye").best).toBeNull();
  });

  it("learns a new category on reload, in all three scripts", () => {
    const jev = new Jev(base);
    jev.load([...base, homeMaid]);
    expect(bestId(jev, "maasi chahiye")).toBe("home-maid");
    expect(bestId(jev, "kaam wali chahiye")).toBe("home-maid");
    expect(bestId(jev, "kaamwali chahiye")).toBe("home-maid");
    expect(bestId(jev, "ghar ki safai karni hai")).toBe("home-maid");
    expect(bestId(jev, "ماسی چاہیے")).toBe("home-maid");
    expect(bestId(jev, "گھر کی صفائی")).toBe("home-maid");
    expect(bestId(jev, "Need a home maid")).toBe("home-maid");
  });

  it("drops a disabled category", () => {
    const jev = new Jev([...base, homeMaid]);
    jev.load([...base, { ...homeMaid, active: false }]);
    expect(jev.match("maasi chahiye").best).toBeNull();
    expect(jev.hasCategory("home-maid")).toBe(false);
  });

  it("picks up keywords added later", () => {
    const jev = new Jev(base);
    expect(jev.match("inverter lagwana hai").best).toBeNull();
    jev.load(base.map((c) => (c.id === "electrician" ? { ...c, keywords: [...c.keywords, "inverter"] } : c)));
    expect(bestId(jev, "inverter lagwana hai")).toBe("electrician");
  });
});

describe("scoring", () => {
  it("returns no best match for unrelated text", () => {
    expect(engine.match("aaj mausam bohat acha hai").best).toBeNull();
    expect(engine.match("").best).toBeNull();
    expect(engine.match("   ؟؟ ...").matches).toEqual([]);
  });

  it("gives more confidence to more evidence", () => {
    const one = engine.match("wiring").best?.confidence ?? 0;
    const two = engine.match("wiring switch bijli").best?.confidence ?? 0;
    expect(two).toBeGreaterThan(one);
  });

  it("keeps confidence in range", () => {
    const all = engine.match("bijli pankha wiring switch ups electrician").matches;
    for (const m of all) {
      expect(m.confidence).toBeGreaterThan(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("marks shared words as ambiguous", () => {
    const a: JevCategory = { id: "a", nameUr: "", nameRoman: "aaa", nameEn: "Aaa", keywords: ["gasket"], skills: [] };
    const b: JevCategory = { id: "b", nameUr: "", nameRoman: "bbb", nameEn: "Bbb", keywords: ["gasket"], skills: [] };
    const solo = new Jev([a]).match("gasket").best?.confidence ?? 0;
    const shared = new Jev([a, b]).match("gasket").matches[0]?.confidence ?? 0;
    expect(shared).toBeLessThan(solo);
  });

  it("ranks the stronger category first when text mentions two", () => {
    const result = engine.match("pankha aur bijli aur wiring, thora sa pipe bhi");
    expect(result.matches[0]?.categoryId).toBe("electrician");
    expect(result.matches.map((m) => m.categoryId)).toContain("plumber");
  });
});

describe("skills", () => {
  it("lists skills inside one category", () => {
    expect(engine.skillsFor("pankha aur wiring dono", "electrician").sort()).toEqual([
      "Fan repair",
      "House wiring",
    ]);
  });

  it("maps free tags to official names and keeps unknown tags", () => {
    expect(engine.normalizeSkills(["pankha", "Solar panels"], ["electrician"])).toEqual([
      "Fan repair",
      "Solar panels",
    ]);
  });

  it("removes duplicates", () => {
    expect(engine.normalizeSkills(["pankha", "fan", "پنکھا"], ["electrician"])).toEqual(["Fan repair"]);
  });
});

describe("profile parsing", () => {
  const areas = ["Saddar", "Satellite Town", "صدر"];

  it("reads a Roman Urdu introduction", () => {
    const p = engine.parseProfile("Mera naam Imran Khan hai, main electrician hoon, 7 saal ka tajurba, G-9 mein, 1500 rupay", {
      areas,
    });
    expect(p).toEqual({ name: "Imran Khan", years: 7, rate: 1500, area: "G-9" });
  });

  it("reads number words", () => {
    const p = engine.parseProfile("paanch saal ka tajurba, do hazaar paanch sau leta hoon");
    expect(p.years).toBe(5);
    expect(p.rate).toBe(2500);
  });

  it("reads pandra sau", () => {
    expect(engine.parseProfile("rate pandra sau hai").rate).toBe(1500);
  });

  it("reads Urdu script and Urdu digits", () => {
    const p = engine.parseProfile("میرا نام علی رضا ہے، ۱۲ سال کا تجربہ، صدر، ۲۰۰۰ روپے", { areas });
    expect(p.name).toBe("علی رضا");
    expect(p.years).toBe(12);
    expect(p.rate).toBe(2000);
    // Urdu text resolves to the gazetteer's first spelling of the area.
    expect(p.area).toBe("Saddar");
  });

  it("finds a named area with a spelling variation", () => {
    expect(engine.parseProfile("main saddar mein rehta hoon", { areas }).area).toBe("Saddar");
    expect(engine.parseProfile("satelite town", { areas }).area).toBe("Satellite Town");
  });

  it("reads a sector written without a hyphen", () => {
    expect(engine.parseProfile("g 10/2 mein kaam karta hoon").area).toBe("G-10/2");
  });

  it("does not take a trade for a name", () => {
    expect(engine.parseProfile("main electrician hoon").name).toBeNull();
  });

  it("takes an introduced name", () => {
    expect(engine.parseProfile("main Bilal hoon").name).toBe("Bilal");
  });

  it("returns nulls when there is nothing to read", () => {
    expect(engine.parseProfile("salam")).toEqual({ name: null, years: null, rate: null, area: null });
  });
});

describe("urgency", () => {
  it("detects urgent requests", () => {
    expect(detectUrgency("foran chahiye")).toBe("urgent");
    expect(detectUrgency("فوری ضرورت ہے")).toBe("urgent");
  });

  it("detects low urgency before the word jaldi", () => {
    expect(detectUrgency("koi jaldi nahi hai")).toBe("low");
    expect(detectUrgency("کوئی جلدی نہیں")).toBe("low");
  });

  it("defaults to normal", () => {
    expect(detectUrgency("pankha theek karna hai")).toBe("normal");
  });
});

describe("extractDurationDays", () => {
  it.each([
    ["3 din", 3],
    ["teen din", 3],
    ["do din ka kaam", 2],
    ["ek din", 1],
    ["ek hafta", 7],
    ["do haftay ka kaam hai", 14],
    ["paanch din chahiye", 5],
    ["ek mahina", 30],
    ["teen poore din lagenge", 3],
  ])("reads Roman Urdu: %s", (text, days) => {
    expect(extractDurationDays(text)).toBe(days);
  });

  it.each([
    ["دو دن", 2],
    ["تین دن کا کام ہے", 3],
    ["ایک دن", 1],
    ["ایک ہفتہ", 7],
    ["۵ دن", 5],
    ["دو ہفتے", 14],
  ])("reads Urdu script: %s", (text, days) => {
    expect(extractDurationDays(text)).toBe(days);
  });

  it.each([
    ["3 days", 3],
    ["three days of work", 3],
    ["a week", 7],
    ["one day", 1],
    ["2 weeks", 14],
    ["need it for 4days", 4],
  ])("reads English: %s", (text, days) => {
    expect(extractDurationDays(text)).toBe(days);
  });

  it.each([
    ["pankha theek karna hai"],
    ["is hafta aa jayen"],
    ["har din"],
    ["do din baad aana"],
    ["3 din pehle kharab hua"],
    ["دو دن بعد"],
    ["after 2 days"],
    ["in 3days"],
    ["do mahine"],
    ["45 din"],
    ["0 din"],
    ["no days left"],
    [""],
  ])("finds no duration in: %s", (text) => {
    expect(extractDurationDays(text)).toBeNull();
  });

  it("skips a date phrase and finds the real duration", () => {
    expect(extractDurationDays("do din baad shuru, teen din ka kaam")).toBe(3);
  });
});

describe("helpers", () => {
  it("canonicalText merges tag spellings", () => {
    expect(canonicalText("Waqt ka Paband")).toBe(canonicalText("waqt ka paaband"));
    expect(canonicalText("munasib qeemat")).toBe(canonicalText("munaasib keemat"));
  });

  it("urduToRoman produces a usable key", () => {
    expect(urduToRoman("پنکھا")).toBe("pnkha");
    expect(urduToRoman("بجلی")).toBe("bjli");
  });

  it("editDistance counts a transposition as one edit", () => {
    expect(editDistance("pankha", "pnakha")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});
