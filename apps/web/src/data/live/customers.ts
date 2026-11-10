import type { DataApi } from "../api";
import type { HirerCard, HirerDetail } from "../types";
import { me } from "./auth";
import { compact, orNull, request } from "./http";

export const customersApi: Pick<DataApi, "createCustomer" | "updateMyCustomer" | "getHirer"> = {
  createCustomer: async (profile) => {
    await request("POST", "/customers", { body: compact(profile) });
    // Refreshes hasHirerProfile, which the route guard reads.
    await me();
  },

  updateMyCustomer: (patch) => request<HirerCard>("PATCH", "/customers/me", { body: compact(patch) }),

  getHirer: (id) => orNull(request<HirerDetail>("GET", `/customers/${encodeURIComponent(id)}`)),
};
