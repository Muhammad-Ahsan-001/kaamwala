import type { WsEvent } from "@kaamwala/contracts";
import type { WebSocket } from "@fastify/websocket";

export interface SocketIdentity {
  userId: string | null;
  role: string | null;
  /** When the token behind this socket stops being valid, in milliseconds. */
  expiresAt: number | null;
}

interface Client extends SocketIdentity {
  socket: WebSocket;
  alive: boolean;
}

const OPEN = 1;
const HEARTBEAT_MS = 30_000;
/** Browsers answer pings but never show them to the page, so the page needs a frame it can see. */
const HEARTBEAT_FRAME = JSON.stringify({ type: "heartbeat" });
export const CLOSE_TOKEN_EXPIRED = 4401;
export const CLOSE_SUSPENDED = 4403;

class Hub {
  private clients = new Set<Client>();
  private timer: NodeJS.Timeout | null = null;

  add(socket: WebSocket, identity: SocketIdentity): void {
    // The token check is asynchronous, and the phone may have gone away during it.
    if (socket.readyState !== OPEN) return;
    const client: Client = { socket, ...identity, alive: true };
    this.clients.add(client);
    socket.on("pong", () => (client.alive = true));
    socket.on("close", () => this.clients.delete(client));
    socket.on("error", () => this.clients.delete(client));
  }

  /** Keeps connections alive through the reverse proxy, clears dead phones and ends expired sessions. */
  start(): void {
    this.timer ??= setInterval(() => {
      const now = Date.now();
      for (const client of this.clients) {
        if (client.expiresAt !== null && client.expiresAt <= now) {
          client.socket.close(CLOSE_TOKEN_EXPIRED, "token expired");
          this.clients.delete(client);
          continue;
        }
        if (!client.alive) {
          client.socket.terminate();
          this.clients.delete(client);
          continue;
        }
        client.alive = false;
        client.socket.ping();
        this.send(client, HEARTBEAT_FRAME);
      }
    }, HEARTBEAT_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const client of this.clients) client.socket.close();
    this.clients.clear();
  }

  private send(client: Client, payload: string): void {
    if (client.socket.readyState === OPEN) client.socket.send(payload);
  }

  /** To everyone, signed in or not. Only for data that is already public. */
  broadcast(event: WsEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) this.send(client, payload);
  }

  /** To the named users and any connected admin. */
  toUsers(userIds: Iterable<string>, event: WsEvent): void {
    const ids = new Set(userIds);
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if ((client.userId && ids.has(client.userId)) || client.role === "admin") this.send(client, payload);
    }
  }

  /** To the named users only, for a reduced view of something admins already receive in full. */
  toUsersOnly(userIds: Iterable<string>, event: WsEvent): void {
    const ids = new Set(userIds);
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.userId && ids.has(client.userId)) this.send(client, payload);
    }
  }

  /** Ends every connection this user holds, for example on suspension. */
  disconnectUser(userId: string, code: number, reason: string): void {
    for (const client of this.clients) {
      if (client.userId !== userId) continue;
      client.socket.close(code, reason);
      this.clients.delete(client);
    }
  }
}

export const hub = new Hub();
