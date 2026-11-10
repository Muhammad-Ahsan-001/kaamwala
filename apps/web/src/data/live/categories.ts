import type { DataApi } from "../api";
import type { Category, TradeMatch } from "../types";
import { request } from "./http";
import { realtime } from "./realtime";

export const categoriesApi: Pick<DataApi, "listCategories" | "saveCategory" | "reorderCategories" | "onCategoriesChanged" | "matchTrade"> = {
  listCategories: async (options) => (await request<{ items: Category[] }>("GET", options?.all ? "/categories?all=1" : "/categories")).items,

  saveCategory: (input, id) => (id ? request<Category>("PATCH", `/admin/categories/${id}`, { body: input }) : request<Category>("POST", "/admin/categories", { body: input })),

  reorderCategories: async (ids) => {
    await request("POST", "/admin/categories/reorder", { body: { ids } });
  },

  onCategoriesChanged: (listener) =>
    realtime.onEvent((event) => {
      if (event.type === "categories.changed") listener();
    }),

  matchTrade: async (text) => (await request<TradeMatch>("GET", `/categories/match?q=${encodeURIComponent(text.slice(0, 300))}`)).category,
};
