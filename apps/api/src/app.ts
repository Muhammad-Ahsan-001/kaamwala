import { mkdirSync } from "node:fs";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { prisma } from "./db";
import { allowedOrigins, env } from "./env";
import { AppError } from "./errors";
import { geminiConfigured } from "./gemini";
import { pushEnabled } from "./push";
import { adminRoutes } from "./routes/admin";
import { aiRoutes } from "./routes/ai";
import { authRoutes } from "./routes/auth";
import { categoryRoutes } from "./routes/categories";
import { crewRoutes } from "./routes/crews";
import { customerRoutes } from "./routes/customers";
import { jobRoutes } from "./routes/jobs";
import { mediaRoutes } from "./routes/media";
import { pushRoutes } from "./routes/push";
import { settingsRoutes } from "./routes/settings";
import { workerRoutes } from "./routes/workers";
import { wsRoutes } from "./routes/ws";
import { isAudioPath } from "./media";
import { uploadRoot } from "./uploads";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_FORM_FIELD_BYTES = 16 * 1024;

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 1024 * 1024,
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      serializers: {
        // The WebSocket token travels in the query string, so query strings are never logged.
        req: (r: { method: string; url: string }) => ({ method: r.method, url: r.url.split("?")[0] }),
      },
    },
  });

  app.decorateRequest("auth", null);

  // Clients often send the JSON content type on POSTs that have no body.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (body === "") return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new AppError(400, "INVALID_JSON", "The request body is not valid JSON."), undefined);
    }
  });

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 6, fields: 20, fieldSize: MAX_FORM_FIELD_BYTES } });
  await app.register(websocket);

  mkdirSync(uploadRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadRoot,
    prefix: "/uploads/",
    // Without this the plugin's own max-age=0 header replaces the one set below.
    cacheControl: false,
    // Voice notes share the folder but are private. They are served only through signed links.
    // This check also runs for reply.sendFile, which is how the signed route sends them.
    allowedPath: (pathName, _root, request) => !isAudioPath(pathName) || request.url.startsWith("/v1/media/audio/"),
    setHeaders: (res, filePath) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", isAudioPath(filePath) ? "private, no-store" : "public, max-age=604800, immutable");
    },
  });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      const message = err.issues[0]?.message ?? "Invalid request.";
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message } });
    }
    const status = (err as FastifyError).statusCode;
    if (typeof status === "number" && status < 500) {
      const raw = (err as FastifyError).code;
      if (raw === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({ error: { code: "FILE_TOO_LARGE", message: "This file is too large. Please choose one under 12 MB." } });
      }
      const code = status === 429 ? "RATE_LIMITED" : (raw ?? "REQUEST_ERROR");
      return reply.code(status).send({ error: { code, message: err.message } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "This route does not exist." } }),
  );

  app.get("/healthz", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, gemini: geminiConfigured, push: pushEnabled };
  });

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(categoryRoutes);
      await v1.register(aiRoutes);
      await v1.register(workerRoutes);
      await v1.register(customerRoutes);
      await v1.register(crewRoutes);
      await v1.register(jobRoutes);
      await v1.register(mediaRoutes);
      await v1.register(pushRoutes);
      await v1.register(settingsRoutes);
      await v1.register(adminRoutes);
      await v1.register(wsRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}
