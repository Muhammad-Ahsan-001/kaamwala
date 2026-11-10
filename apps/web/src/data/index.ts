import { withOffline } from "../pwa/offline-api";
import type { DataApi } from "./api";
import { liveApi } from "./live";

export * from "./types";
export type { DataApi };

export const data: DataApi = withOffline(liveApi);
