/** Tries a list of options in turn inside one deadline, cancelling whichever attempt runs out of time. */

export interface Budget {
  /** The whole chain must finish inside this. */
  totalMs: number;
  /** The first choice gets this much when others are waiting behind it. */
  firstMs: number;
  /** An attempt with less time than this cannot succeed, so it is not started. */
  minAttemptMs: number;
}

export class BudgetExhausted extends Error {}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
  });
}

export async function firstSuccess<T>(
  options: string[],
  attempt: (option: string, signal: AbortSignal) => Promise<T>,
  budget: Budget,
  onFailure: (option: string, err: unknown) => void = () => undefined,
): Promise<T> {
  const deadline = Date.now() + budget.totalMs;
  for (const [i, option] of options.entries()) {
    const left = deadline - Date.now();
    if (left < budget.minAttemptMs) break;
    const waiting = options.length - i;
    const share = i === 0 && waiting > 1 ? Math.min(budget.firstMs, left) : Math.floor(left / waiting);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), share);
    try {
      // The race settles this attempt on time even if the caller's work ignores the signal.
      return await Promise.race([attempt(option, controller.signal), rejectOnAbort(controller.signal)]);
    } catch (err) {
      onFailure(option, err);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new BudgetExhausted("No option succeeded inside the budget.");
}
