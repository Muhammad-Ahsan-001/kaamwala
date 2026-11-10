import { LogOut } from "lucide-react";
import { useLogout } from "../lib/session";
import { useSettings } from "../lib/settings";
import { IconButton } from "./primitives";

/** One tap ends this account, so another person can sign in on the same phone. */
export function LogoutButton() {
  const { t } = useSettings();
  const logout = useLogout();
  return <IconButton icon={LogOut} label={t("لاگ آؤٹ", "Log out", "Log out")} onClick={logout} />;
}
