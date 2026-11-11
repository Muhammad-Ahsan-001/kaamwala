import { Check, Mic, Sparkles, Star, Zap } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import logoUrl from "../../assets/logo.svg";
import { useSettings } from "../../lib/settings";
import { cx } from "../../ui/primitives";
import { useInView, useReducedMotion } from "./motion";

const STEP_MS = 3600;
const STEPS = 4;

/**
 * A drawn walk-through of one booking, labelled as an example on screen.
 * The worker, price and distance in it are illustration, not live data.
 */
export function PhoneDemo() {
  const { t } = useSettings();
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ margin: "0px" });
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const playing = inView && !reduced;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setStep((current) => (current + 1) % STEPS), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, step, run]);

  const go = (next: number) => {
    setStep(next);
    setRun((count) => count + 1);
  };

  const titles = [
    t("بول کر بتائیں", "Bol kar batayein", "Say the problem"),
    t("ایپ کام پہچان لیتی ہے", "App kaam pehchan leti hai", "The app spots the trade"),
    t("قریب کا فارغ کاریگر", "Qareeb ka farigh kaarigar", "Someone free, nearby"),
    t("قیمت طے، کام پکا", "Qeemat tay, kaam pakka", "Price agreed, booked"),
  ];

  return (
    <div ref={ref} className="relative z-10 flex flex-col items-center">
      <div className="lp-phone">
        <div className="lp-screen" data-paused={playing ? undefined : ""} onClick={() => go((step + 1) % STEPS)} aria-hidden>
          <StatusBar />
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <span dir="ltr" className="flex items-center gap-1.5">
              <img src={logoUrl} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
              <span className="latin text-xs font-extrabold">KaamWala</span>
            </span>
            <span className="rounded-full bg-amber-100 px-2 text-[0.6875rem] font-bold text-amber-800">{t("مثال", "Misaal", "Example")}</span>
          </div>
          <div className="flex gap-1 px-4">
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                {index < step && <span className="block h-full w-full bg-brand-600" />}
                {index === step && <span key={`${step}-${run}`} className="lp-progress block h-full w-full bg-brand-600" style={{ "--ms": `${STEP_MS}ms` } as CSSProperties} />}
              </span>
            ))}
          </div>
          <div key={`${step}-${run}`} className="lp-scene-in absolute inset-x-0 bottom-0 top-[5.25rem]">
            {step === 0 && <VoiceScene />}
            {step === 1 && <UnderstoodScene />}
            {step === 2 && <NearbyScene />}
            {step === 3 && <BookedScene />}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center" role="group" aria-label={t("مثال کے قدم", "Misaal ke qadam", "Example steps")}>
        {titles.map((title, index) => (
          <button
            key={title}
            type="button"
            onClick={() => go(index)}
            aria-label={`${index + 1}. ${title}`}
            aria-current={index === step ? "step" : undefined}
            className="flex h-12 w-11 items-center justify-center"
          >
            <span className={cx("h-2.5 rounded-full transition-all duration-300", index === step ? "w-8 bg-brand-600" : "w-2.5 bg-line")} />
          </button>
        ))}
      </div>
      <p className="-mt-1 text-center text-sm font-bold text-soft" aria-hidden>
        <span className="latin me-1.5 text-amber-700">{step + 1}/4</span>
        {titles[step]}
      </p>
    </div>
  );
}

function StatusBar() {
  return (
    <div dir="ltr" className="latin flex h-8 items-end justify-between px-6 pb-1 text-[0.6875rem] font-bold">
      <span>9:41</span>
      <span className="flex items-end gap-[2px]">
        {[4, 6, 8, 10].map((height) => (
          <span key={height} className="w-[3px] rounded-sm bg-ink" style={{ height }} />
        ))}
        <span className="ms-1.5 h-[10px] w-5 rounded-[3px] border border-ink/70 p-[1px]">
          <span className="block h-full w-3/4 rounded-[1px] bg-ink" />
        </span>
      </span>
    </div>
  );
}

function useProblem() {
  const { t } = useSettings();
  return t("پنکھا نہیں چل رہا", "Pankha nahi chal raha", "My fan has stopped");
}

