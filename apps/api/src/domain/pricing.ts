export type PriceDirection = "up" | "down";

/** Moves a price by exactly one step. Returns null when the move would go below the floor. */
export function movePrice(current: number, direction: PriceDirection, step: number, floor: number): number | null {
  const next = direction === "up" ? current + step : current - step;
  return next < floor ? null : next;
}

/** The two shares always add up to the fee. */
export function splitAgentFee(fee: number, percent: number): { agentShare: number; platformShare: number } {
  const agentShare = Math.round((fee * percent) / 100);
  return { agentShare, platformShare: fee - agentShare };
}

/** Splits one price across a crew. Any remainder goes to the first share, the crew leader. */
export function splitEarnings(total: number, members: number): number[] {
  const share = Math.floor(total / members);
  const shares = new Array<number>(members).fill(share);
  shares[0] = share + (total - share * members);
  return shares;
}
