import { z } from "zod";

const flag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v === "true" || v === "1"));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3002),
  HOST: z.string().default("127.0.0.1"),
  PUBLIC_API_URL: z.string().default("http://localhost:3002"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  CNIC_SALT: z.string().min(16),
  GEMINI_API_KEY: z.string().trim().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  /** Tried in order when the main model is overloaded, retired or too slow. */
  GEMINI_FALLBACK_MODELS: z.string().default("gemini-3.5-flash-lite,gemini-3.1-flash-lite"),
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  UPLOAD_DIR: z.string().default("./uploads"),
  AUTO_APPROVE_WORKERS: flag(true),
  OPEN_JOB_RADIUS_KM: z.coerce.number().default(15),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().default(30),
  RATE_LIMIT_AI_PER_MIN: z.coerce.number().default(30),
});

export const env = schema.parse(process.env);
export const allowedOrigins = env.WEB_ORIGIN.split(",").map((o) => o.trim());
