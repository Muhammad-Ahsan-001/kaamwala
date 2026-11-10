import type { DataApi } from "../api";
import { ApiError } from "../errors";
import type { AppSettings, Area, PushPublicKey } from "../types";
import { imageForm, request } from "./http";

export const miscApi: Pick<DataApi, "getPublicSettings" | "getAreas" | "uploadImage" | "getPushKey" | "subscribePush" | "unsubscribePush"> = {
  getPublicSettings: () => request<AppSettings>("GET", "/settings/public"),
  getAreas: async () => (await request<{ items: Area[] }>("GET", "/areas")).items,

  uploadImage: async (photo) => (await request<{ url: string }>("POST", "/uploads/image", { form: imageForm(photo) })).url,

  getPushKey: () => request<PushPublicKey>("GET", "/push/public-key"),

  subscribePush: async (subscription) => {
    const { endpoint, keys } = subscription;
    if (!endpoint || !keys?.p256dh || !keys.auth) throw new ApiError("VALIDATION_ERROR", "The browser gave an incomplete push subscription.");
    await request("POST", "/push/subscribe", { body: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } });
  },

  unsubscribePush: async (endpoint) => {
    await request("POST", "/push/unsubscribe", { body: { endpoint } });
  },
};
