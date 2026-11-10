import { CalendarDays, Camera, Check, ChevronDown, Clock, Info, Lightbulb, LoaderCircle, MapPin, Plus, Undo2, Volume2, VolumeX, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Category } from "../data";
import { isLatin, phrase } from "../data/labels";
import { isSpeaking, speakNow } from "../lib/audio";
import { stopVoice } from "../lib/question-voices";
import { useSettings, type Lang } from "../lib/settings";
import { addWords, dropWords, isListed } from "./hire";
import { Auto, Chip, Tag, cx } from "./primitives";

type Words = { ur: string; roman: string; en: string };

const LINES: (Words & { icon: LucideIcon })[] = [
  { icon: Wrench, ur: "کیا خراب ہے یا کیا کام کروانا ہے", roman: "Kya kharab hai ya kya kaam karwana hai", en: "What is wrong, or what work you need" },
  { icon: MapPin, ur: "کہاں ہے: علاقہ اور گھر یا دکان", roman: "Kahan hai: ilaqa aur ghar ya dukaan", en: "Where: the area, and home or shop" },
  { icon: Clock, ur: "کب چاہیے: آج، کل یا کوئی اور دن", roman: "Kab chahiye: aaj, kal ya koi aur din", en: "When you need it: today, tomorrow or another day" },
  { icon: CalendarDays, ur: "کتنے دن کا کام ہے", roman: "Kitne din ka kaam hai", en: "How many days of work" },
  { icon: Camera, ur: "تصویر ہو تو کام جلدی سمجھ آتا ہے", roman: "Tasveer ho to kaam jaldi samajh aata hai", en: "A photo helps the worker understand quickly" },
];

/** Sentences to learn from and edit. Nothing may read these to decide a trade, a price or a list of trades. */
const JOB_SAMPLES: Words[] = [
  {
    ur: "گھر کے دو پنکھے نہیں چل رہے اور ایک سوئچ بورڈ سے چنگاری نکلتی ہے۔ گھر جی ٹین میں ہے۔ آج شام تک کوئی آ جائے۔ ایک دن کا کام ہے۔",
    roman: "Ghar ke do pankhay nahi chal rahe aur ek switch board se chingari nikalti hai. Ghar G-10 mein hai. Aaj shaam tak koi aa jaye. Ek din ka kaam hai.",
    en: "Two ceiling fans at home have stopped and one switch board is sparking. The house is in G-10. Someone should come by this evening. It is one day of work.",
  },
  {
    ur: "باورچی خانے کا نلکا ٹپک رہا ہے اور سنک کے نیچے پائپ سے پانی نکل رہا ہے۔ گھر صدر راولپنڈی میں ہے۔ کل صبح آ جائیں۔ ایک دن کا کام ہے۔",
    roman: "Kitchen ka nalka tapak raha hai aur sink ke neeche pipe se pani nikal raha hai. Ghar Saddar Rawalpindi mein hai. Kal subah aa jayein. Ek din ka kaam hai.",
    en: "The kitchen tap is dripping and the pipe under the sink is leaking. The house is in Saddar, Rawalpindi. Please come tomorrow morning. It is one day of work.",
  },
  {
    ur: "تین کمروں میں رنگ کروانا ہے، پرانا رنگ اتر رہا ہے۔ فلیٹ بحریہ ٹاؤن میں ہے۔ اگلے پیر سے شروع کریں۔ تقریباً تین دن کا کام ہے۔",
    roman: "Teen kamron mein rang karwana hai, purana rang utar raha hai. Flat Bahria Town mein hai. Aglay peer se shuru karein. Taqreeban teen din ka kaam hai.",
    en: "Three rooms need painting and the old paint is peeling. The flat is in Bahria Town. Please start next Monday. It is about three days of work.",
  },
];

