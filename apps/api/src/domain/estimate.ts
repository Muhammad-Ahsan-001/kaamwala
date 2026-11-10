import { prisma } from "../db";
import { getActiveCategories } from "../jev";

export interface PriceEstimate {
  min: number | null;
  max: number | null;
}

/** An estimate from the rates real workers in this category charge, never below the floor. */
export async function priceEstimate(categoryId: string | null): Promise<PriceEstimate> {
  if (!categoryId) return { min: null, max: null };
  const category = getActiveCategories().find((c) => c.id === categoryId);
  const rows = await prisma.workerProfile.findMany({
    where: { categoryIds: { has: categoryId }, approved: true },
    select: { rate: true },
  });
  const rates = rows.map((r) => r.rate).sort((a, b) => a - b);
  const floor = category?.floorPrice ?? 0;
  if (!rates.length) return { min: floor || null, max: null };
  const at = (q: number) => rates[Math.floor((rates.length - 1) * q)] as number;
  return { min: Math.max(floor, at(0.25)), max: Math.max(floor, at(0.75)) };
}
