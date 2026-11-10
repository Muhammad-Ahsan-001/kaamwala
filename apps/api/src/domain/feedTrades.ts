import { z } from "zod";

/** PATCH /workers/me. Whether each id is an active trade is checked against the live category list. */
export const FeedCategoryIds = z.array(z.string().trim().min(1).max(100)).min(1).max(200);

interface WorkerTrades {
  categoryIds: string[];
  feedCategoryIds: string[];
}

/** The one rule for the trades a worker wants to see: what they chose, otherwise their own. */
export const feedTrades = (worker: WorkerTrades): string[] =>
  worker.feedCategoryIds.length > 0 ? worker.feedCategoryIds : worker.categoryIds;

/** What they chose to see, plus their own trades even if they left those out of the feed. */
export const mayBidOnTrade = (worker: WorkerTrades, categoryId: string): boolean =>
  feedTrades(worker).includes(categoryId) || worker.categoryIds.includes(categoryId);
