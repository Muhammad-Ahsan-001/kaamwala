import { ArrowLeft, BadgeCheck, CircleCheck, Handshake, HardHat, House, Mic, MapPin, RefreshCw, Star, Activity, AudioLines, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Category, WorkerCard } from "../../data";
import { categoryName } from "../../data/labels";
import type { Query } from "../../ui/async";
import type { Lang } from "../../lib/settings";
import { useSettings } from "../../lib/settings";
import { CategoryIcon } from "../../ui/CategoryIcon";
import { Logo } from "../../ui/Logo";
import { LinkButton, Skeleton, cx } from "../../ui/primitives";
import { MohallaScene } from "./MohallaScene";
import { PhoneDemo } from "./PhoneDemo";
import { useReducedMotion, useReveal, useScrolled } from "./motion";

const LANG_OPTIONS: { value: Lang; label: string; className: string }[] = [
  { value: "ur", label: "اردو", className: "ur" },
  { value: "roman", label: "Roman", className: "latin text-xs" },
  { value: "en", label: "EN", className: "latin text-xs" },
];

export const WRAP = "mx-auto w-full max-w-6xl px-4 lg:px-8";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function LangSwitch() {
  const { lang, setLang, t } = useSettings();
  return (
    <div className="flex shrink-0 rounded-2xl bg-sunken p-0.5" role="group" aria-label={t("زبان", "Zaban", "Language")}>
      {LANG_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={lang === option.value}
          onClick={() => setLang(option.value)}
          className={cx("h-11 min-w-11 rounded-[0.9rem] px-2 text-sm font-bold transition-colors", option.className, lang === option.value ? "bg-surface text-brand-700 shadow-card" : "text-soft hover:text-ink")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A section's small label and big title. */
export function SectionHead({ eyebrow, title, lead, id, light, children }: { eyebrow: string; title: string; lead?: string; id?: string; light?: boolean; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:mb-8">
      <div className="max-w-2xl">
        <p className={cx("lp-in lp-eyebrow flex items-center gap-2", light ? "text-amber-400" : "text-amber-700")}>
          <span className="h-[3px] w-6 rounded-full bg-amber-400" aria-hidden />
          {eyebrow}
        </p>
        <h2 id={id} className="lp-in lp-h2 mt-1" style={delay(80)}>
          {title}
        </h2>
        {lead && (
          <p className={cx("lp-in mt-2 max-w-xl lg:text-base", light ? "text-white/80" : "text-soft")} style={delay(160)}>
            {lead}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function Header() {
  const { t } = useSettings();
  const scrolled = useScrolled();
  const links = [
    { href: "#try", label: t("آزمائیں", "Aazmayein", "Try it") },
    { href: "#how", label: t("طریقہ", "Tareeqa", "How it works") },
    { href: "#who", label: t("کس کے لیے", "Kis ke liye", "Who it's for") },
    { href: "#trust", label: t("بھروسا", "Bharosa", "Trust") },
  ];
  return (
    <header className="lp-header sticky top-0 z-40" data-scrolled={scrolled ? "" : undefined}>
      <div className={cx(WRAP, "flex min-h-16 items-center justify-between gap-3 lg:min-h-[4.5rem]")}>
        <Link to="/" aria-label="KaamWala" className="flex min-h-12 items-center">
          <Logo size={38} />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label={t("صفحے کے حصے", "Safhe ke hisse", "Page sections")}>
          {links.map((link) => (
            <a key={link.href} href={link.href} className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl px-3 font-semibold text-soft transition-colors hover:bg-sunken hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <LinkButton to="/app" size="md" className="hidden lg:inline-flex">
            {t("ایپ کھولیں", "App kholein", "Open the app")}
          </LinkButton>
        </div>
      </div>
    </header>
  );
}

const ROTATE_MS = 2300;

/** The trade in the headline turns over through whatever trades the API lists. */
function TradeRotor({ categories }: { categories: Category[] | null }) {
  const { t, lang } = useSettings();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const names = (categories ?? []).map((category) => categoryName(category, lang)).filter(Boolean);
  const count = names.length;

  useEffect(() => {
    if (reduced || count < 2) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [reduced, count]);

  const word = count ? names[index % count] : t("کاریگر", "kaarigar", "skilled worker");
  return (
    <span className="lp-rotor" aria-hidden>
      <span key={`${lang}-${word}`} className="lp-word">
        <span className="relative z-10">{word}</span>
        <svg className="lp-swoosh" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden focusable="false">
          <path d="M4 14C48 5 120 3 196 9" stroke="#F2A71B" strokeWidth="7" strokeLinecap="round" fill="none" pathLength={1} />
        </svg>
      </span>
    </span>
  );
}

export function Hero({ categories, workers }: { categories: Category[] | null; workers: WorkerCard[] | null }) {
  const { t } = useSettings();
  const facts = [t("مفت سائن اپ", "Muft sign-up", "Free to sign up"), t("آواز یا تحریر", "Awaz ya likhai", "Voice or typing"), t("ہر فون کے براؤزر میں", "Har phone ke browser mein", "Works in any phone browser")];
  const free = workers?.length ?? 0;
  return (
    <section className="lp-hero relative overflow-hidden">
      <div className={cx(WRAP, "relative grid items-center gap-6 pb-6 pt-3 md:grid-cols-[1.15fr_1fr] md:gap-6 lg:gap-10 lg:pb-10 lg:pt-8")}>
        <div className="relative z-10">
          <p className="lp-rise inline-flex min-h-8 flex-wrap items-center gap-x-2 rounded-full border border-amber-100 bg-surface/80 px-3 text-sm font-bold shadow-card backdrop-blur">
            {free > 0 && (
              <>
                <span className="flex items-center gap-1.5 text-brand-700">
                  <span className="lp-live h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  {t(`${free} کاریگر ابھی فارغ`, `${free} kaarigar abhi farigh`, `${free} workers free now`)}
                </span>
                <span className="text-faint" aria-hidden>
                  ·
                </span>
              </>
            )}
            <span className="flex items-center gap-1 text-amber-800">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              {t("اسلام آباد · راولپنڈی", "Islamabad · Rawalpindi", "Islamabad · Rawalpindi")}
            </span>
          </p>

          <h1 className="lp-h1 mt-3 lg:mt-4">
            <span className="sr-only">{t("قریب ترین کاریگر، بس ایک آواز کی دوری پر", "Qareeb tareen kaarigar, bas ek awaz ki doori par", "The nearest skilled worker is one voice note away.")}</span>
            <span aria-hidden className="lp-rise block" style={delay(40)}>
              {t("قریب ترین", "Qareeb tareen", "The nearest")}
            </span>
            <span className="lp-rise block" style={delay(110)}>
              <TradeRotor categories={categories} />
            </span>
            <span aria-hidden className="lp-rise block" style={delay(180)}>
              {t("بس ایک آواز کی دوری پر", "bas ek awaz ki doori par", "is one voice note away.")}
            </span>
          </h1>

          <p className="lp-rise mt-3 max-w-[33rem] text-base text-soft lg:mt-4 lg:text-lg" style={delay(240)}>
            {t(
              "اپنی زبان میں بول کر بتائیں کیا کام ہے۔ ایپ کام پہچان کر قریب کے فارغ کاریگر دکھاتی ہے، اور قیمت بٹن سے طے ہوتی ہے۔",
              "Apni zaban mein bol kar batayein kya kaam hai. App kaam pehchan kar qareeb ke farigh kaarigar dikhati hai, aur qeemat button se tay hoti hai.",
              "Say what needs doing, in your own words. The app works out the trade, shows who is free nearby, and you settle the price with a tap.",
            )}
          </p>

          <div className="lp-rise mt-5 grid gap-2 sm:flex sm:flex-wrap lg:mt-7" style={delay(300)}>
            <LinkButton to="/app/login?role=customer" size="lg" icon={House} className="lp-shine lg:min-h-16 lg:px-7">
              {t("مجھے کام کروانا ہے", "Mujhe kaam karwana hai", "I need work done")}
            </LinkButton>
            <LinkButton to="/app/login?role=worker" size="lg" variant="secondary" icon={HardHat} className="lg:min-h-16 lg:px-7">
              {t("مجھے کام چاہیے", "Mujhe kaam chahiye", "I want work")}
            </LinkButton>
          </div>

          <ul className="lp-rise m-0 mt-4 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm text-soft" style={delay(360)}>
            {facts.map((fact) => (
              <li key={fact} className="flex items-center gap-1.5">
                <CircleCheck className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                {fact}
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-rise relative" style={delay(200)}>
          <div className="pointer-events-none absolute left-1/2 top-[44%] z-0 aspect-square w-[150%] max-w-[44rem] -translate-x-1/2 -translate-y-1/2" aria-hidden>
            <div className="lp-rays absolute inset-0 rounded-full" />
            <div className="lp-sun-disc absolute inset-[30%] rounded-full" />
          </div>
          <PhoneDemo />
        </div>
      </div>
      <Hills />
    </section>
  );
}

/** The Margallas, closing the hero and running into the trades ribbon. */
function Hills() {
  return (
    <svg className="relative -mt-6 block h-[clamp(3rem,7vw,6.5rem)] w-full md:-mt-10" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d="M0 70C120 30 220 40 330 58 470 82 560 20 720 34 880 48 960 86 1110 62 1250 40 1340 50 1440 64V120H0Z" fill="#B2DBC9" />
      <path d="M0 90C160 64 260 80 400 70 560 58 640 96 800 84 960 72 1060 50 1200 72 1310 88 1380 80 1440 78V120H0Z" fill="#1B8F68" />
      <path d="M0 104C200 92 340 108 520 100 700 92 820 112 1000 104 1180 96 1300 108 1440 100V120H0Z" fill="#0F6347" />
    </svg>
  );
}

/** Every trade the API lists, running past like the painted sides of a truck. */
export function TradeRibbon({ query }: { query: Query<Category[]> }) {
  const { t, lang } = useSettings();
  const list = query.data ?? [];
  // Enough tiles that one copy is wider than a wide screen, then a second copy for the loop.
  const once = list.length ? Array.from({ length: Math.max(1, Math.ceil(12 / list.length)) }, () => list).flat() : [];

  return (
    <section aria-labelledby="trades-title" className="lp-ribbon relative bg-brand-700 text-white">
      <h2 id="trades-title" className="sr-only">
        {t("کن کاموں کے لیے؟", "Kin kaamon ke liye?", "What can you book?")}
      </h2>
      {query.data === null && query.error ? (
        <div className={cx(WRAP, "py-3")}>
          <button type="button" onClick={query.reload} className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/10 px-4 font-semibold">
            <RefreshCw className="h-5 w-5 shrink-0" aria-hidden />
            {t("فہرست نہیں مل سکی، دوبارہ کوشش کریں", "List nahi mil saki, dobara koshish karein", "Could not load the list, try again")}
          </button>
        </div>
      ) : query.data === null ? (
        <div className="flex gap-3 overflow-hidden px-4 py-3">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-12 w-40 shrink-0 !bg-white/10" />
          ))}
        </div>
      ) : (
        <div className="lp-ribbon-mask overflow-hidden py-3 lg:py-4">
          <div className="lp-marquee flex w-max" style={{ "--dur": `${Math.max(28, once.length * 4)}s` } as CSSProperties}>
            {[0, 1].map((copy) => (
              <ul key={copy} className="m-0 flex shrink-0 list-none items-center gap-3 p-0 pe-3" aria-hidden={copy === 1 || undefined}>
                {once.map((category, index) => (
                  <li key={`${category.id}-${index}`} className="flex items-center gap-3">
                    <Link
                      to={`/app/adda?cat=${encodeURIComponent(category.id)}`}
                      tabIndex={copy === 1 || index >= list.length ? -1 : undefined}
                      className="flex min-h-12 items-center gap-2.5 whitespace-nowrap rounded-full bg-white/10 py-1 pe-5 ps-1 font-bold ring-1 ring-white/15 transition-colors hover:bg-white/20"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-brand-800">
                        <CategoryIcon name={category.icon} className="h-5 w-5" />
                      </span>
                      {categoryName(category, lang)}
                    </Link>
                    <span className="h-2 w-2 rotate-45 bg-amber-400/70" aria-hidden />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}
      <div className="lp-patti" aria-hidden />
    </section>
  );
}

export function HowItWorks() {
  const { t } = useSettings();
  const reveal = useReveal<HTMLElement>();
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: Mic,
      title: t("بول کر بتائیں", "Bol kar batayein", "Say what you need"),
      body: t("آواز، تصویر یا تحریر سے۔ پڑھنا لکھنا ضروری نہیں، ہر سوال سن بھی سکتے ہیں۔", "Awaz, tasveer ya likh kar. Parhna likhna zaroori nahi, har sawal sun bhi sakte hain.", "By voice, a photo or typing. No reading needed: every question can be heard aloud."),
    },
    {
      icon: MapPin,
      title: t("قریب کا فارغ کاریگر", "Qareeb ka farigh kaarigar", "Pick someone free nearby"),
      body: t("نقشے پر دیکھیں کون ابھی فارغ ہے، یا کام لگا کر آفرز لیں۔", "Naqshay par dekhein kaun abhi farigh hai, ya kaam laga kar offers lein.", "See on the map who is free right now, or post the job and collect offers."),
    },
    {
      icon: Handshake,
      title: t("قیمت طے، کام پکا", "Qeemat tay, kaam pakka", "Agree the price, done"),
      body: t("بٹن سے بھاؤ طے کریں۔ ایک دن یا کئی دن، ایک کاریگر یا پوری ٹیم۔", "Button se bhao tay karein. Ek din ya kai din, ek kaarigar ya poori team.", "Bargain with buttons. Book one day or many, one worker or a whole crew."),
    },
  ];
  return (
    <section id="how" aria-labelledby="how-title" className={cx(WRAP, "scroll-mt-20 py-10 lg:py-20")} {...reveal}>
      <SectionHead id="how-title" eyebrow={t("طریقہ", "Tareeqa", "How it works")} title={t("تین قدم، اور کام شروع", "Teen qadam, aur kaam shuru", "Three steps, and the work begins")} />
      <ol className="relative m-0 grid list-none gap-3 p-0 md:grid-cols-3 md:gap-6">
        <span className="lp-road pointer-events-none absolute inset-x-[16%] top-9 hidden md:block" aria-hidden />
        <span className="lp-road-v pointer-events-none absolute bottom-10 start-7 top-10 md:hidden" aria-hidden />
        {steps.map((step, index) => (
          <li key={step.title} className="lp-in relative flex items-start gap-3 md:flex-col md:items-center md:gap-0 md:text-center" style={delay(120 + index * 140)}>
            <span className="lp-medal relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-400 text-brand-800 md:h-[4.5rem] md:w-[4.5rem]">
              <step.icon className="h-6 w-6 md:h-8 md:w-8" aria-hidden />
              <span className="latin absolute -end-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs font-extrabold text-white ring-2 ring-page">{index + 1}</span>
            </span>
            <span className="lp-card min-w-0 flex-1 rounded-3xl border border-line bg-surface p-4 shadow-card md:mt-5 md:w-full md:p-6">
              <span className="lp-h3 block">{step.title}</span>
              <span className="mt-1 block text-soft">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TrySection({ children }: { children: ReactNode }) {
  const { t } = useSettings();
  const reveal = useReveal<HTMLElement>();
  return (
    <section id="try" aria-labelledby="try-title" className="lp-try scroll-mt-20 py-10 lg:py-20" {...reveal}>
      <div className={WRAP}>
        <SectionHead
          id="try-title"
          eyebrow={t("لائیو · اصل ایپ سے", "Live · asal app se", "Live · from the real app")}
          title={t("آزما کر دیکھیں", "Aazma kar dekhein", "Try it right here")}
          lead={t(
            "مسئلہ ویسے لکھیں جیسے بولتے ہیں۔ یہ وہی پہچان ہے جو ایپ میں چلتی ہے، اور نقشے پر وہ کاریگر ہیں جو اس وقت فارغ ہیں۔",
            "Masla waise likhein jaise bolte hain. Yeh wohi pehchan hai jo app mein chalti hai, aur naqshay par woh kaarigar hain jo is waqt farigh hain.",
            "Write the problem the way you'd say it. This is the same matcher the app uses, and the map shows the workers who are free at this moment.",
          )}
        />
        <div className="lp-in" style={delay(220)}>
          {children}
        </div>
      </div>
    </section>
  );
}

function Audience({ tone, icon: Icon, title, points, to, action, index }: { tone: "green" | "paper"; icon: LucideIcon; title: string; points: string[]; to: string; action: string; index: number }) {
  const green = tone === "green";
  return (
    <div className={cx("lp-in relative flex flex-col overflow-hidden rounded-[2rem] p-5 md:p-7 lg:p-9", green ? "lp-jaali on-color text-white" : "border border-amber-100 bg-amber-50")} style={delay(120 + index * 140)}>
      <Icon className={cx("pointer-events-none absolute -bottom-6 -end-6 h-40 w-40 lg:h-52 lg:w-52", green ? "text-white/[0.07]" : "text-amber-400/[0.14]")} strokeWidth={1.2} aria-hidden />
      <div className="relative flex items-center gap-3">
        <span className={cx("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", green ? "bg-white/15" : "bg-amber-100 text-amber-800")}>
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <h3 className="lp-h2 !text-[clamp(1.25rem,1rem+1vw,1.9rem)]">{title}</h3>
      </div>
      <ul className="relative m-0 mt-4 flex-1 list-none space-y-2 p-0 lg:mt-6 lg:space-y-3">
        {points.map((point) => (
          <li key={point} className={cx("flex items-start gap-2.5 lg:text-base", green ? "text-white/90" : "text-ink/80")}>
            <CircleCheck className={cx("mt-[0.3em] h-[18px] w-[18px] shrink-0", green ? "text-amber-400" : "text-brand-600")} aria-hidden />
            <span className="min-w-0">{point}</span>
          </li>
        ))}
      </ul>
      <Link
        to={to}
        className={cx(
          "lp-tile relative mt-5 inline-flex min-h-14 items-center justify-center gap-2 self-stretch rounded-2xl px-6 text-base font-bold sm:self-start lg:mt-8",
          green ? "bg-white text-brand-700" : "bg-brand-600 text-white",
        )}
      >
        {action}
        <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}

export function Audiences() {
  const { t } = useSettings();
  const reveal = useReveal<HTMLElement>();
  return (
    <section id="who" aria-labelledby="who-title" className={cx(WRAP, "scroll-mt-20 pb-10 lg:pb-20")} {...reveal}>
      <SectionHead id="who-title" eyebrow={t("کس کے لیے", "Kis ke liye", "Who it's for")} title={t("کام کروانے والے بھی، کام کرنے والے بھی", "Kaam karwane wale bhi, kaam karne wale bhi", "For those who need work done, and those who do it")} />
      <div className="grid gap-3 md:grid-cols-2 lg:gap-6">
        <Audience
          index={0}
          tone="paper"
          icon={House}
          title={t("گھروں کے لیے", "Gharon ke liye", "For households")}
          points={[
            t("آواز، تحریر یا تصویر سے کام بتائیں", "Awaz, likh kar ya tasveer se kaam batayein", "Describe the job by voice, text or photo"),
            t("نقشے پر قریب کے فارغ کاریگر دیکھیں", "Naqshay par qareeb ke farigh kaarigar dekhein", "See who is free nearby on a map"),
            t("ہر کاریگر کے کام کی گنتی اور ریویو", "Har kaarigar ke kaam ki ginti aur review", "Every worker's job count and reviews"),
            t("ایک دن یا کئی دن، ایک کاریگر یا پوری ٹیم", "Ek din ya kai din, ek kaarigar ya poori team", "One day or many, one worker or a crew"),
          ]}
          to="/app/login?role=customer"
          action={t("کاریگر ڈھونڈیں", "Kaarigar dhoondein", "Find a worker")}
        />
        <Audience
          index={1}
          tone="green"
          icon={HardHat}
          title={t("کاریگروں کے لیے", "Kaarigaron ke liye", "For workers")}
          points={[
            t("بول کر یا لکھ کر مفت پروفائل", "Bol kar ya likh kar muft profile", "A free profile, by voice or typing"),
            t("اپنی قیمت، اپنا وقت، اپنی پسند کے کام", "Apni qeemat, apna waqt, apni pasand ke kaam", "Your price, your hours, the jobs you choose"),
            t("کام کی اطلاع سیدھی فون پر", "Kaam ki ittila seedhi phone par", "Job alerts straight to your phone"),
            t("اسمارٹ فون نہیں؟ فیلڈ ایجنٹ پروفائل بنا دے گا", "Smartphone nahi? Field agent profile bana dega", "No smartphone? A field agent signs you up"),
          ]}
          to="/app/login?role=worker"
          action={t("مفت پروفائل بنائیں", "Muft profile banayein", "Create a free profile")}
        />
      </div>
    </section>
  );
}

export function Trust() {
  const { t } = useSettings();
  const reveal = useReveal<HTMLElement>();
  const items: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: BadgeCheck,
      title: t("کام سے پہلے قیمت طے", "Pehle qeemat tay", "Price agreed first"),
      body: t("دونوں طرف سے تصدیق کے بعد ہی بکنگ", "Dono taraf ki tasdeeq ke baad hi booking", "Nothing is booked until both sides confirm"),
    },
    {
      icon: Star,
      title: t("دونوں طرف سے ریویو", "Dono taraf se review", "Two-way reviews"),
      body: t("کاریگر بھی گاہک کو ریٹ کرتا ہے", "Kaarigar bhi gahak ko rate karta hai", "Workers rate customers too"),
    },
    {
      icon: Activity,
      title: t("فارغ یا مصروف، فوراً پتا", "Farigh ya masroof, foran pata", "Live availability"),
      body: t("مصروف کاریگر نقشے سے خود ہٹ جاتا ہے", "Masroof kaarigar naqshay se khud hat jata hai", "Busy workers drop off the map by themselves"),
    },
    {
      icon: Users,
      title: t("پوری ٹیم بھی", "Poori team bhi", "Whole crews"),
      body: t("بڑے کام کے لیے کاریگروں کی ٹیم ایک ساتھ", "Bare kaam ke liye kaarigaron ki team ek saath", "Book a team of trades together for bigger jobs"),
    },
    {
      icon: AudioLines,
      title: t("آواز سے بھی، تحریر سے بھی", "Awaz se bhi, likhai se bhi", "Voice or typing"),
      body: t("اردو، رومن یا انگریزی میں", "Urdu, Roman ya English mein", "In Urdu, Roman Urdu or English"),
    },
  ];
  return (
    <section id="trust" aria-labelledby="trust-title" className="scroll-mt-20 bg-surface" {...reveal}>
      <div className="lp-patti" aria-hidden />
      <div className={cx(WRAP, "py-10 lg:py-20")}>
        <SectionHead id="trust-title" eyebrow={t("بھروسا", "Bharosa", "Trust")} title={t("بھروسا کیسے بنتا ہے", "Bharosa kaise banta hai", "How trust is built in")} />
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:grid-cols-5 lg:gap-4">
          {items.map((item, index) => (
            <li key={item.title} className={cx("lp-in lp-card rounded-3xl border border-line bg-page p-4 lg:p-5", index === items.length - 1 && "col-span-2 md:col-span-1")} style={delay(100 + index * 90)}>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card">
                <item.icon className="h-6 w-6" aria-hidden />
              </span>
              <span className="mt-3 block font-extrabold lg:text-base">{item.title}</span>
              <span className="mt-0.5 block text-sm text-soft">{item.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCta() {
  const { t } = useSettings();
  const reveal = useReveal<HTMLElement>();
  return (
    <section className={cx(WRAP, "py-10 lg:py-20")} {...reveal}>
      <div className="lp-in lp-jaali on-color relative grid items-end overflow-hidden rounded-[2rem] text-white md:grid-cols-[1.35fr_1fr]">
        <div className="lp-patti absolute inset-x-0 top-0" aria-hidden />
        <div className="relative z-10 p-6 pt-9 md:p-10 lg:p-14">
          <p className="lp-eyebrow flex items-center gap-2 text-amber-400">
            <span className="h-[3px] w-6 rounded-full bg-amber-400" aria-hidden />
            {t("مفت · کسی ایپ اسٹور کے بغیر", "Muft · kisi app store ke baghair", "Free · no app store needed")}
          </p>
          <h2 className="lp-h2 mt-2 !text-[clamp(1.75rem,1.1rem+2.6vw,3.25rem)]">{t("کام کی بات، سیدھی بات", "Kaam ki baat, seedhi baat", "Real work. Straight talk.")}</h2>
          <p className="mt-2 max-w-md text-white/85 lg:text-base">
            {t(
              "سائن اپ مفت ہے۔ ایپ ہر فون کے براؤزر میں چلتی ہے اور ہوم اسکرین پر بھی لگ جاتی ہے۔",
              "Sign-up muft hai. App har phone ke browser mein chalti hai aur home screen par bhi lag jaati hai.",
              "Signing up is free. The app runs in any phone's browser, and installs to the home screen too.",
            )}
          </p>
          <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap">
            <Link to="/app/login?role=customer" className="lp-tile inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-base font-bold text-brand-700">
              <House className="h-6 w-6 shrink-0" aria-hidden />
              {t("مجھے کام کروانا ہے", "Mujhe kaam karwana hai", "I need work done")}
            </Link>
            <Link to="/app/login?role=worker" className="lp-tile inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-6 text-base font-bold text-white ring-1 ring-white/40 hover:bg-white/15">
              <HardHat className="h-6 w-6 shrink-0" aria-hidden />
              {t("مجھے کام چاہیے", "Mujhe kaam chahiye", "I want work")}
            </Link>
          </div>
        </div>
        <div className="relative hidden self-end md:block" aria-hidden>
          <MohallaScene className="mx-auto -mb-3 w-[78%] max-w-[22rem]" />
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const { t } = useSettings();
  const links = [
    { to: "/app", label: t("ایپ کھولیں", "App kholein", "Open the app") },
    { to: "/app/login?role=agent", label: t("فیلڈ ایجنٹ", "Field agent", "Field agents") },
  ];
  return (
    <footer className="bg-page">
      <div className="lp-patti" aria-hidden />
      <div className={cx(WRAP, "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-4 lg:py-6")}>
        <Logo size={30} stacked={false} />
        <p className="text-sm text-soft sm:order-last">{t("اسلام آباد · راولپنڈی", "Islamabad · Rawalpindi", "Islamabad · Rawalpindi")}</p>
        <nav className="-ms-2 flex w-full items-center gap-1 sm:ms-0 sm:w-auto" aria-label={t("مزید", "Mazeed", "More")}>
          {links.map((link) => (
            <Link key={link.to} to={link.to} className="flex min-h-12 items-center rounded-2xl px-2 text-sm font-semibold text-soft hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