function VoiceScene() {
  const { t } = useSettings();
  const problem = useProblem();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-5 pb-8 text-center">
      <p className="font-bold">{t("کیا مسئلہ ہے؟", "Kya masla hai?", "What's the problem?")}</p>
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="lp-mic-ring absolute inset-2 rounded-full bg-brand-500/25" />
        <span className="lp-mic-ring absolute inset-2 rounded-full bg-brand-500/25" style={{ "--d": "0.9s" } as CSSProperties} />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift">
          <Mic className="h-9 w-9" />
        </span>
      </div>
      <div dir="ltr" className="flex h-8 items-center gap-[3px]">
        {[0, 160, 80, 240, 40, 200, 120, 280, 60, 180, 100, 220].map((delay, index) => (
          <span key={delay} className={cx("lp-bar h-full w-[3px] rounded-full", index % 3 === 1 ? "bg-amber-400" : "bg-brand-500")} style={{ "--d": `${delay}ms` } as CSSProperties} />
        ))}
      </div>
      <div className="w-full rounded-2xl rounded-ss-md bg-surface px-3 py-2 text-start shadow-card">
        <span className="lp-type font-semibold">{problem}</span>
      </div>
    </div>
  );
}

function UnderstoodScene() {
  const { t } = useSettings();
  const problem = useProblem();
  return (
    <div className="flex h-full flex-col gap-3 px-4 pt-3">
      <div className="max-w-[85%] self-end rounded-2xl rounded-se-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white">{problem}</div>
      <div className="lp-pop-in flex items-center gap-1.5 self-start rounded-full bg-amber-100 px-2.5 text-xs font-bold text-amber-800" style={{ "--d": "150ms" } as CSSProperties}>
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        {t("سمجھ گئے", "Samajh gaye", "Got it")}
      </div>
      <div className="lp-pop-in rounded-3xl bg-surface p-4 shadow-lift" style={{ "--d": "350ms" } as CSSProperties}>
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <Zap className="h-7 w-7" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-soft">{t("کام", "Kaam", "Trade")}</span>
            <span className="block text-lg font-extrabold">{t("الیکٹریشن", "Bijli wala", "Electrician")}</span>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-brand-700">{t("پنکھے کی مرمت", "Pankhe ki marammat", "Fan repair")}</span>
          <span className="rounded-full bg-sunken px-2.5 py-0.5 text-soft">{t("آج", "Aaj", "Today")}</span>
        </div>
      </div>
      <div className="lp-pop-in flex items-center gap-2 rounded-2xl border border-dashed border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700" style={{ "--d": "700ms" } as CSSProperties}>
        <span dir="ltr" className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="lp-dot h-1.5 w-1.5 rounded-full bg-brand-500" style={{ "--d": `${delay}ms` } as CSSProperties} />
          ))}
        </span>
        {t("قریب کے فارغ کاریگر ڈھونڈ رہے ہیں", "Qareeb ke farigh kaarigar dhoond rahe hain", "Finding who is free nearby")}
      </div>
    </div>
  );
}

const MINI_PINS = [
  { x: 54, y: 150, d: 100 },
  { x: 186, y: 118, d: 250 },
  { x: 76, y: 262, d: 400 },
  { x: 170, y: 236, d: 550 },
];

