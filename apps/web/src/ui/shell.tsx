import { Briefcase, ChevronRight, House, Map as MapIcon, MessageCircleQuestion, User, Volume2, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigationType } from "react-router-dom";
import { speakUrdu } from "../lib/audio";
import { parentOf, useGoBack } from "../lib/back";
import { useSession } from "../lib/session";
import { useSettings, type Lang } from "../lib/settings";
import { cx } from "./primitives";

const LANGS: { value: Lang; label: string; className: string }[] = [
  { value: "ur", label: "اردو", className: "ur" },
  { value: "roman", label: "Roman Urdu", className: "latin" },
  { value: "en", label: "English", className: "latin" },
];

/** The full language choice, for the welcome and settings screens. */
export function LangPills({ className }: { className?: string }) {
  const { lang, setLang } = useSettings();
  return (
    <div className={cx("flex flex-wrap justify-center gap-2", className)} role="group" aria-label="Language">
      {LANGS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={lang === option.value}
          onClick={() => setLang(option.value)}
          className={cx("min-h-12 rounded-full px-4 text-sm font-bold", option.className, lang === option.value ? "bg-brand-600 text-white" : "bg-sunken text-soft")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** One tap to the next language, on every screen. */
export function LangCycle() {
  const { lang, setLang } = useSettings();
  const next: Record<Lang, { to: Lang; label: string; className: string }> = {
    ur: { to: "roman", label: "Ro", className: "latin" },
    roman: { to: "en", label: "EN", className: "latin" },
    en: { to: "ur", label: "اردو", className: "ur text-sm" },
  };
  const entry = next[lang];
  return (
    <button type="button" onClick={() => setLang(entry.to)} aria-label="Change language" className={cx("h-12 min-w-12 shrink-0 rounded-2xl px-2 font-bold text-soft hover:bg-sunken", entry.className)}>
      {entry.label}
    </button>
  );
}

export function ReadAloud({ text }: { text: string }) {
  const { t, audioCues } = useSettings();
  return (
    <button
      type="button"
      onClick={() => speakUrdu(text, audioCues)}
      aria-label={t("سنیں", "Sunein", "Read aloud")}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"
    >
      <Volume2 className="h-6 w-6" aria-hidden />
    </button>
  );
}

/** Heading in Urdu with a helper line, matching the worker screens in the design. */
export function Headline({ ur, roman, en, size = "3xl" }: { ur: string; roman: string; en: string; size?: "2xl" | "3xl" | "4xl" }) {
  const { lang } = useSettings();
  const english = lang === "en";
  return (
    <div>
      <h1 dir={english ? "ltr" : "rtl"} className={cx(english ? "latin font-extrabold" : "ur", `text-${size}`)}>
        {english ? en : ur}
      </h1>
      <p dir={english ? "rtl" : "ltr"} className={cx("text-soft", english ? "ur" : "latin", lang === "ur" && "text-right")}>
        {english ? ur : roman}
      </p>
    </div>
  );
}

type NavItem = { to: string; icon: LucideIcon; ur: string; roman: string; en: string };

const NAV: Record<"worker" | "customer", NavItem[]> = {
  worker: [
    { to: "/app/worker", icon: House, ur: "گھر", roman: "Ghar", en: "Home" },
    { to: "/app/jobs", icon: Briefcase, ur: "کام", roman: "Kaam", en: "Jobs" },
    { to: "/app/earnings", icon: Wallet, ur: "کمائی", roman: "Kamai", en: "Earnings" },
    { to: "/app/workers/me", icon: User, ur: "پروفائل", roman: "Profile", en: "Profile" },
  ],
  customer: [
    { to: "/app/describe", icon: MessageCircleQuestion, ur: "مسئلہ", roman: "Masla", en: "Problem" },
    { to: "/app/adda", icon: MapIcon, ur: "اڈا", roman: "Adda", en: "Adda" },
    { to: "/app/jobs", icon: Briefcase, ur: "کام", roman: "Kaam", en: "Jobs" },
    { to: "/app/hirers/me", icon: User, ur: "پروفائل", roman: "Profile", en: "Profile" },
  ],
};

function BottomNav({ kind }: { kind: "worker" | "customer" }) {
  const { t } = useSettings();
  return (
    <nav className="sticky bottom-0 z-[500] grid grid-cols-4 border-t border-line bg-surface" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {NAV[kind].map(({ to, icon: Icon, ur, roman, en }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => cx("flex min-h-16 flex-col items-center justify-center text-sm font-semibold", isActive ? "text-brand-700" : "text-faint")}
        >
          <Icon className="h-6 w-6" aria-hidden />
          <span>{t(ur, roman, en)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex flex-1 justify-center gap-1.5" role="img" aria-label={`${current} / ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={cx("h-1.5 w-7 rounded-full", index < current ? "bg-brand-600" : "bg-line")} />
      ))}
    </div>
  );
}

function BackButton({ back }: { back: true | string | (() => void) }) {
  const { t } = useSettings();
  const { pathname } = useLocation();
  const { user, home } = useSession();
  const goBack = useGoBack(typeof back === "function" ? true : back, parentOf(pathname, user, home));
  return (
    <button
      type="button"
      aria-label={t("واپس", "Wapas", "Back")}
      onClick={typeof back === "function" ? back : goBack}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-ink hover:bg-sunken"
    >
      <ChevronRight className="h-7 w-7 ltr:rotate-180" aria-hidden />
    </button>
  );
}

export function Screen({
  title,
  back,
  right,
  nav,
  footer,
  children,
  bare,
  speak,
  steps,
}: {
  title?: string;
  /** true goes back in history, with a sensible parent when there is none. A string is this screen's parent. A function decides for itself. */
  back?: boolean | string | (() => void);
  right?: ReactNode;
  nav?: "worker" | "customer";
  footer?: ReactNode;
  children: ReactNode;
  /** No padding on the content area, for edge-to-edge layouts. */
  bare?: boolean;
  /** Urdu text the speaker button reads aloud. */
  speak?: string;
  steps?: { total: number; current: number };
}) {
  const navigationType = useNavigationType();
  const { t } = useSettings();
  const hasHeader = title !== undefined || steps;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip bg-page">
      {hasHeader && (
        <header className="sticky top-0 z-[500] flex min-h-16 items-center gap-1 bg-page/95 px-2 backdrop-blur">
          {back ? (
            <BackButton back={back} />
          ) : (
            <span className="w-2" />
          )}
          {steps ? <StepDots {...steps} /> : <h1 className="min-w-0 flex-1 truncate text-xl">{title}</h1>}
          {right}
          {speak && <ReadAloud text={speak} />}
          <LangCycle />
        </header>
      )}
      <main className={cx("flex-1", !bare && "px-4 pb-6", navigationType === "POP" ? "animate-page-back" : "animate-page-in")}>{children}</main>
      {footer && (
        <div className="sticky bottom-0 z-[500] border-t border-line bg-surface p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          {footer}
        </div>
      )}
      {nav && <BottomNav kind={nav} />}
    </div>
  );
}
