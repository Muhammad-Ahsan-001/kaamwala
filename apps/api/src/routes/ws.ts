import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyToken } from "../auth";
import { prisma } from "../db";
import { CLOSE_SUSPENDED, hub, type SocketIdentity } from "../hub";

const ANONYMOUS: SocketIdentity = { userId: null, role: null, expiresAt: null };

/** The database decides who this is; a token only names them. Null means the account is suspended. */
async function identify(token: string): Promise<SocketIdentity | null> {
  const claims = await verifyToken(token);
  if (!claims) return ANONYMOUS;
  const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { role: true, suspended: true } });
  if (!user) return ANONYMOUS;
  if (user.suspended) return null;
  return { userId: claims.sub, role: user.role, expiresAt: claims.exp === null ? null : claims.exp * 1000 };
}

export async function wsRoutes(app: FastifyInstance) {
  /** A missing or invalid token still connects, and then receives public events only. */
  app.get("/ws", { websocket: true }, (socket, req) => {
    const { token } = z.object({ token: z.string().optional() }).parse(req.query);
    // Register synchronously so no event is missed while the token is being checked.
    if (!token) {
      hub.add(socket, ANONYMOUS);
      return;
    }
    identify(token)
      .then((identity) => {
        if (identity) hub.add(socket, identity);
        else socket.close(CLOSE_SUSPENDED, "suspended");
      })
      .catch(() => socket.close(1011, "try again"));
  });
}