const CREW_SAMPLES: Words[] = [
  {
    ur: "گھر کی چھت پر پلستر کرنا ہے اور دو کمروں میں ٹائل لگانی ہے۔ گھر چکلالہ اسکیم تین میں ہے۔ اگلے پیر سے شروع کریں۔ تقریباً پانچ دن کا کام ہے۔",
    roman: "Ghar ki chhat par plaster karna hai aur do kamron mein tile lagani hai. Ghar Chaklala Scheme 3 mein hai. Aglay peer se shuru karein. Taqreeban paanch din ka kaam hai.",
    en: "The roof needs plastering and two rooms need tiles. The house is in Chaklala Scheme 3. Please start next Monday. It is about five days of work.",
  },
  {
    ur: "پورے گھر میں رنگ کروانا ہے، پانچ کمرے اور برآمدہ ہیں۔ گھر جی نائن میں ہے۔ اس جمعے سے کام شروع ہو جائے۔ چار دن لگیں گے۔",
    roman: "Poore ghar mein rang karwana hai, paanch kamray aur baramda hain. Ghar G-9 mein hai. Is jummay se kaam shuru ho jaye. Chaar din lagenge.",
    en: "The whole house needs painting, five rooms and a veranda. The house is in G-9. The work should start this Friday. It will take four days.",
  },
];

const OPEN_KEY = "kw.jobGuide";

function startsOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function keepOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Private windows can refuse storage; the guide then just opens again next visit.
  }
}

/** The first job has been described, so from now on the guide starts folded unless the customer chose to keep it open. */
export function jobGuideUsed() {
  try {
    if (window.localStorage.getItem(OPEN_KEY) === null) window.localStorage.setItem(OPEN_KEY, "0");
  } catch {
    // See keepOpen.
  }
}

function hush() {
  stopVoice();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Plays even with sound effects turned off: someone who cannot read asked for it. A second tap stops it. */
function GuideVoice({ text, silenced }: { text: string; silenced: boolean }) {
  const { t } = useSettings();
  const [phase, setPhase] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => hush, []);
  // The microphone must not record the guide being read out.
  useEffect(() => {
    if (silenced) hush();
  }, [silenced]);
  useEffect(() => {
    if (phase !== "failed") return;
    const timer = setTimeout(() => setPhase("idle"), 3000);
    return () => clearTimeout(timer);
  }, [phase]);

  const toggle = async () => {
    if (phase === "loading" || silenced) return;
    if (isSpeaking()) {
      hush();
      return;
    }
    setPhase("loading");
    setPhase((await speakNow(text)) ? "idle" : "failed");
  };

  const Icon = phase === "loading" ? LoaderCircle : phase === "failed" ? VolumeX : Volume2;
  const label = phase === "failed" ? t("آواز نہیں چل سکی", "Awaz nahi chal saki", "Could not play the sound") : t("اردو میں سنیں", "Urdu mein sunein", "Hear this in Urdu");
  return (
    <button type="button" onClick={() => void toggle()} aria-label={label} title={label} data-guide-voice={phase} className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 transition active:scale-95", phase === "failed" ? "text-busy-700" : "text-brand-700")}>
      <Icon className={cx("h-6 w-6", phase === "loading" && "animate-spin")} aria-hidden />
    </button>
  );
}

