import { ArrowLeft, LoaderCircle, Map as MapIcon, Search, SearchX, Volume2, Square, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { data, type Area, type Category, type LatLng, type WorkerCard } from "../../data";
import { categoryName } from "../../data/labels";
import { getVoiceState, stopVoice, subscribeVoice, toggleVoice } from "../../lib/question-voices";
import { useSettings, type Lang } from "../../lib/settings";
import { CategoryIcon } from "../../ui/CategoryIcon";
import { cx } from "../../ui/primitives";
import { useInView } from "./motion";

/** Typed examples, each one checked against the live trade matcher. */
const EXAMPLES: Record<Lang, string[]> = {
  ur: ["پنکھا نہیں چل رہا", "نلکا ٹپک رہا ہے", "اے سی ٹھنڈا نہیں کر رہا", "دروازہ ٹوٹ گیا ہے", "گاڑی اسٹارٹ نہیں ہو رہی"],
  roman: ["Pankha nahi chal raha", "Nalka tapak raha hai", "AC thanda nahi kar raha", "Darwaza toot gaya", "Ghar ki safai"],
  en: ["My fan has stopped", "The tap is leaking", "The AC is not cooling", "The door is broken", "Paint my room"],
};

type Match = { status: "idle" } | { status: "busy" } | { status: "done"; category: Category | null } | { status: "error" };

/** Try the real trade matcher, and see who is free on a live map of the twin cities. */
export function LiveAdda({ categories, workers, areas }: { categories: Category[] | null; workers: WorkerCard[] | null; areas: Area[] | null }) {
  const { t, lang } = useSettings();
  const [text, setText] = useState("");
  const [match, setMatch] = useState<Match>({ status: "idle" });

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) {
      setMatch({ status: "idle" });
      return;
    }
    setMatch({ status: "busy" });
    let active = true;
    const timer = setTimeout(() => {
      data
        .matchTrade(query)
        .then((category) => active && setMatch({ status: "done", category }))
        .catch(() => active && setMatch({ status: "error" }));
    }, 320);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [text]);

  const found = match.status === "done" && match.category ? (categories?.find((c) => c.id === match.category?.id) ?? match.category) : null;
  const shown = useMemo(() => (workers ?? []).filter((worker) => !found || worker.categoryIds.includes(found.id)), [workers, found]);

  return (
    <div className="grid gap-4 rounded-[2rem] border border-line bg-surface p-3 shadow-card sm:p-4 lg:grid-cols-[1fr_1.08fr] lg:gap-8 lg:p-7">
      <div className="flex min-w-0 flex-col p-1 lg:py-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="lp-try" className="lp-h3">
            {t("کیا کام ہے؟ لکھ کر دیکھیں", "Kya kaam hai? Likh kar dekhein", "What needs fixing? Type it")}
          </label>
          <ListenButton />
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" aria-hidden />
          <input
            id="lp-try"
            dir="auto"
            value={text}
            maxLength={300}
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
            placeholder={t("مثلاً: نلکا ٹپک رہا ہے", "Maslan: nalka tapak raha hai", "e.g. the tap is leaking")}
            className="min-h-14 w-full rounded-2xl border-2 border-line bg-page pe-12 ps-11 text-base font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-faint focus:border-brand-500 focus:bg-surface"
          />
          {text && (
            <button type="button" onClick={() => setText("")} aria-label={t("صاف کریں", "Saaf karein", "Clear")} className="absolute end-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl text-soft hover:text-ink">
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
        <div className="scroll-x -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {EXAMPLES[lang].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              className={cx(
                "min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                text === example ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-page text-soft hover:border-brand-200 hover:text-ink",
              )}
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-3 flex-1" aria-live="polite">
          <Result match={match} found={found} shown={shown} workers={workers} categories={categories} />
        </div>
      </div>

      <LiveMap workers={workers} areas={areas} highlight={found} />
    </div>
  );
}

