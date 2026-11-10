import { ArrowLeft, BadgeCheck, CircleCheck, Handshake, HardHat, House, Mic, MapPin, RefreshCw, Star, Activity, AudioLines, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Category } from "../../data";
import { categoryName } from "../../data/labels";
import type { Query } from "../../ui/async";
import type { Lang } from "../../lib/settings";
import { useSettings } from "../../lib/settings";
import { CategoryIcon } from "../../ui/CategoryIcon";
import { Logo } from "../../ui/Logo";
import { LinkButton, Skeleton, cx } from "../../ui/primitives";
import { HeroArt } from "./HeroArt";

const LANG_OPTIONS: { value: Lang; label: string; className: string }[] = [
  { value: "ur", label: "اردو", className: "ur" },
  { value: "roman", label: "Roman", className: "latin text-xs" },
  { value: "en", label: "EN", className: "latin text-xs" },
];

const WRAP = "mx-auto w-full max-w-6xl px-4 lg:px-8";

function LangSwitch() {
  const { lang, setLang } = useSettings();
  return (
    <div className="flex shrink-0 rounded-2xl bg-sunken" role="group" aria-label="Language">
      {LANG_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={lang === option.value}
          onClick={() => setLang(option.value)}
          className={cx("h-12 min-w-12 rounded-2xl px-2 text-sm font-bold transition-colors", option.className, lang === option.value ? "bg-surface text-brand-700 shadow-card" : "text-soft")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="lp-h2 mb-3 flex items-center gap-2 lg:mb-5">
      <span className="h-5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
      {children}
    </h2>
  );
}

export function Header() {
  const { t } = useSettings();
  const links = [
    { href: "#how", label: t("طریقہ", "Tareeqa", "How it works") },
    { href: "#trades", label: t("ہنر", "Hunar", "Trades") },
    { href: "#who", label: t("کس کے لیے", "Kis ke liye", "Who it's for") },
    { href: "#trust", label: t("بھروسا", "Bharosa", "Trust") },
  ];
  return (
    <header className={cx(WRAP, "flex min-h-16 items-center justify-between gap-3 lg:min-h-20")}>
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
    </header>
  );
}

export function Hero({ categories }: { categories: Category[] | null }) {
  const { t } = useSettings();
  const facts = [t("مفت سائن اپ", "Muft sign-up", "Free to sign up"), t("آواز یا تحریر", "Awaz ya likhai", "Voice or typing"), t("براؤزر میں چلتی ہے", "Browser mein chalti hai", "Runs in your browser")];
  return (
    <section className={cx(WRAP, "grid items-center gap-5 pb-7 pt-2 md:grid-cols-2 md:gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-14 lg:pt-6")}>
      <div>
        <p className="lp-rise inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 text-sm font-bold text-amber-800">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
          {t("اسلام آباد · راولپنڈی", "Islamabad · Rawalpindi", "Islamabad · Rawalpindi")}
        </p>
        <h1 className="lp-h1 lp-rise mt-2" style={{ "--d": "60ms" } as CSSProperties}>
          {t("محلے کا ", "Mohallay ka ", "Your neighbourhood ")}
          <span className="lp-mark">{t("اڈا", "adda", "adda")}</span>
          {t("، اب آپ کے فون پر", ", ab aap ke phone par", ", now on your phone")}
        </h1>
        <p className="lp-rise mt-1 max-w-[34rem] text-soft lg:text-base" style={{ "--d": "120ms" } as CSSProperties}>
          {t("قریب کے فارغ کاریگر، ایک جگہ۔ بس بول کر بتائیں کیا کام ہے۔", "Qareeb ke farigh kaarigar, ek jagah. Bas bol kar batayein kya kaam hai.", "Skilled workers who are free near you, in one place. Just say what you need done.")}
        </p>
        <div className="lp-rise mt-4 grid gap-2 sm:flex sm:flex-wrap" style={{ "--d": "180ms" } as CSSProperties}>
          <LinkButton to="/app/login?role=customer" size="md" icon={House} className="lg:min-h-14 lg:px-6">
            {t("مجھے کام کروانا ہے", "Mujhe kaam karwana hai", "I need work done")}
          </LinkButton>
          <LinkButton to="/app/login?role=worker" size="md" variant="secondary" icon={HardHat} className="lg:min-h-14 lg:px-6">
            {t("مجھے کام چاہیے", "Mujhe kaam chahiye", "I want work")}
          </LinkButton>
        </div>
        <ul className="lp-rise m-0 mt-3 flex list-none flex-wrap gap-x-4 p-0 text-sm text-soft" style={{ "--d": "240ms" } as CSSProperties}>
          {facts.map((fact, index) => (
            <li key={fact} className={cx("items-center gap-1.5", index === 2 ? "hidden sm:flex" : "flex")}>
              <CircleCheck className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              {fact}
            </li>
          ))}
        </ul>
      </div>
      <HeroArt categories={categories} />
    </section>
  );
}

export function HowItWorks() {
  const { t } = useSettings();
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: Mic,
      title: t("بول کر بتائیں", "Bol kar batayein", "Say what you need"),
      body: t("آواز، تصویر یا تحریر سے کام بتائیں", "Awaz, tasveer ya likh kar kaam batayein", "By voice, a photo or typing"),
    },
    {
      icon: MapPin,
      title: t("کاریگر چنیں", "Kaarigar chunein", "Choose who comes"),
      body: t("قریب کا فارغ کاریگر چنیں، یا کام لگا کر آفرز لیں", "Qareeb ka farigh kaarigar chunein, ya kaam laga kar offers lein", "Pick someone free nearby, or post the job and get offers"),
    },
    {
      icon: Handshake,
      title: t("قیمت طے کریں", "Qeemat tay karein", "Agree the price"),
      body: t("بٹن سے بھاؤ طے، ایک ٹچ سے بکنگ پکی", "Button se bhao tay, ek tap mein booking pakki", "Bargain with buttons, confirm in one tap"),
    },
  ];
  return (
    <section id="how" aria-labelledby="how-title" className={cx(WRAP, "scroll-mt-4 pb-7 lg:pb-14")}>
      <SectionTitle id="how-title">{t("تین قدموں میں کام", "Teen qadmon mein kaam", "Three steps to getting it done")}</SectionTitle>
      <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-3 md:gap-4">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex items-center gap-3 overflow-hidden rounded-3xl border border-line bg-surface p-3 md:block md:p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
              <step.icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 md:mt-3 md:block">
              <span className="block font-bold">{step.title}</span>
              <span className="block text-soft">{step.body}</span>
            </span>
            <span className="latin pointer-events-none absolute end-3 top-1 hidden text-5xl font-extrabold text-sunken md:block" aria-hidden>
              {index + 1}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Trades({ query }: { query: Query<Category[]> }) {
  const { t, lang } = useSettings();
  return (
    <section id="trades" aria-labelledby="trades-title" className={cx(WRAP, "scroll-mt-4 pb-7 lg:pb-14")}>
      <SectionTitle id="trades-title">{t("کن کاموں کے لیے؟", "Kin kaamon ke liye?", "What can you book?")}</SectionTitle>
      {query.data === null && query.error ? (
        <button type="button" onClick={query.reload} className="flex min-h-12 items-center gap-2 rounded-2xl bg-sunken px-4 font-semibold text-soft">
          <RefreshCw className="h-5 w-5 shrink-0" aria-hidden />
          {t("فہرست نہیں مل سکی، دوبارہ کوشش کریں", "List nahi mil saki, dobara koshish karein", "Could not load the list, try again")}
        </button>
      ) : query.data === null ? (
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-[88px] w-[88px] shrink-0" />
          ))}
        </div>
      ) : (
        <div className="scroll-x -mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 lg:gap-3">
          {query.data.map((category) => (
            <Link
              key={category.id}
              to={`/app/adda?cat=${category.id}`}
              className="lp-tile flex h-[88px] w-[88px] shrink-0 snap-start flex-col items-center justify-center rounded-3xl border border-line bg-surface p-1 text-center md:h-14 md:w-auto md:flex-row md:gap-2 md:rounded-2xl md:px-4 lg:px-5"
            >
              <CategoryIcon name={category.icon} className="h-6 w-6 shrink-0 text-brand-600" />
              <span className="line-clamp-2 text-sm font-semibold" style={{ lineHeight: lang === "ur" ? 1.7 : 1.25 }}>
                {categoryName(category, lang)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function Audience({ tone, id, icon: Icon, title, points, to, action }: { tone: "green" | "paper"; id?: string; icon: LucideIcon; title: string; points: string[]; to: string; action: string }) {
  const green = tone === "green";
  return (
    <div id={id} className={cx("flex flex-col rounded-4xl p-4 md:p-5 lg:p-8", green ? "lp-jaali on-color text-white" : "border border-amber-100 bg-amber-50")}>
      <div className="flex items-center gap-3">
        <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", green ? "bg-white/15" : "bg-amber-100 text-amber-800")}>
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <h3 className="lp-h2">{title}</h3>
      </div>
      <ul className="m-0 mt-2 flex-1 list-none space-y-0.5 p-0 lg:mt-4 lg:space-y-1.5">
        {points.map((point) => (
          <li key={point} className={cx("flex items-start gap-2", green ? "text-white/90" : "text-soft")}>
            <CircleCheck className={cx("mt-1 h-4 w-4 shrink-0", green ? "text-amber-400" : "text-brand-600")} aria-hidden />
            <span className="min-w-0">{point}</span>
          </li>
        ))}
      </ul>
      <Link
        to={to}
        className={cx(
          "lp-tile mt-3 inline-flex min-h-12 items-center justify-center gap-2 self-stretch rounded-2xl px-5 font-bold sm:self-start lg:mt-5",
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
  return (
    <section id="who" className={cx(WRAP, "grid scroll-mt-4 gap-3 pb-7 md:grid-cols-2 lg:gap-5 lg:pb-14")}>
      <Audience
        tone="paper"
        icon={House}
        title={t("گھروں کے لیے", "Gharon ke liye", "For households")}
        points={[
          t("آواز، تحریر یا تصویر سے کام بتائیں", "Awaz, likh kar ya tasveer se kaam batayein", "Describe the job by voice, text or photo"),
          t("نقشے پر قریب کے فارغ کاریگر دیکھیں", "Naqshay par qareeb ke farigh kaarigar dekhein", "See who is free nearby on a map"),
          t("ایک دن یا کئی دن، ایک کاریگر یا پوری ٹیم", "Ek din ya kai din, ek kaarigar ya poori team", "One day or many, one worker or a crew"),
        ]}
        to="/app/login?role=customer"
        action={t("کاریگر ڈھونڈیں", "Kaarigar dhoondein", "Find a worker")}
      />
      <Audience
        tone="green"
        icon={HardHat}
        title={t("کاریگروں کے لیے", "Kaarigaron ke liye", "For workers")}
        points={[
          t("بول کر یا لکھ کر مفت پروفائل", "Bol kar ya likh kar muft profile", "A free profile, by voice or typing"),
          t("اپنی قیمت، اپنا وقت", "Apni qeemat, apna waqt", "Your price, your hours"),
          t("کام کی اطلاع سیدھی فون پر", "Kaam ki ittila seedhi phone par", "Job alerts straight to your phone"),
        ]}
        to="/app/login?role=worker"
        action={t("مفت پروفائل بنائیں", "Muft profile banayein", "Create a free profile")}
      />
    </section>
  );
}

export function Trust() {
  const { t } = useSettings();
  const items: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: BadgeCheck,
      title: t("کام سے پہلے قیمت طے", "Pehle qeemat tay", "Price agreed first"),
      body: t("دونوں طرف سے تصدیق", "Dono taraf se tasdeeq", "Both sides confirm it"),
    },
    {
      icon: Star,
      title: t("ہر کام کے بعد ریویو", "Har kaam ka review", "Two-way reviews"),
      body: t("دونوں طرف سے رائے", "Dono taraf se raaye", "Each side rates the other"),
    },
    {
      icon: Activity,
      title: t("فارغ یا مصروف، فوراً پتا", "Farigh ya masroof", "Live availability"),
      body: t("مصروف کاریگر نقشے سے غائب", "Masroof kaarigar naqshay se ghaib", "Busy workers leave the map"),
    },
    {
      icon: AudioLines,
      title: t("آواز سے بھی، تحریر سے بھی", "Awaz ya likhai", "Voice or typing"),
      body: t("پڑھنا لکھنا ضروری نہیں", "Parhna likhna zaroori nahi", "No reading needed"),
    },
  ];
  return (
    <section id="trust" aria-labelledby="trust-title" className="scroll-mt-4 bg-surface">
      <div className="lp-patti" aria-hidden />
      <div className={cx(WRAP, "py-6 lg:py-12")}>
        <SectionTitle id="trust-title">{t("بھروسا کیسے بنتا ہے", "Bharosa kaise banta hai", "How trust is built")}</SectionTitle>
        <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-3 p-0 md:grid-cols-4 lg:gap-6">
          {items.map((item) => (
            <li key={item.title}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <item.icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="mt-1 block font-bold">{item.title}</span>
              <span className="block text-sm text-soft">{item.body}</span>
            </li>
          ))}
        </ul>
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
      <div className={cx(WRAP, "flex flex-wrap items-center justify-between gap-x-4 py-3 lg:py-5")}>
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
