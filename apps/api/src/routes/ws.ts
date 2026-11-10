import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyToken } from "../auth";
import { hub } from "../hub";

export async function wsRoutes(app: FastifyInstance) {
  /** A missing or invalid token still connects, and then receives public events only. */
  app.get("/ws", { websocket: true }, (socket, req) => {
    const { token } = z.object({ token: z.string().optional() }).parse(req.query);
    // Register synchronously so no event is missed while the token is being checked.
    if (!token) {
      hub.add(socket, null, null);
      return;
    }
    void verifyToken(token).then((claims) => hub.add(socket, claims?.sub ?? null, claims?.role ?? null));
  });
}
