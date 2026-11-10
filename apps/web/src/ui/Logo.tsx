import logoUrl from "../assets/logo.svg";

/** The one place the logo is rendered. To replace it, swap src/assets/logo.svg. */
export function Logo({ size = 40, wordmark = true, stacked = true }: { size?: number; wordmark?: boolean; stacked?: boolean }) {
  return (
    <span dir="ltr" className="inline-flex items-center gap-2">
      <img src={logoUrl} alt={wordmark ? "" : "KaamWala"} width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />
      {wordmark && (
        <span className="flex flex-col">
          <span className="latin text-xl font-extrabold leading-tight tracking-tight">KaamWala</span>
          {stacked && (
            <span className="ur text-xs text-soft" style={{ lineHeight: 1.7 }}>
              کام والا
            </span>
          )}
        </span>
      )}
    </span>
  );
}