function NearbyScene() {
  const { t } = useSettings();
  return (
    <div className="relative h-full">
      <svg viewBox="0 0 240 440" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <rect width="240" height="440" fill="#F4EEE1" />
        {[0, 1, 2, 3, 4, 5].flatMap((row) =>
          [0, 1, 2].map((column) => <rect key={`${row}-${column}`} x={8 + column * 80} y={8 + row * 74} width="66" height="60" rx="8" fill={(row + column) % 4 === 1 ? "#CFE9DC" : "#EAE1CD"} />),
        )}
        <path d="M-10 196 C 60 176, 150 216, 250 184" stroke="#FFFFFF" strokeWidth="14" fill="none" />
        <path d="M-10 196 C 60 176, 150 216, 250 184" stroke="#F2A71B" strokeWidth="1.5" strokeDasharray="6 6" fill="none" />
        <circle cx="120" cy="196" r="26" fill="#137A57" opacity=".1" className="lp-radar-sm" />
        <circle cx="120" cy="196" r="7" fill="#1E2B25" stroke="#FFFFFF" strokeWidth="3" />
        {MINI_PINS.map((pin, index) => (
          <g key={pin.x} transform={`translate(${pin.x} ${pin.y})`}>
            <g className="lp-mpin" style={{ "--d": `${pin.d}ms` } as CSSProperties}>
              <path d="M0 0C-9-11-13-17-13-23a13 13 0 1 1 26 0C13-17 9-11 0 0z" fill={index === 3 ? "#F2A71B" : "#137A57"} stroke="#FFFFFF" strokeWidth="2" />
              <circle cx="0" cy="-23" r="4.5" fill="#FFFFFF" />
            </g>
          </g>
        ))}
      </svg>
      <div className="lp-sheet-up absolute inset-x-3 bottom-3 rounded-3xl bg-surface p-3 shadow-lift">
        <div className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg font-extrabold text-amber-800">{t("ش", "S", "S")}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{t("شاہد", "Shahid", "Shahid")}</span>
            <span dir="ltr" className="latin flex items-center gap-1 text-xs text-soft">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              4.9 · 1.2 km
            </span>
          </span>
          <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 text-xs font-bold text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {t("فارغ", "Farigh", "Free")}
          </span>
        </div>
        <div className="mt-2 rounded-2xl bg-brand-600 py-2 text-center text-sm font-bold text-white">{t("بلائیں", "Bulayein", "Request")}</div>
      </div>
    </div>
  );
}

const BURST = [
  { x: "-3.2rem", y: "-1.6rem", c: "bg-amber-400" },
  { x: "3.1rem", y: "-1.9rem", c: "bg-brand-500" },
  { x: "-2.4rem", y: "1.9rem", c: "bg-brand-500" },
  { x: "2.6rem", y: "1.7rem", c: "bg-amber-400" },
  { x: "0rem", y: "-3.1rem", c: "bg-amber-400" },
  { x: "-3.6rem", y: "0.3rem", c: "bg-brand-200" },
  { x: "3.7rem", y: "0rem", c: "bg-brand-200" },
];

function BookedScene() {
  const { t } = useSettings();
  return (
    <div className="flex h-full flex-col items-center gap-2 px-4 pt-3 text-center">
      <div className="w-full rounded-3xl bg-surface p-3 text-start shadow-card">
        <span className="block text-xs text-soft">{t("طے شدہ قیمت", "Tay shuda qeemat", "Agreed price")}</span>
        <span dir="ltr" className="mt-1 flex items-center justify-between">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunken text-lg font-bold text-soft">−</span>
          <span className="latin lp-pop-in text-2xl font-extrabold" style={{ "--d": "150ms" } as CSSProperties}>
            Rs 1,500
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunken text-lg font-bold text-soft">+</span>
        </span>
        <span className="mt-2 grid grid-cols-2 gap-1.5 text-xs font-bold">
          <span className="flex items-center gap-1 rounded-xl bg-brand-50 px-2 py-1 text-brand-700">
            <Check className="h-3.5 w-3.5 shrink-0" />
            {t("آپ", "Aap", "You")}
          </span>
          <span className="lp-pop-in flex items-center gap-1 rounded-xl bg-brand-50 px-2 py-1 text-brand-700" style={{ "--d": "450ms" } as CSSProperties}>
            <Check className="h-3.5 w-3.5 shrink-0" />
            {t("شاہد", "Shahid", "Shahid")}
          </span>
        </span>
      </div>
      <div className="relative mt-3 flex h-20 w-20 items-center justify-center">
        {BURST.map((dot, index) => (
          <span key={index} className={cx("lp-burst absolute h-2 w-2 rounded-full", dot.c)} style={{ "--x": dot.x, "--y": dot.y } as CSSProperties} />
        ))}
        <span className="lp-check flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift">
          <Check className="h-10 w-10" strokeWidth={3} />
        </span>
      </div>
      <p className="lp-pop-in text-lg font-extrabold" style={{ "--d": "800ms" } as CSSProperties}>
        {t("بکنگ پکی!", "Booking pakki!", "You're booked!")}
      </p>
      <p className="lp-pop-in text-sm text-soft" style={{ "--d": "950ms" } as CSSProperties}>
        {t("شاہد تقریباً 30 منٹ میں پہنچیں گے", "Shahid taqreeban 30 minute mein pohanchein ge", "Shahid arrives in about 30 minutes")}
      </p>
    </div>
  );
}
