import { CircleCheck, FlaskConical, Loader2, Search, X, type LucideIcon } from "lucide-react";
import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Job, JobMode } from "../../data";
import { rupees } from "../../data/labels";
import { useSettings } from "../../lib/settings";
import { Button, Card, Chip, IconButton, cx } from "../../ui/primitives";

export type Words = { ur: string; roman: string; en: string };

/** A lucide-shaped spinner, so it can go in a Button's icon slot while something saves. */
export const Spinner: LucideIcon = forwardRef((props, ref) => <Loader2 ref={ref} {...props} className={cx(props.className, "animate-spin")} />) as LucideIcon;
Spinner.displayName = "Spinner";

export const JOB_STATUS: Record<Job["status"], Words & { tone: "brand" | "busy" | "plain" }> = {
  open: { ur: "آفرز آ رہی ہیں", roman: "Offers aa rahi hain", en: "Collecting offers", tone: "plain" },
  requested: { ur: "درخواست بھیجی", roman: "Request bheji", en: "Requested", tone: "plain" },
  negotiating: { ur: "قیمت کی بات", roman: "Qeemat ki baat", en: "Negotiating", tone: "plain" },
  pending_confirmation: { ur: "تصدیق باقی", roman: "Tasdeeq baqi", en: "To confirm", tone: "brand" },
  engaged: { ur: "کام جاری", roman: "Kaam jari", en: "In progress", tone: "busy" },
  completed: { ur: "مکمل", roman: "Mukammal", en: "Completed", tone: "brand" },
  cancelled: { ur: "منسوخ", roman: "Mansookh", en: "Cancelled", tone: "plain" },
  disputed: { ur: "شکایت", roman: "Shikayat", en: "Disputed", tone: "busy" },
};

export const JOB_MODE: Record<JobMode, Words> = {
  direct: { ur: "براہ راست", roman: "Seedha", en: "Direct" },
  open: { ur: "کھلا کام", roman: "Khula kaam", en: "Open job" },
  crew: { ur: "ٹیم", roman: "Crew", en: "Crew" },
};

/** +923001234567 becomes 0300 1234567. Anything else is shown as it is. */
export function phoneLabel(phone: string) {
  return /^\+92\d{10}$/.test(phone) ? `0${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}

/** Numbers, money and phone numbers stay left-to-right and in the Latin face inside Urdu text. */
export function Latin({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cx("latin", className)}>
      {children}
    </bdi>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <Latin className={className}>{rupees(value)}</Latin>;
}

export function Stat({ label, value, tone, footer }: { label: string; value: ReactNode; tone?: string; footer?: ReactNode }) {
  return (
    <Card className="min-w-0">
      <div className="truncate text-sm text-soft">{label}</div>
      <div className={cx("latin text-2xl font-extrabold tracking-tight lg:text-3xl", tone)}>{value}</div>
      {footer && <div className="mt-1">{footer}</div>}
    </Card>
  );
}

/** The one notice that fee collection is simulated. It goes everywhere fees are shown. */
export function MockNotice() {
  const { t } = useSettings();
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-faint bg-surface px-3 py-2 text-sm font-semibold text-soft">
      <FlaskConical className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {t(
          "فیس کی وصولی فرضی ہے۔ اصل پیسے نہیں لیے جاتے، یہاں صرف حساب درج ہوتا ہے۔",
          "Fee ki wasooli farzi hai. Asal paise nahi liye jate, yahan sirf hisaab darj hota hai.",
          "Fee collection is mocked. No real money moves; this only records what would be owed.",
        )}
      </span>
    </div>
  );
}

/** A short confirmation that floats above the page and clears itself. */
export function useFlash() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flashNode = message ? (
    <div role="status" className="fixed inset-x-4 top-16 z-[1100] flex animate-rise items-center gap-2 rounded-2xl bg-brand-800 px-4 py-3 font-bold text-white shadow-lift md:inset-x-auto md:bottom-6 md:end-6 md:top-auto md:w-96">
      <CircleCheck className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
    </div>
  ) : null;

  return { flash, flashNode };
}

const PAGE_SIZE = 40;

/** Long lists stay quick on phones: the first rows show at once and the rest come on request. */
export function useShowMore<T>(items: T[], resetKey: string) {
  const { t } = useSettings();
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [resetKey]);

  const remaining = items.length - limit;
  const moreButton =
    remaining > 0 ? (
      <Button size="md" variant="secondary" className="w-full" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
        {t("مزید دکھائیں", "Aur dikhayein", "Show more")} <Latin>({remaining})</Latin>
      </Button>
    ) : null;

  return { visible: items.slice(0, limit), moreButton };
}

export function FilterBar<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (next: T) => void; label: string }) {
  return (
    <div className="scroll-x -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label={label}>
      {options.map((option) => (
        <Chip key={option.value} active={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
          {option.count !== undefined && <span className={cx("latin rounded-full px-2 text-sm font-bold", option.value === value ? "bg-white/20 text-white" : "bg-sunken text-soft")}>{option.count}</span>}
        </Chip>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (next: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" aria-hidden />
      <input type="search" dir="auto" aria-label={label} className="field ps-12" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-sm text-soft">{item.label}</dt>
          <dd className="m-0 break-words font-bold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

/**
 * A panel over the page. Always a bottom sheet on phones.
 * On wide screens "drawer" comes in from the side and "dialog" sits in the middle.
 */
export function AdminPanel({ title, subtitle, kind = "drawer", onClose, footer, children }: { title: string; subtitle?: ReactNode; kind?: "drawer" | "dialog"; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  const { t } = useSettings();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflowY;
    document.body.style.overflowY = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflowY = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className={cx("fixed inset-0 z-[1000] flex items-end justify-center", kind === "drawer" ? "md:items-stretch md:justify-end" : "md:items-center")} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" tabIndex={-1} aria-label={t("بند کریں", "Band karein", "Close")} className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92dvh] w-full animate-sheet flex-col overflow-hidden rounded-t-4xl bg-surface shadow-lift outline-none",
          kind === "drawer" ? "md:h-dvh md:max-h-none md:max-w-xl md:animate-page-in md:rounded-none md:rounded-s-4xl" : "md:max-w-md md:animate-rise md:rounded-4xl",
        )}
      >
        <div className="flex items-center gap-2 border-b border-line py-2 pe-2 ps-5">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-xl">{title}</h2>
            {subtitle && <div className="truncate text-sm text-soft">{subtitle}</div>}
          </div>
          <IconButton icon={X} label={t("بند کریں", "Band karein", "Close")} onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="border-t border-line bg-surface p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