function Result({ match, found, shown, workers, categories }: { match: Match; found: Category | null; shown: WorkerCard[]; workers: WorkerCard[] | null; categories: Category[] | null }) {
  const { t, lang } = useSettings();

  if (match.status === "busy") {
    return (
      <div className="flex h-full min-h-[9.5rem] items-center justify-center gap-2 rounded-3xl bg-page font-semibold text-soft">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
        {t("پہچان رہے ہیں…", "Pehchan rahe hain…", "Working it out…")}
      </div>
    );
  }

  if (match.status === "error") {
    return (
      <div className="flex h-full min-h-[9.5rem] flex-col items-start justify-center gap-1 rounded-3xl bg-page p-4">
        <span className="font-bold">{t("ابھی رابطہ نہیں ہو سکا", "Abhi rabta nahi ho saka", "Could not reach the app just now")}</span>
        <span className="text-soft">{t("انٹرنیٹ دیکھ کر دوبارہ لکھیں", "Internet dekh kar dobara likhein", "Check the internet and try again")}</span>
      </div>
    );
  }

  if (match.status === "done" && !found) {
    return (
      <div className="flex h-full min-h-[9.5rem] flex-col justify-center gap-2 rounded-3xl bg-page p-4">
        <span className="flex items-center gap-2 font-bold">
          <SearchX className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          {t("یہ کام ہم پہچان نہیں سکے", "Yeh kaam hum pehchan nahi sake", "We could not tell which trade that is")}
        </span>
        <span className="text-soft">{t("ایپ میں AI تفصیل سے پوچھ کر صحیح کاریگر ڈھونڈ دے گا", "App mein AI tafseel se pooch kar sahi kaarigar dhoond dega", "In the app, AI asks a little more and finds the right worker")}</span>
        <Link to="/app/login?role=customer" className="lp-tile mt-1 inline-flex min-h-12 items-center gap-2 self-start rounded-2xl bg-brand-600 px-4 font-bold text-white">
          {t("ایپ میں بتائیں", "App mein batayein", "Describe it in the app")}
          <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden />
        </Link>
      </div>
    );
  }

  if (found) {
    return (
      <div key={found.id} className="lp-scene-in flex h-full min-h-[9.5rem] flex-col justify-center rounded-3xl bg-brand-50 p-4">
        <span className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-brand-800 shadow-card">
            <CategoryIcon name={found.icon} className="h-7 w-7" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-brand-700">{t("یہ کام ہے", "Yeh kaam hai", "That's a job for")}</span>
            <span className="lp-h3 block">{categoryName(found, lang)}</span>
          </span>
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {shown.length > 0 && <Faces workers={shown} />}
          <span className="font-bold text-brand-800">
            {shown.length > 0
              ? t(`${shown.length} ابھی فارغ ہیں`, `${shown.length} abhi farigh hain`, `${shown.length} free right now`)
              : t("ابھی کوئی فارغ نہیں، کام لگا دیں", "Abhi koi farigh nahi, kaam laga dein", "No one free right now, post the job")}
          </span>
        </span>
        <Link to={`/app/adda?cat=${encodeURIComponent(found.id)}`} className="lp-tile mt-3 inline-flex min-h-12 items-center justify-center gap-2 self-stretch rounded-2xl bg-brand-600 px-5 font-bold text-white sm:self-start">
          {t("دیکھیں کون فارغ ہے", "Dekhein kaun farigh hai", "See who's free")}
          <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden />
        </Link>
      </div>
    );
  }

  const trades = (categories ?? []).filter((category) => workers?.some((worker) => worker.categoryIds.includes(category.id)));
  return (
    <div className="flex h-full min-h-[9.5rem] flex-col justify-center rounded-3xl bg-page p-4">
      <span className="flex items-baseline gap-2">
        <span className="latin text-4xl font-extrabold tracking-tight text-brand-700">{workers ? workers.length : "–"}</span>
        <span className="font-bold">{t("کاریگر ابھی فارغ ہیں", "kaarigar abhi farigh hain", "workers free right now")}</span>
      </span>
      {trades.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1.5" aria-hidden>
          {trades.slice(0, 9).map((category) => (
            <span key={category.id} title={categoryName(category, lang)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-brand-600 shadow-card">
              <CategoryIcon name={category.icon} className="h-[18px] w-[18px]" />
            </span>
          ))}
        </span>
      )}
      <span className="mt-2 text-sm text-soft">{t("اوپر مسئلہ لکھیں یا کوئی مثال دبائیں", "Upar masla likhein ya koi misaal dabayein", "Type a problem above, or tap an example")}</span>
    </div>
  );
}

