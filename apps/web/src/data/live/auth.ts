import type { DataApi } from "../api";
import { ApiError } from "../errors";
import type { AuthUser, HirerCard, WorkerSelf } from "../types";
import { request } from "./http";
import { sessionStore } from "./session-store";

export type Me = { user: AuthUser; worker: WorkerSelf | null; hirer: HirerCard | null };

let inFlight: Promise<Me> | null = null;

/** GET /me, shared between callers, and it keeps the stored user current. */
export function me(): Promise<Me> {
  if (!sessionStore.token()) return Promise.reject(new ApiError("UNAUTHORIZED", "Sign in first.", 401));
  inFlight ??= request<Me>("GET", "/me")
    .then((result) => {
      sessionStore.setUser(result.user);
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export const authApi: Pick<DataApi, "requestOtp" | "verifyOtp" | "session" | "currentUser" | "onSessionChange" | "signOut"> = {
  requestOtp: (phone) => request<{ devOtp: string }>("POST", "/auth/otp/request", { body: { phone } }),

  verifyOtp: async (phone, otp, role) => {
    try {
      const result = await request<{ token: string; user: AuthUser }>("POST", "/auth/otp/verify", {
        body: { phone, otp, role },
        // A 401 here means a wrong code. Nothing about the session has changed.
        on401: "keep",
      });
      sessionStore.signIn(result.token, result.user);
      return result.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new ApiError("INVALID_OTP", error.message, 401);
      throw error;
    }
  },

  session: async () => (await me()).user,
  currentUser: () => sessionStore.user(),
  onSessionChange: (listener) => sessionStore.subscribe(listener),
  signOut: () => sessionStore.clear(),
};
