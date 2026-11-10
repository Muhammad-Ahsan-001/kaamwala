import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { Invitations } from "./Invitations";
import { OfflineStatus } from "./OfflineStatus";
import { resyncPush } from "./push";
import { startServiceWorker } from "./register";
import "./pwa.css";

export { useSyncEpoch } from "./queue";

/** Everything that sits around the screens: offline banner, sync results, tour, install and push asks. */
export function PwaLayer() {
  const navigate = useNavigate();
  const { user } = useSession();
  const userId = user?.id;

  useEffect(startServiceWorker, []);

  useEffect(() => {
    if (userId) void resyncPush();
  }, [userId]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; url?: string } | null;
      if (message?.type === "kw-navigate" && message.url) navigate(message.url);
      if (message?.type === "kw-push-changed") void resyncPush();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  return (
    <>
      <OfflineStatus />
      <Invitations />
    </>
  );
}
