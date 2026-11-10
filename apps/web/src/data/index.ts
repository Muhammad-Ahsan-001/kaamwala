import type { DataApi } from "./api";
import { mockApi } from "./mock";

export * from "./types";
export type { DataApi };

/** The one place to swap the mock for the real API client. */
export const data: DataApi = mockApi;
