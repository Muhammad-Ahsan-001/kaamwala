import webpush from "web-push";
import { prisma } from "./db";
import { env } from "./env";

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

const GONE = new Set([404, 410]);

/** Best effort. A failed push never fails the request that triggered it. */
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushEnabled || userIds.length === 0) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status !== undefined && GONE.has(status)) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
        }
      }
    }),
  );
}