function Faces({ workers }: { workers: WorkerCard[] }) {
  return (
    <span className="flex" aria-hidden>
      {workers.slice(0, 5).map((worker, index) => (
        <span key={worker.id} className={cx("flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-brand-50 bg-amber-100 text-sm font-extrabold text-amber-800", index > 0 && "-ms-2.5")}>
          {worker.photoUrl ? <img src={worker.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : (worker.name.trim()[0] ?? "؟")}
        </span>
      ))}
    </span>
  );
}

/** The app's own recorded question, so a visitor hears how it talks to someone who does not read. */
function ListenButton() {
  const { t, lang } = useSettings();
  const state = useSyncExternalStore(subscribeVoice, getVoiceState);
  const active = state?.id === "describe-problem" && state.phase !== "failed";
  useEffect(
    () => () => {
      if (getVoiceState()?.id === "describe-problem") stopVoice();
    },
    [lang],
  );
  const label = active ? t("آواز روکیں", "Awaz rokein", "Stop") : t("ایپ کا سوال سنیں", "App ka sawal sunein", "Hear the app ask");
  const Icon = active ? (state?.phase === "loading" ? LoaderCircle : Square) : Volume2;
  return (
    <button
      type="button"
      onClick={() => toggleVoice("describe-problem", lang === "en")}
      aria-pressed={active}
      className={cx("flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition", active ? "bg-brand-600 text-white" : "bg-amber-100 text-amber-800 hover:bg-amber-50")}
    >
      <Icon className={cx("h-5 w-5 shrink-0", state?.phase === "loading" && active && "animate-spin", state?.phase === "playing" && active && "fill-current")} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  );
}

/* ---------- The live map ---------- */

const BOUNDS = { north: 33.765, south: 33.5, west: 72.9, east: 73.19 };
const W = 600;
const KX = Math.cos((33.63 * Math.PI) / 180);
const H = Math.round((W * (BOUNDS.north - BOUNDS.south)) / ((BOUNDS.east - BOUNDS.west) * KX));

const project = (point: LatLng) => ({
  x: ((point.lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * W,
  y: ((BOUNDS.north - point.lat) / (BOUNDS.north - BOUNDS.south)) * H,
});

const inBounds = (point: LatLng) => point.lat < BOUNDS.north && point.lat > BOUNDS.south && point.lng > BOUNDS.west && point.lng < BOUNDS.east;

const line = (points: [number, number][]) =>
  points
    .map(([lat, lng], index) => {
      const { x, y } = project({ lat, lng });
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");

/** Main roads, drawn loosely to give the map its shape. They carry no names, so they claim no accuracy. */
const ROADS = [
  line([
    [33.641, 72.935],
    [33.654, 72.988],
    [33.663, 73.005],
    [33.672, 73.023],
    [33.681, 73.042],
    [33.693, 73.065],
  ]),
  line([
    [33.693, 73.065],
    [33.663, 73.088],
    [33.64, 73.105],
    [33.6, 73.13],
    [33.56, 73.15],
    [33.52, 73.165],
  ]),
  line([
    [33.663, 73.088],
    [33.626, 73.07],
    [33.614, 73.064],
    [33.596, 73.049],
  ]),
  line([
    [33.598, 72.95],
    [33.602, 73.02],
    [33.596, 73.049],
    [33.584, 73.096],
    [33.57, 73.135],
  ]),
  line([
    [33.708, 72.96],
    [33.72, 73.0],
    [33.733, 73.05],
    [33.738, 73.09],
  ]),
];

const CITIES = [
  { ur: "اسلام آباد", en: "ISLAMABAD", at: { lat: 33.676, lng: 72.906 } },
  { ur: "راولپنڈی", en: "RAWALPINDI", at: { lat: 33.552, lng: 72.95 } },
];

const LAKE = project({ lat: 33.703, lng: 73.128 });
const CENTRE = project({ lat: 33.662, lng: 73.055 });

type Label = { x: number; y: number; text: string };

/** Area names that do not collide with one another, in the order the API lists them. */
function placeLabels(areas: Area[], urdu: boolean): Label[] {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labels: Label[] = [];
  for (const area of areas) {
    if (!inBounds(area)) continue;
    const { x, y } = project(area);
    const text = urdu ? area.nameUr : area.name;
    const width = text.length * (urdu ? 8.8 : 9.2) + 12;
    const box = { x0: x - 4, x1: x + width, y0: y - 13, y1: y + 9 };
    if (box.x1 > W - 4 || box.y0 < 70) continue;
    if (placed.some((other) => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0)) continue;
    placed.push(box);
    labels.push({ x, y, text });
  }
  return labels;
}

function LiveMap({ workers, areas, highlight }: { workers: WorkerCard[] | null; areas: Area[] | null; highlight: Category | null }) {
  const { t, lang } = useSettings();
  const [ref, seen] = useInView<HTMLDivElement>({ once: true });
  const urdu = lang === "ur";
  const labels = useMemo(() => placeLabels(areas ?? [], urdu), [areas, urdu]);
  const pins = useMemo(() => (workers ?? []).filter((worker) => worker.location && inBounds(worker.location)), [workers]);
  const hotCount = highlight ? pins.filter((worker) => worker.categoryIds.includes(highlight.id)).length : pins.length;

  return (
    <div ref={ref} className="relative overflow-hidden rounded-3xl border border-line bg-[#F6F1E6]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" style={{ direction: "ltr" }} role="img" aria-label={t("اسلام آباد اور راولپنڈی کا نقشہ، فارغ کاریگروں کے ساتھ", "Islamabad aur Rawalpindi ka naqsha, farigh kaarigaron ke saath", "Map of Islamabad and Rawalpindi with free workers")}>
        <defs>
          <pattern id="lp-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill="#E2D8C3" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#lp-dots)" />

        <path d={`M0 0H${W}V54C540 72 500 40 450 62 400 84 360 50 300 70 240 92 200 58 140 78 90 94 40 66 0 84Z`} fill="#B2DBC9" />
        <path d={`M0 0H${W}V30C550 46 510 18 460 38 410 58 370 24 310 44 250 64 210 30 150 50 100 66 50 38 0 56Z`} fill="#1B8F68" opacity=".85" />
        <text x="18" y="30" fill="#FFFFFF" fontSize="15" fontWeight="700" className={urdu ? "ur" : "latin"}>
          {t("مارگلہ کی پہاڑیاں", "Margalla pahariyan", "Margalla Hills")}
        </text>

        <ellipse cx={LAKE.x} cy={LAKE.y} rx="34" ry="15" transform={`rotate(-24 ${LAKE.x} ${LAKE.y})`} fill="#CFE6EA" />

        {ROADS.map((d) => (
          <g key={d}>
            <path d={d} stroke="#E8DECB" strokeWidth="11" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} stroke="#FFFFFF" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}

        {CITIES.map((city) => {
          const { x, y } = project(city.at);
          return (
            <text key={city.en} x={x} y={y} fill="#C9BEA6" fontSize={urdu ? 26 : 20} fontWeight="800" letterSpacing={urdu ? 0 : 5} className={urdu ? "ur" : "latin"}>
              {urdu ? city.ur : city.en}
            </text>
          );
        })}

        <circle cx={CENTRE.x} cy={CENTRE.y} r="30" fill="none" stroke="#137A57" strokeWidth="2" className="lp-radar" />
        <circle cx={CENTRE.x} cy={CENTRE.y} r="30" fill="none" stroke="#137A57" strokeWidth="2" className="lp-radar" style={{ "--d": "2.2s" } as CSSProperties} />

        {labels.map((label) => (
          <g key={label.text}>
            <circle cx={label.x} cy={label.y} r="2.6" fill="#B9AD93" />
            <text x={label.x + 6} y={label.y + 4} fontSize={urdu ? 14 : 13.5} fontWeight="700" fill="#8A8170" className={cx("lp-maplabel", urdu ? "ur" : "latin")}>
              {label.text}
            </text>
          </g>
        ))}

        {seen &&
          pins.map((worker, index) => {
            const { x, y } = project(worker.location);
            const hot = highlight ? worker.categoryIds.includes(highlight.id) : false;
            const dim = Boolean(highlight) && !hot;
            return (
              <g key={worker.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
                <g className="lp-wpin-in" style={{ "--d": `${Math.min(index * 35, 1400)}ms` } as CSSProperties}>
                  <g className="lp-wpin" data-hot={hot ? "" : undefined} data-dim={dim ? "" : undefined}>
                    {hot && <circle r="9" fill="#F2A71B" className="lp-ping" />}
                    <circle r="8" fill={hot ? "#F2A71B" : "#137A57"} stroke="#FFFFFF" strokeWidth="2.5" />
                    <title>{worker.name}</title>
                  </g>
                </g>
              </g>
            );
          })}
      </svg>

      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-2">
        <span className="flex items-center gap-2 rounded-full bg-surface/95 px-3 py-1 text-sm font-bold shadow-card">
          <span className={cx("lp-live h-2.5 w-2.5 shrink-0 rounded-full", highlight ? "bg-amber-400" : "bg-brand-500")} />
          {highlight
            ? t(`${hotCount} ${categoryName(highlight, lang)} فارغ`, `${hotCount} ${categoryName(highlight, lang)} farigh`, `${hotCount} ${categoryName(highlight, lang)} free`)
            : t(`${hotCount} فارغ کاریگر`, `${hotCount} farigh kaarigar`, `${hotCount} free workers`)}
        </span>
        <span className="rounded-full bg-brand-700 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white">
          <span className="latin">LIVE</span>
        </span>
      </div>

      <Link
        to="/app/adda"
        className="absolute right-2 top-2 flex min-h-12 items-center gap-1.5 rounded-full bg-surface/95 px-3 text-sm font-bold text-brand-700 shadow-card transition hover:bg-surface"
      >
        <MapIcon className="h-5 w-5 shrink-0" aria-hidden />
        {t("پورا نقشہ", "Poora naqsha", "Full map")}
      </Link>
    </div>
  );
}
