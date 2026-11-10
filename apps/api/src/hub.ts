import type { WsEvent } from "@kaamwala/contracts";
import type { WebSocket } from "@fastify/websocket";

interface Client {
  socket: WebSocket;
  userId: string | null;
  role: string | null;
  alive: boolean;
}

const OPEN = 1;
const HEARTBEAT_MS = 30_000;

class Hub {
  private clients = new Set<Client>();
  private timer: NodeJS.Timeout | null = null;

  add(socket: WebSocket, userId: string | null, role: string | null): void {
    const client: Client = { socket, userId, role, alive: true };
    this.clients.add(client);
    socket.on("pong", () => (client.alive = true));
    socket.on("close", () => this.clients.delete(client));
    socket.on("error", () => this.clients.delete(client));
  }

  /** Keeps connections alive through the reverse proxy and clears dead phones. */
  start(): void {
    this.timer ??= setInterval(() => {
      for (const client of this.clients) {
        if (!client.alive) {
          client.socket.terminate();
          this.clients.delete(client);
          continue;
        }
        client.alive = false;
        client.socket.ping();
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

  /** To signed-in workers, for jobs still open to offers. */
  toWorkers(event: WsEvent, also: Iterable<string> = []): void {
    const ids = new Set(also);
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      const reached = client.role === "worker" || client.role === "admin" || (client.userId && ids.has(client.userId));
      if (reached) this.send(client, payload);
    }
  }
}

export const hub = new Hub();
