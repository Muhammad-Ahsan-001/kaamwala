import { ArrowLeft, Handshake, HardHat, House, MapPin, Mic } from "lucide-react";
import { Link } from "react-router-dom";
import { data } from "../data";
import { categoryName } from "../data/labels";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { Logo } from "../ui/Logo";
import { LinkButton, Skeleton } from "../ui/primitives";
import { LangCycle } from "../ui/shell";

/** Pins breathing around you: a drawn impression of the adda, not live data. */
function HeroArt() {
  const pins = [
    { left: "12%", top: "20%", label: "MA", color: "#7B5B3A", delay: "0s" },
    { left: "72%", top: "12%", label: "BA", color: "#3F6B7A", delay: "0.5s" },
    { left: "78%", top: "58%", label: "NB", color: "#6A4C7D", delay: "1s" },
    { left: "20%", top: "62%", label: "ZH", color: "#5B7A4F", delay: "1.5s" },
  ];
  return (
    <div dir="ltr" className="relative h-44 overflow-hidden rounded-4xl border border-line bg-sunken" aria-hidden>
      <svg viewBox="0 0 360 176" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <g stroke="#fff" strokeLinecap="round" fill="none">
          <path d="M-10 54 L370 32" strokeWidth="14" />
          <path d="M-10 138 L370 118" strokeWidth="10" />
          <path d="M92 -10 L120 190" strokeWidth="10" />
          <path d="M256 -10 L238 190" strokeWidth="14" />
        </g>
        <circle cx="180" cy="88" r="62" fill="#137A57" fillOpacity=".09" stroke="#137A57" strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 6" />
        <circle cx="180" cy="88" r="8" fill="#F2A71B" stroke="#fff" strokeWidth="4" />
      </svg>
      {pins.map((pin) => (
        <span key={pin.label} className="absolute h-11 w-11" style={{ left: pin.left, top: pin.top }}>
          <span className="map-pulse h-11 w-11" style={{ animationDelay: pin.delay }} />
          <span className="latin relative flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white text-sm font-bold text-white shadow-card" style={{ background: pin.color }}>
            {pin.label}
          </span>
        </span>
      ))}
    </div>
  );
}

export function Landing() {
  const { t, lang } = useSettings();
  const categories = useData(() => data.listCategories(), []);

  const steps = [
    { icon: Mic, title: t("بولیں", "Bolein", "Say it"), body: t("آواز، تصویر یا تحریر", "Awaz, tasveer ya likh kar", "Voice, photo or text") },
    { icon: MapPin, title: t("چنیں", "Chunein", "Choose"), body: t("قریب کا فارغ کاریگر", "Qareeb ka farigh kaarigar", "Someone free nearby") },
    { icon: Handshake, title: t("طے کریں", "Tay karein", "Agree"), body: t("قیمت طے، ایک ٹچ سے پکا", "Qeemat tay, ek tap mein pakka", "Set the price, book in a tap") },
  ];

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-6">
      <header className="flex min-h-16 items-center justify-between">
        <Logo />
        <LangCycle />
      </header>

      <section className="relative mt-3 animate-rise">
        <div className="pointer-events-none absolute -top-16 start-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-amber-100/70 blur-3xl rtl:translate-x-1/2" aria-hidden />
        <div className="relative">
          <h1 className={lang === "en" ? "latin text-4xl font-extrabold leading-tight" : lang === "ur" ? "ur text-4xl" : "latin text-4xl font-extrabold leading-tight"}>
            {t("محلے کا اڈا، اب آپ کے فون پر", "Mohallay ka adda, ab aap ke phone par", "Your neighbourhood adda, now on your phone")}
          </h1>
          <p className="mt-2 text-lg text-soft">{t("اسلام آباد اور راولپنڈی میں قریب کے فارغ کاریگر۔ بس بول کر بتائیں۔", "Islamabad aur Rawalpindi mein qareeb ke farigh kaarigar. Bas bol kar batayein.", "Skilled workers free near you in Islamabad and Rawalpindi. Just say what you need.")}</p>
          <div className="mt-4 space-y-2">
            <LinkButton to="/app/login?role=customer" size="xl" icon={House} className="w-full">
              {t("مجھے کام کروانا ہے", "Mujhe kaam karwana hai", "Hire someone nearby")}
            </LinkButton>
            <LinkButton to="/app/login?role=worker" size="xl" variant="secondary" icon={HardHat} className="w-full">
              {t("میں کام کرتا ہوں", "Main kaam karta hoon", "I'm a worker")}
            </LinkButton>
          </div>
        </div>
      </section>

      <div className="mt-5">
        <HeroArt />
      </div>

      <section className="mt-5">
        <Async
          query={categories}
          skeleton={
            <div className="flex gap-2 overflow-hidden">
              {[0, 1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-24 w-24 shrink-0" />
              ))}
            </div>
          }
        >
          {(list) => (
            <div className="scroll-x -mx-4 flex snap-x gap-2 overflow-x-auto px-4">
              {list.map((category) => (
                <Link key={category.id} to={`/app/adda?cat=${category.id}`} className="flex h-24 w-24 shrink-0 snap-start flex-col items-center justify-center rounded-3xl border border-line bg-surface p-1 text-center transition active:scale-95">
                  <CategoryIcon name={category.icon} className="h-7 w-7 text-brand-600" />
                  <span className="text-sm font-semibold">{categoryName(category, lang)}</span>
                </Link>
              ))}
            </div>
          )}
        </Async>
      </section>

      <section className="mt-6">
        <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-3xl bg-sunken p-3 text-center">
              <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-brand-600">
                <step.icon className="h-6 w-6" aria-hidden />
                <span className="latin absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{index + 1}</span>
              </span>
              <span className="mt-1 block font-bold">{step.title}</span>
              <span className="block text-sm text-soft">{step.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 grid gap-3">
        <Link to="/app/login?role=worker" className="group flex items-center gap-3 rounded-3xl bg-brand-600 p-4 text-white transition active:scale-[0.99]">
          <HardHat className="h-9 w-9 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">{t("کاریگروں کے لیے", "Kaarigaron ke liye", "For workers")}</span>
            <span className="block text-white/85">{t("بول کر یا لکھ کر مفت پروفائل۔ اپنی قیمت، اپنا وقت۔", "Bol kar ya likh kar muft profile. Apni qeemat, apna waqt.", "A free profile by voice or typing. Your price, your time.")}</span>
          </span>
          <ArrowLeft className="h-6 w-6 shrink-0" aria-hidden />
        </Link>
        <Link to="/app/login?role=customer" className="group flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 transition active:scale-[0.99]">
          <House className="h-9 w-9 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">{t("گھروں کے لیے", "Gharon ke liye", "For households")}</span>
            <span className="block text-soft">{t("ایک دن یا کئی دن، ایک کاریگر یا پوری ٹیم۔", "Ek din ya kai din, ek kaarigar ya poori team.", "One day or many, one worker or a whole crew.")}</span>
          </span>
          <ArrowLeft className="h-6 w-6 shrink-0 text-soft" aria-hidden />
        </Link>
      </section>

      <footer className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm text-soft">
        <Logo size={28} stacked={false} />
        <span>{t("اسلام آباد · راولپنڈی", "Islamabad · Rawalpindi", "Islamabad · Rawalpindi")}</span>
      </footer>
    </div>
  );
}
