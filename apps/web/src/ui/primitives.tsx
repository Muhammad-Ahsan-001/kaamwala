import { AlertCircle, CircleCheck, FlaskConical, Sparkles, Star, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { isLatin } from "../data/labels";
import { useSettings } from "../lib/settings";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-card hover:bg-brand-700",
  secondary: "border border-line bg-surface text-ink hover:border-brand-200",
  ghost: "text-brand-700 hover:bg-brand-50",
};

const SIZES: Record<Size, string> = {
  md: "min-h-12 px-4 text-base",
  lg: "min-h-14 px-5 text-lg",
  xl: "min-h-16 px-6 text-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "lg", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
};

export function Button({ variant, size, icon: Icon, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon className="h-6 w-6 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({
  variant,
  size,
  icon: Icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: LucideIcon }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon className="h-6 w-6 shrink-0" aria-hidden />}
      {children}
    </Link>
  );
}

export function IconButton({
  icon: Icon,
  label,
  className,
  tone = "plain",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: "plain" | "brand" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition active:scale-95 disabled:opacity-40",
        tone === "brand" ? "bg-brand-100 text-brand-700 hover:bg-brand-200" : "text-soft hover:bg-sunken",
        className,
      )}
      {...rest}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
}

/** Defaults apply only where the caller does not set its own, because Tailwind orders utilities alphabetically. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  const sets = (pattern: RegExp) => pattern.test(className);
  return (
    <div className={cx("rounded-3xl border", !sets(/(^|\s)border-(?!\d)/) && "border-line", !sets(/(^|\s)bg-/) && "bg-surface", !sets(/(^|\s)p-/) && "p-4", className)}>{children}</div>
  );
}

/** Renders mixed-script text with the right font and an isolated direction. */
export function Auto({ text, className }: { text: string; className?: string }) {
  return (
    <bdi dir="auto" className={cx(isLatin(text) ? "latin" : "ur", className)}>
      {text}
    </bdi>
  );
}

/** One line of text that is cut at its own end. Without this a Latin name on an Urdu screen loses its first letters. */
export function OneLine({ text, className }: { text: string; className?: string }) {
  const latin = isLatin(text);
  return (
    <span dir={latin ? "ltr" : "rtl"} className={cx("block truncate rtl:text-right", latin ? "latin" : "ur", className)}>
      {text}
    </span>
  );
}

