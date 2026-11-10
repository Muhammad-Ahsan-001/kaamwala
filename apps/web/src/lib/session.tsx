import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { data, type AuthUser, type Role } from "../data";
import { ListSkeleton } from "../ui/primitives";
import { LeaveRoute } from "./back";

export type SessionStatus = "loading" | "signed-in" | "signed-out";

type SessionValue = {
  status: SessionStatus;
  /** Null while signed out. Kept across reloads, so it can be set while still offline. */
  user: AuthUser | null;
  /** Where this user belongs: their home screen, or sign-up if unfinished. "/app" when signed out. */
  home: string;
  /** Ask the server again, for example after changing a profile. */
  refresh: () => Promise<AuthUser | null>;
  signOut: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

/** Where a signed-in user belongs. A worker or customer with no profile yet goes to sign-up. */
export function homeFor(user: AuthUser): string {
  switch (user.role) {
    case "admin":
      return "/admin";
    case "agent":
      return "/app/agent/new";
    case "worker":
      return user.workerId ? "/app/worker" : "/app/onboard";
    case "customer":
      return user.hasHirerProfile ? "/app/adda" : "/app/signup/customer";
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(data.onSessionChange, data.currentUser);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    try {
      return await data.session();
    } catch {
      return null;
    }
  }, []);

  // A remembered user is shown at once, then confirmed. A refused token signs them out.
  useEffect(() => {
    void refresh().finally(() => setChecking(false));
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({
      status: user ? "signed-in" : checking ? "loading" : "signed-out",
      user,
      home: user ? homeFor(user) : "/app",
      refresh,
      signOut: data.signOut,
    }),
    [user, checking, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

/** Ends this account and opens the place to sign in with another one. */
export function useLogout() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  return useCallback(() => {
    const next = user?.role === "admin" ? "/admin/login" : "/app";
    signOut();
    navigate(next, { replace: true });
  }, [user, signOut, navigate]);
}

function Waiting() {
  return (
    <div className="mx-auto max-w-md p-4">
      <ListSkeleton />
    </div>
  );
}

/**
 * Layout route for everything behind sign-in.
 * Signed out goes to /app/login and comes back. The wrong role goes to that role's home.
 *  - roles: who may enter. Leave out for anyone signed in.
 *  - profile: "required" sends someone with no profile yet to sign-up, "none" sends someone who has one home.
 */
export function Guard({ roles, profile }: { roles?: Role[]; profile?: "required" | "none" }) {
  const { status, user, home } = useSession();
  const { pathname, search } = useLocation();

  if (status === "loading") return <Waiting />;
  // The admin area has its own door, which also explains things to someone signed in with the wrong account.
  if (roles?.length === 1 && roles[0] === "admin" && user?.role !== "admin") {
    return <LeaveRoute to={`/admin/login?${new URLSearchParams({ next: pathname + search }).toString()}`} />;
  }
  if (!user) {
    const next = new URLSearchParams({ next: pathname + search });
    // Only a route for one kind of person can say which role is signing in here.
    if (roles?.length === 1 && (roles[0] === "worker" || roles[0] === "customer")) next.set("role", roles[0]);
    return <LeaveRoute to={`/app/login?${next.toString()}`} />;
  }
  if (roles && !roles.includes(user.role)) return <LeaveRoute to={home} />;

  const hasProfile = user.role === "worker" ? user.workerId !== null : user.role === "customer" ? user.hasHirerProfile : true;
  if (profile === "required" && !hasProfile) return <LeaveRoute to={home} />;
  if (profile === "none" && hasProfile && (user.role === "worker" || user.role === "customer")) return <LeaveRoute to={home} />;

  return <Outlet />;
}

/** The public entry screens. Someone already signed in goes straight to their home. */
export function SignedOutOnly() {
  const { status, user, home } = useSession();
  if (status === "loading") return <Waiting />;
  if (user) return <LeaveRoute to={home} />;
  return <Outlet />;
}
