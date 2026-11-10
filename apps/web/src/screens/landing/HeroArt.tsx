import { Mic } from "lucide-react";
import type { CSSProperties } from "react";
import type { Category } from "../../data";
import { categoryName } from "../../data/labels";
import { useSettings } from "../../lib/settings";
import { CategoryIcon } from "../../ui/CategoryIcon";
import { cx } from "../../ui/primitives";

const ARCH = "M0 456V196C0 120 130 96 200 8C270 96 400 120 400 196V456Q400 480 376 480H24Q0 480 0 456Z";
const STREET_Y = 412;

const HOUSES = [
  { x: -6, w: 62, h: 62, fill: "#FFF6E3" },
  { x: 56, w: 50, h: 92, fill: "#FDECC8" },
  { x: 106, w: 70, h: 54, fill: "#FFFDF8" },
  { x: 176, w: 48, h: 78, fill: "#F7C873" },
  { x: 224, w: 66, h: 58, fill: "#FFF6E3" },
  { x: 290, w: 50, h: 100, fill: "#FDECC8" },
  { x: 340, w: 66, h: 66, fill: "#FFFDF8" },
];

const PINS = [
  { x: 81, y: 318, fill: "#FFFFFF", dot: "#137A57", delay: "0.3s" },
  { x: 200, y: 332, fill: "#F2A71B", dot: "#FFFFFF", delay: "0s" },
  { x: 315, y: 310, fill: "#FFFFFF", dot: "#137A57", delay: "0.8s" },
];

function House({ x, w, h, fill, index }: { x: number; w: number; h: number; fill: string; index: number }) {
  const top = STREET_Y - h;
  const rows = Math.max(1, Math.floor((h - 18) / 22));
  const columns = Math.max(1, Math.floor((w - 10) / 18));
  const windows = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      windows.push(<rect key={`${row}-${column}`} x={x + 9 + column * 17} y={top + 12 + row * 21} width="9" height="11" rx="1.5" fill={(index + row + column) % 3 === 0 ? "#F2A71B" : "#B2DBC9"} />);
    }
  }
  return (
    <g>
      {index % 2 === 0 && <rect x={x + w / 2 - 8} y={top - 13} width="16" height="13" rx="3" fill="#0F6347" />}
      <rect x={x} y={top} width={w} height={h} fill={fill} />
      <rect x={x - 2} y={top - 3} width={w + 4} height="6" rx="2" fill="#E2D8C3" />
      {windows}
    </g>
  );
}

/** A drawn impression of a mohalla under the Margallas. It holds no people, prices or counts. */
function Scene() {
  return (
    <svg viewBox="-16 -18 432 514" className="relative mx-auto block h-auto w-[60%] md:w-[80%] lg:w-[76%]" aria-hidden focusable="false">
      <defs>
        <clipPath id="lp-arch">
          <path d={ARCH} />
        </clipPath>
        <linearGradient id="lp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFDFA0" />
          <stop offset="0.6" stopColor="#FFF3D9" />
        </linearGradient>
      </defs>

      <path d={ARCH} fill="none" stroke="rgb(var(--amber-400))" strokeWidth="2.5" transform="translate(200 240) scale(1.055) translate(-200 -240)" />

      <g clipPath="url(#lp-arch)">
        <rect width="400" height="480" fill="url(#lp-sky)" />
        <circle className="lp-sun" cx="200" cy="184" r="108" fill="#F2A71B" />
        <circle cx="200" cy="184" r="66" fill="#F2A71B" />
        <path d="M112 96l9 6 9-6M268 128l7 5 7-5" stroke="#965E04" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        <path d="M0 268C40 236 78 252 112 230c38-24 64 10 104-4 46-18 84 18 124-2 24-12 44-2 60 8v248H0z" fill="#B2DBC9" />
        <path d="M0 304c52-32 96 0 150-24 56-24 96 20 150-4 40-16 72 4 100 14v190H0z" fill="#1B8F68" />
        <path d="M0 346c60-22 118 4 182-14 66-18 130 12 218-6v154H0z" fill="#137A57" />

        <g fill="#1B8F68">
          <circle cx="50" cy="402" r="14" />
          <circle cx="174" cy="404" r="12" />
          <circle cx="288" cy="402" r="14" />
          <circle cx="396" cy="400" r="16" />
        </g>
        {HOUSES.map((house, index) => (
          <House key={house.x} {...house} index={index} />
        ))}

        <rect y={STREET_Y} width="400" height="68" fill="#F1E8D6" />
        <path d="M0 448h400" stroke="#FFFFFF" strokeWidth="30" />
        <path d="M0 448h400" stroke="#F2A71B" strokeWidth="2.5" strokeDasharray="14 12" />
      </g>

      <path d={ARCH} fill="none" stroke="#FFFFFF" strokeWidth="5" />

      {PINS.map((pin) => (
        <g key={pin.x} transform={`translate(${pin.x} ${pin.y})`}>
          <ellipse className="lp-ring" style={{ "--d": pin.delay } as CSSProperties} cx="0" cy="0" rx="22" ry="8" fill={pin.fill === "#F2A71B" ? "#F2A71B" : "#FFFFFF"} />
          <g className="lp-pin" style={{ "--d": pin.delay } as CSSProperties}>
            <path d="M0 0C-13-16-19-25-19-34a19 19 0 1 1 38 0C19-25 13-16 0 0z" fill={pin.fill} stroke="#0F6347" strokeOpacity=".18" />
            <circle cx="0" cy="-34" r="7.5" fill={pin.dot} />
          </g>
        </g>
      ))}
    </svg>
  );
}

