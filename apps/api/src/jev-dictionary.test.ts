import { Jev } from "@kaamwala/jev";
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../prisma/categories";

/** Runs the dictionary the demo actually ships with, not a small one written for the test. */
const jev = new Jev(
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

const best = (text: string) => jev.match(text).best?.categoryId ?? null;

describe("everyday sentences name no trade", () => {
  it.each([
    "کیا آپ کل آ سکتے ہیں",
    "kya aap kal aa sakte hain",
    "kya koi aa sakta hai",
    "چھوٹا سا کام ہے",
    "aaj chutti hai",
    "میرے گھر کے سامنے",
    "I need someone to fix my sink",
    "wrong number",
    "Imran Khan",
    "کچھ کہنا ہے",
    "my phone is not working",
    "TV band ho gaya",
    "ٹی وی بند ہو گیا",
    "dukan band hai",
    "washing machine band ho gayi",
    "kitna door hai",
    "khana kha liya",
    "gas ka chulha theek karna hai",
    "pardey lagane hain",
  ])("%s", (text) => {
    expect(jev.match(text).best).toBeNull();
  });
});

describe("real requests still reach the right trade", () => {
  it.each([
    ["mera pankha kharab hai", "electrician"],
    ["پنکھا خراب ہے", "electrician"],
    ["bjli nahi aa rahi", "electrician"],
    ["no electricity in my house", "electrician"],
    ["nalka tapak raha hai", "plumber"],
    ["نلکا خراب ہے", "plumber"],
    ["the kitchen sink is leaking", "plumber"],
    ["kitchen ki naali band hai", "plumber"],
    ["AC thanda nahi kar raha", "ac-technician"],
    ["AC ki gas khatam hai", "ac-technician"],
    ["AC ki service karwani hai", "ac-technician"],
    ["naya AC lagwana hai", "ac-technician"],
    ["darwaza theek karna hai", "carpenter"],
    ["door toot gaya hai", "carpenter"],
    ["my door is broken", "carpenter"],
    ["gari start nahi ho rahi", "mechanic"],
    ["deewar ka plaster utar gaya", "mistri"],
    ["saman shift karna hai", "labourer"],
    ["need painting done", "painter"],
    ["ghar ki safai karni hai", "home-maid"],
    ["safai chahiye", "home-maid"],
    ["need a cleaner", "home-maid"],
    ["khana banana hai", "home-maid"],
  ])("%s -> %s", (text, categoryId) => {
    expect(best(text)).toBe(categoryId);
  });

  it("names the maid, not the electrician, from a maid's own introduction", () => {
    const text = "میرا نام شبانہ ہے میں گھروں کا کام کرتی ہوں جھاڑو پونچھا کر سکتی ہوں پانچ سال کا تجربہ ہے";
    expect(jev.match(text).matches.map((m) => m.categoryId)).not.toContain("electrician");
  });

  it("gives AC work the AC skill without the bare word", () => {
    expect(jev.skillsFor("AC ki gas khatam hai", "ac-technician")).toContain("Gas refill");
    expect(jev.skillsFor("AC ki service karwani hai", "ac-technician")).toContain("AC service");
  });
});
