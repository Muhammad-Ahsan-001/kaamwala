import { Jev, type JevCategory } from "@kaamwala/jev";
import type { Category as DbCategory } from "@prisma/client";
import { prisma } from "./db";

export const jev = new Jev();

/** The category list as of the last reload. Prompts and matching both read this. */
let activeCategories: DbCategory[] = [];

export function getActiveCategories(): DbCategory[] {
  return activeCategories;
}

const toJev = (c: DbCategory): JevCategory => ({
  id: c.id,
  nameUr: c.nameUr,
  nameRoman: c.nameRoman,
  nameEn: c.nameEn,
  keywords: c.keywords,
  skills: c.skills,
  skillAliases: (c.skillAliases ?? {}) as Record<string, string[]>,
  active: c.active,
});

/** Run at startup and after every category write, so no change needs a redeploy. */
export async function reloadCategories(): Promise<void> {
  const rows = await prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  activeCategories = rows;
  jev.load(rows.map(toJev));
}
