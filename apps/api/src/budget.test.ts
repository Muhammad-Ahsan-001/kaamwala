import { describe, expect, it } from "vitest";
import { BudgetExhausted, firstSuccess } from "./budget";

const budget = { totalMs: 300, firstMs: 150, minAttemptMs: 10 };

/** Never answers, and records whether it was told to stop. */
function hang(aborted: string[], name: string, signal: AbortSignal): Promise<never> {
  signal.addEventListener("abort", () => aborted.push(name));
  return new Promise<never>(() => undefined);
}

describe("firstSuccess", () => {
  it("returns the first answer without trying the rest", async () => {
    const tried: string[] = [];
    const result = await firstSuccess(["a", "b"], async (option) => {
      tried.push(option);
      return option;
    }, budget);
    expect(result).toBe("a");
    expect(tried).toEqual(["a"]);
  });

  it("falls through a failure to the next option", async () => {
    const failures: string[] = [];
    const result = await firstSuccess(
      ["a", "b"],
      async (option) => {
        if (option === "a") throw new Error("overloaded");
        return option;
      },
      budget,
      (option) => failures.push(option),
    );
    expect(result).toBe("b");
    expect(failures).toEqual(["a"]);
  });

  it("stops every stalled attempt inside one overall deadline", async () => {
    const aborted: string[] = [];
    const started = Date.now();
    await expect(firstSuccess(["a", "b", "c"], (o, signal) => hang(aborted, o, signal), budget)).rejects.toBeInstanceOf(
      BudgetExhausted,
    );
    expect(Date.now() - started).toBeLessThan(budget.totalMs + 120);
    expect(aborted).toEqual(["a", "b", "c"]);
  });

  it("gives the first option only its share while others wait", async () => {
    const aborted: string[] = [];
    const started = Date.now();
    let firstEnded = 0;
    await firstSuccess(
      ["a", "b"],
      (option, signal) => {
        if (option === "a") {
          signal.addEventListener("abort", () => (firstEnded = Date.now() - started));
          return hang(aborted, option, signal);
        }
        return Promise.resolve(option);
      },
      budget,
    );
    expect(firstEnded).toBeGreaterThanOrEqual(budget.firstMs - 15);
    expect(firstEnded).toBeLessThan(budget.totalMs);
  });

  it("gives a lone option the whole budget", async () => {
    const aborted: string[] = [];
    const started = Date.now();
    await expect(firstSuccess(["only"], (o, signal) => hang(aborted, o, signal), budget)).rejects.toBeInstanceOf(BudgetExhausted);
    expect(Date.now() - started).toBeGreaterThanOrEqual(budget.totalMs - 15);
  });

  it("does not start an attempt with no time left", async () => {
    const tried: string[] = [];
    await expect(
      firstSuccess(
        ["a", "b"],
        async (option) => {
          tried.push(option);
          await new Promise((r) => setTimeout(r, 60));
          throw new Error("failed");
        },
        { totalMs: 50, firstMs: 200, minAttemptMs: 10 },
      ),
    ).rejects.toBeInstanceOf(BudgetExhausted);
    expect(tried).toEqual(["a"]);
  });
});