const BADGE_SPOTS: { side: "start" | "end"; top: string; delay: number }[] = [
  { side: "start", top: "8%", delay: 420 },
  { side: "end", top: "22%", delay: 520 },
  { side: "start", top: "36%", delay: 620 },
  { side: "end", top: "64%", delay: 720 },
];

/** The floating trades are whichever ones the API returns first. */
export function HeroArt({ categories }: { categories: Category[] | null }) {
  const { t, lang } = useSettings();
  const shown = categories ?? [];

  return (
    <div className="relative mx-auto w-full max-w-[340px] pb-7 md:max-w-[460px] lg:max-w-[540px]" aria-hidden>
      <div className="lp-glow pointer-events-none absolute -inset-8" />
      <div className="lp-rise" style={{ "--d": "120ms" } as CSSProperties}>
        <Scene />
      </div>

      {BADGE_SPOTS.map((spot, index) => {
        const category = shown[index];
        if (!category) return null;
        return (
          <div key={category.id} className="lp-pop absolute" style={{ top: spot.top, [spot.side === "start" ? "insetInlineStart" : "insetInlineEnd"]: 0, "--d": `${spot.delay}ms` } as CSSProperties}>
            <div className="lp-float" style={{ "--d": `${index * 500}ms` } as CSSProperties}>
              <div className={cx("flex h-12 w-12 items-center justify-center gap-2 rounded-2xl bg-surface shadow-lift lg:h-auto lg:w-auto lg:rounded-full lg:py-1.5 lg:pe-4 lg:ps-1.5")}>
                <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl lg:rounded-full", index % 2 === 0 ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-800")}>
                  <CategoryIcon name={category.icon} className="h-5 w-5" />
                </span>
                <span className="hidden whitespace-nowrap text-sm font-bold lg:inline">{categoryName(category, lang)}</span>
              </div>
            </div>
          </div>
        );
      })}

      <div className="lp-pop absolute inset-x-0 bottom-0 flex justify-center lg:justify-start lg:px-2" style={{ "--d": "860ms" } as CSSProperties}>
        <div className="flex items-center gap-2 rounded-full bg-surface py-1.5 pe-4 ps-1.5 shadow-lift">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
            <Mic className="h-[18px] w-[18px]" />
          </span>
          <span dir="ltr" className="flex h-5 items-center gap-[3px]">
            {[0, 180, 90, 270, 40].map((delay) => (
              <span key={delay} className="lp-bar h-full w-[3px] rounded-full bg-amber-400" style={{ "--d": `${delay}ms` } as CSSProperties} />
            ))}
          </span>
          <span className="whitespace-nowrap text-sm font-semibold">{t("پنکھا نہیں چل رہا", "Pankha nahi chal raha", "My fan has stopped")}</span>
        </div>
      </div>
    </div>
  );
}
