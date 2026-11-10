import type { WebSocket } from "@fastify/websocket";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOSE_SUSPENDED, CLOSE_TOKEN_EXPIRED, hub } from "./hub";

function fakeSocket(readyState = 1) {
  const socket = { readyState, sent: [] as string[], closed: [] as number[] };
  return Object.assign(socket, {
    on: () => undefined,
    ping: () => undefined,
    terminate: () => undefined,
    send: (payload: string) => socket.sent.push(payload),
    close: (code: number) => {
      socket.closed.push(code);
      socket.readyState = 3;
    },
  });
}

const asWs = (s: ReturnType<typeof fakeSocket>) => s as unknown as WebSocket;
const event = { type: "categories.changed" } as const;
const signedIn = (userId: string, role = "worker", expiresAt: number | null = null) => ({ userId, role, expiresAt });

afterEach(() => {
  hub.stop();
  vi.useRealTimers();
});

describe("hub", () => {
  it("reaches admins with toUsers but not with toUsersOnly", () => {
    const admin = fakeSocket();
    const worker = fakeSocket();
    hub.add(asWs(admin), signedIn("a", "admin"));
    hub.add(asWs(worker), signedIn("w"));
    hub.toUsers(["w"], event);
    expect(admin.sent).toHaveLength(1);
    expect(worker.sent).toHaveLength(1);
    hub.toUsersOnly(["w"], event);
    expect(admin.sent).toHaveLength(1);
    expect(worker.sent).toHaveLength(2);
  });

  it("gives an anonymous socket public events only", () => {
    const anon = fakeSocket();
    hub.add(asWs(anon), { userId: null, role: null, expiresAt: null });
    hub.toUsers(["w"], event);
    hub.toUsersOnly(["w"], event);
    expect(anon.sent).toHaveLength(0);
    hub.broadcast(event);
    expect(anon.sent).toHaveLength(1);
  });

  it("closes every connection of a suspended user and no others", () => {
    const phone = fakeSocket();
    const tablet = fakeSocket();
    const other = fakeSocket();
    hub.add(asWs(phone), signedIn("w"));
    hub.add(asWs(tablet), signedIn("w"));
    hub.add(asWs(other), signedIn("x"));
    hub.disconnectUser("w", CLOSE_SUSPENDED, "suspended");
    expect(phone.closed).toEqual([CLOSE_SUSPENDED]);
    expect(tablet.closed).toEqual([CLOSE_SUSPENDED]);
    expect(other.closed).toEqual([]);
  });

  it("closes a socket once its token has expired", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const expiring = fakeSocket();
    const lasting = fakeSocket();
    hub.add(asWs(expiring), signedIn("w", "worker", now + 10_000));
    hub.add(asWs(lasting), signedIn("x", "worker", now + 10 * 60_000));
    hub.start();
    vi.advanceTimersByTime(30_000);
    expect(expiring.closed).toEqual([CLOSE_TOKEN_EXPIRED]);
    expect(lasting.closed).toEqual([]);
  });

  it("ignores a socket that closed while its token was being checked", () => {
    const gone = fakeSocket(3);
    hub.add(asWs(gone), signedIn("w"));
    hub.toUsers(["w"], event);
    expect(gone.sent).toHaveLength(0);
  });
});
