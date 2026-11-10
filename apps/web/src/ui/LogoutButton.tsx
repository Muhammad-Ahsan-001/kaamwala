import { LogOut } from "lucide-react";
import { useLogout } from "../lib/session";
import { useSettings } from "../lib/settings";
import { IconButton } from "./primitives";

/** One tap ends this account, so another person can sign in on the same phone. */
export function LogoutButton({ labeled }: { labeled?: boolean }) {
  const { t } = useSettings();
  const logout = useLogout();
  const label = t("لاگ آؤٹ", "Log out", "Log out");
  if (!labeled) return <IconButton icon={LogOut} label={label} onClick={logout} />;
  return (
    <button type="button" onClick={logout} className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-busy-50 px-3 text-sm font-bold text-busy-700 transition active:scale-95">
      <LogOut className="h-5 w-5 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