export function Chip({
  active,
  icon: Icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        "inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-base font-semibold transition active:scale-[0.97]",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-soft hover:border-brand-200",
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

export function Tag({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "busy" | "plain" }) {
  const tones = {
    brand: "bg-brand-100 text-brand-700",
    busy: "bg-busy-100 text-busy-700",
    plain: "bg-sunken text-soft",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-sm font-semibold", tones[tone])}>{children}</span>;
}

/** An amber tag always means AI actually ran (Gemini or Jev). Use nowhere else. */
export function AiTag({ label, icon: Icon = Sparkles }: { label: string; icon?: LucideIcon }) {
  return (
    <span className={cx(isLatin(label) && "latin", "inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** Marks anything simulated, such as OTP delivery and fee collection. */
export function MockTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-faint bg-surface px-2.5 py-0.5 text-sm font-bold text-soft">
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

export function FreeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-0.5 text-sm font-bold text-brand-700">
      <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="latin inline-flex items-center gap-1 text-sm font-semibold text-ink">
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
      {value.toFixed(1)}
      {count !== undefined && <span className="font-normal text-faint">({count})</span>}
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between gap-3">
      <h2 className="text-lg text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  action,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  /** Sits at the end of the label line, outside the label so tapping it does not focus the input. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="block min-w-0 text-base font-bold text-ink">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-soft">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm font-bold text-busy-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-2xl bg-busy-50 px-3 py-2 font-semibold text-busy-700">
      <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex h-12 w-16 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span className={cx("flex h-8 w-14 items-center rounded-full p-1 transition-colors", checked ? "bg-brand-600" : "bg-line")}>
        <span className={cx("h-6 w-6 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6 rtl:-translate-x-6" : "translate-x-0")} />
      </span>
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className={cx("flex flex-col items-center gap-2 rounded-3xl bg-sunken py-8 text-center", action ? "px-4" : "px-6")}>
      <Icon className="h-10 w-10 text-brand-600" aria-hidden />
      <p className="text-lg font-bold">{title}</p>
      {body && <p className="text-soft">{body}</p>}
      {action && <div className="mt-1 w-full">{action}</div>}
    </div>
  );
}

type SheetHistory = { kwSheet?: number; idx?: unknown; key?: unknown } | null;
type OpenSheet = { id: number; idx: unknown; key: unknown; close: () => void };

/** Oldest first. Each open sheet owns one browser history entry, so the phone's back gesture closes it. */
const openSheets: OpenSheet[] = [];
/** Always rising, even across a reload, so a higher id means higher up the history. */
let lastSheetId = 0;
/** Steps through history made here. The router must not see them, or the page would replay its back animation. */
let ownSteps = 0;
/** What the router wrote over a sheet's entry. It moves down onto the page under the sheet, as a replace should. */
let replacedBy: { state: unknown; url: string } | null = null;

function stepBack() {
  ownSteps += 1;
  window.history.back();
}

function onHistoryPop(event: PopStateEvent) {
  const state = event.state as SheetHistory;
  const landed = state?.kwSheet ?? 0;
  if (ownSteps > 0) {
    ownSteps -= 1;
    event.stopImmediatePropagation();
  } else {
    const above = openSheets.findIndex((sheet) => sheet.id > landed);
    const closing = above === -1 ? [] : openSheets.splice(above).reverse();
    // Still on the page under the sheet. Anywhere else is a real move, and that is the router's job.
    if (closing[0] && closing[0].idx === state?.idx && closing[0].key === state?.key) event.stopImmediatePropagation();
    for (const sheet of closing) sheet.close();
  }
  // Left behind when a sheet's button opened a new page. One back press must not stop on it.
  if (landed && !openSheets.some((sheet) => sheet.id === landed)) {
    stepBack();
  } else if (replacedBy) {
    window.history.replaceState(replacedBy.state, "", replacedBy.url);
    replacedBy = null;
  }
}

// At import, so this listener is ahead of the router's. Browsers run window listeners in the order they were added.
window.addEventListener("popstate", onHistoryPop);

function useBackClosesSheet(onClose: () => void) {
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    const below = window.history.state as SheetHistory;
    lastSheetId = Math.max(Date.now(), lastSheetId + 1);
    const sheet: OpenSheet = { id: lastSheetId, idx: below?.idx, key: below?.key, close: () => latestClose.current() };
    window.history.pushState({ ...below, kwSheet: sheet.id }, "");
    openSheets.push(sheet);

    return () => {
      const index = openSheets.indexOf(sheet);
      if (index === -1) return; // Back already took this sheet's entry away.
      openSheets.splice(index, 1);
      // Wait, so a page change made by the same button is already in history.
      window.setTimeout(() => {
        const now = window.history.state as SheetHistory;
        if (now?.kwSheet === sheet.id) {
          stepBack();
        } else if (now && !now.kwSheet && now.idx === sheet.idx && now.key !== sheet.key) {
          replacedBy = { state: now, url: window.location.href };
          stepBack();
        }
      }, 0);
    };
  }, []);
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useSettings();
  useBackClosesSheet(onClose);
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t("بند کریں", "Band karein", "Close")} className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full max-w-md animate-sheet overflow-y-auto rounded-t-4xl bg-surface p-5 pb-8 shadow-lift">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" aria-hidden />
        <h2 className="mb-3 text-xl">{title}</h2>
        {children}
      </div>
    </div>
  );
}
