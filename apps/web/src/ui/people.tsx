import { PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";
import type { WorkerCard, WorkerStatus } from "../data";
import { initials, personName, phrase, rupees } from "../data/labels";
import { useSettings } from "../lib/settings";
import { Auto, Rating, Tag, cx } from "./primitives";

const AVATAR_COLORS = ["#7B5B3A", "#3F6B7A", "#6A4C7D", "#8A7350", "#5B7A4F", "#A0604A"];

export function avatarColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? "#7B5B3A";
}

const STATUS_DOT: Record<WorkerStatus, string> = {
  available: "bg-brand-500",
  requested: "bg-brand-200",
  engaged: "bg-busy-500",
  completed: "bg-brand-200",
  offline: "bg-faint",
};

export function Avatar({ name, url, size = 52, status, ringed }: { name: string; url?: string | null; size?: number; status?: WorkerStatus; ringed?: boolean }) {
  return (
    <span className={cx("relative inline-block shrink-0 rounded-full", ringed && "p-1 ring-2 ring-brand-200")} style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="latin flex h-full w-full items-center justify-center rounded-full font-bold text-white" style={{ fontSize: size * 0.32, lineHeight: 1, background: avatarColor(name) }} aria-hidden>
          {initials(name)}
        </span>
      )}
      {status && <span className={cx("absolute bottom-0 end-0 h-3.5 w-3.5 rounded-full border-2 border-surface", STATUS_DOT[status])} aria-hidden />}
    </span>
  );
}

export function StatusPill({ status }: { status: WorkerStatus }) {
  const { t } = useSettings();
  const map: Record<WorkerStatus, { tone: "brand" | "busy" | "plain"; ur: string; roman: string; en: string }> = {
    available: { tone: "brand", ur: "فارغ", roman: "Farigh", en: "Available" },
    requested: { tone: "plain", ur: "درخواست آئی", roman: "Request aayi", en: "Requested" },
    engaged: { tone: "busy", ur: "کام پر", roman: "Kaam par", en: "On a job" },
    completed: { tone: "plain", ur: "کام مکمل", roman: "Mukammal", en: "Completed" },
    offline: { tone: "plain", ur: "مصروف", roman: "Masroof", en: "Busy" },
  };
  const entry = map[status];
  return <Tag tone={entry.tone}>{t(entry.ur, entry.roman, entry.en)}</Tag>;
}

export function WorkerRow({ worker, highlighted, hireQuery = "" }: { worker: WorkerCard; highlighted?: boolean; hireQuery?: string }) {
  const { lang, t } = useSettings();
  const topTag = worker.trust.tags[0]?.tag;
  return (
    <Link to={`/app/workers/${worker.id}${hireQuery}`} className={cx("flex items-center gap-3 rounded-3xl border bg-surface p-3 transition active:scale-[0.99]", highlighted ? "border-brand-600" : "border-line")}>
      <Avatar name={worker.name} url={worker.photoUrl} status={worker.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-bold">
            <Auto text={personName(worker.name, lang)} />
          </span>
          <span className="latin shrink-0 font-bold">{rupees(worker.rate)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-soft">
          <Rating value={worker.trust.rating} count={worker.trust.ratingCount} />
          {worker.distanceKm !== undefined && (
            <span>
              <span className="latin">{worker.distanceKm}</span> {t("کلومیٹر", "km", "km")}
            </span>
          )}
        </div>
        {topTag && (
          <div className="mt-1">
            <Tag>{phrase(topTag, lang)}</Tag>
          </div>
        )}
      </div>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white" aria-hidden>
        <PhoneCall className="h-5 w-5" />
      </span>
    </Link>
  );
}
