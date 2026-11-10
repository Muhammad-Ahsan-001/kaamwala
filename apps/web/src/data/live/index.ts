import type { DataApi } from "../api";
import { adminApi } from "./admin";
import { aiApi } from "./ai";
import { authApi } from "./auth";
import { categoriesApi } from "./categories";
import { crewsApi } from "./crews";
import { customersApi } from "./customers";
import { jobsApi } from "./jobs";
import { miscApi } from "./misc";
import { realtime } from "./realtime";
import { workersApi } from "./workers";

export const liveApi: DataApi = {
  connection: realtime.connection,
  onConnection: realtime.onConnection,
  onEvent: realtime.onEvent,
  ...authApi,
  ...miscApi,
  ...categoriesApi,
  ...workersApi,
  ...customersApi,
  ...crewsApi,
  ...jobsApi,
  ...aiApi,
  ...adminApi,
};

// Public events (worker status, category changes) flow even before anyone signs in.
realtime.start();