/** How to describe a job, with examples to start from. Sits under the main action so it never pushes it off a small screen. */
export function JobGuide({ kind = "job", lead, silenced = false, onSample }: { kind?: "job" | "crew"; lead?: string; silenced?: boolean; onSample: (words: string) => void }) {
  const { t } = useSettings();
  const [open, setOpen] = useState(startsOpen);
  const bodyId = useId();
  const samples = kind === "crew" ? CREW_SAMPLES : JOB_SAMPLES;
  const spoken = `اچھا کام کیسے بتائیں؟ ${LINES.map((line) => line.ur).join("۔ ")}۔ مثال کے طور پر: ${samples[0]?.ur ?? ""}`;

  const toggle = () => {
    setOpen(!open);
    keepOpen(!open);
  };

  return (
    <section className="rounded-3xl border border-line bg-surface" data-job-guide>
      <div className="flex items-center gap-1 p-1">
        <button type="button" aria-expanded={open} aria-controls={open ? bodyId : undefined} onClick={toggle} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 text-start font-bold">
          <Lightbulb className="h-6 w-6 shrink-0 text-amber-500" aria-hidden />
          <span className="min-w-0 flex-1">{t("اچھا کام کیسے لکھیں؟", "Acha kaam kaise likhein?", "How to describe your job")}</span>
          <ChevronDown className={cx("h-5 w-5 shrink-0 text-soft transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <GuideVoice text={spoken} silenced={silenced} />
      </div>
      {open && (
        <div id={bodyId} className="animate-rise px-3 pb-3">
          {lead && <p className="text-sm font-semibold text-soft">{lead}</p>}
          <ul className="m-0 list-none p-0">
            {LINES.map(({ icon: Icon, ur, roman, en }) => (
              <li key={en} className="flex items-center gap-2 text-sm">
                <Icon className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                <span className="min-w-0 flex-1">{t(ur, roman, en)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-bold">
            {t("مثالیں", "Misalein", "Examples")} <span className="font-normal text-soft">· {t("دبائیں، خانے میں آ جائے گی، پھر اپنا کام لکھیں", "Dabayein, khane mein aa jayegi, phir apna kaam likhein", "Tap one to fill the box, then change it to your job")}</span>
          </p>
          <div className="scroll-x -mx-3 mt-1 flex gap-2 overflow-x-auto px-3">
            {samples.map((sample) => (
              <button key={sample.en} type="button" data-job-sample onClick={() => onSample(t(sample.ur, sample.roman, sample.en))} className="w-[80%] max-w-xs shrink-0 rounded-2xl bg-sunken p-3 text-start text-sm transition active:scale-[0.98]">
                <Tag tone="plain">{t("صرف مثال", "Sirf misal", "Example only")}</Tag>
                <span className="mt-1 block">{t(sample.ur, sample.roman, sample.en)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** The box a sample goes into. It remembers what the customer had written, so a tap never costs them their own words. */
export function useSampleBox(value: string, setValue: (next: string) => void) {
  const [filled, setFilled] = useState<{ words: string; before: string } | null>(null);
  const unedited = filled !== null && filled.words === value;
  const before = unedited ? filled.before : "";
  return {
    unedited,
    before,
    fill: (words: string) => {
      setFilled({ words, before: unedited ? before : value });
      setValue(words);
    },
    restore: () => {
      setValue(before);
      setFilled(null);
    },
  };
}

/** Under the box while it still holds an example nobody has changed. */
export function SampleNotice({ box }: { box: ReturnType<typeof useSampleBox> }) {
  const { t } = useSettings();
  if (!box.unedited) return null;
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-brand-50 px-3 text-sm font-semibold text-brand-800" data-sample-notice>
      <Info className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 py-1">{t("یہ صرف مثال ہے۔ اپنے کام کے مطابق بدل لیں۔", "Ye sirf misal hai. Apne kaam ke mutabiq badal lein.", "This is only an example. Change it to match your job.")}</span>
      {box.before.trim() && (
        <button type="button" onClick={box.restore} className="flex min-h-12 shrink-0 items-center gap-1 font-bold text-brand-700">
          <Undo2 className="h-5 w-5" aria-hidden />
          {t("میرا لکھا", "Mera likha", "My text")}
        </button>
      )}
    </div>
  );
}

/** A skill in the customer's language, from the words the admin entered for it. Falls back to the skill's own name. */
function skillWords(category: Category, skill: string, lang: Lang): string {
  const known = phrase(skill, lang);
  if (known !== skill || lang === "en") return known;
  const alias = category.skillAliases?.[skill]?.find((word) => (lang === "ur" ? !isLatin(word) : isLatin(word)));
  return alias ?? skill;
}

/** The category's own skills, as the admin set them, to add with a tap. `said` is anything the customer has already said outside `text`. */
export function SkillChips({ category, text, said = "", onChange }: { category: Category; text: string; said?: string; onChange: (next: string) => void }) {
  const { t, lang } = useSettings();
  const mentioned = `${said} ${text}`.toLowerCase();
  const chips = category.skills.map((skill) => {
    const words = skillWords(category, skill, lang);
    return { skill, words, added: isListed(text, words) };
  });
  // A word the customer already used in their own sentence would only be repeated.
  const offered = chips.filter(({ words, added }) => added || !mentioned.includes(words.toLowerCase()));
  if (offered.length === 0) return null;
  return (
    <div data-skill-chips>
      <p className="mb-1 text-sm font-bold text-soft">{t("کام کی تفصیل میں شامل کریں", "Kaam ki tafseel mein shamil karein", "Add to the job details")}</p>
      <div className="scroll-x -mx-4 flex gap-2 overflow-x-auto px-4">
        {offered.map(({ skill, words, added }) => (
          <Chip key={skill} active={added} icon={added ? Check : Plus} onClick={() => onChange(added ? dropWords(text, words) : addWords(text, words))}>
            <Auto text={words} />
          </Chip>
        ))}
      </div>
    </div>
  );
}
