import { Briefcase, HardHat, LayoutDashboard, Tags, TriangleAlert, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Logo } from "../../ui/Logo";
import { cx } from "../../ui/primitives";

const TABS = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/workers", end: false, icon: HardHat, label: "Workers" },
  { to: "/admin/jobs", end: false, icon: Briefcase, label: "Jobs" },
  { to: "/admin/categories", end: false, icon: Tags, label: "Categories" },
  { to: "/admin/agents", end: false, icon: UserPlus, label: "Field agents" },
  { to: "/admin/disputes", end: false, icon: TriangleAlert, label: "Disputes" },
];

/** The admin area is English and left-to-right, whatever language the app is using. */
export function AdminShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div dir="ltr" lang="en" className="admin-root min-h-dvh bg-page md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-[500] bg-surface md:h-dvh md:border-r md:border-line">
        <div className="flex min-h-14 items-center justify-between px-4 md:min-h-20">
          <Logo size={36} stacked={false} />
          <span className="rounded-full bg-sunken px-3 py-0.5 text-xs font-bold text-soft">Admin</span>
        </div>
        <nav className="scroll-x flex gap-1 overflow-x-auto border-b border-line px-2 md:flex-col md:border-0" aria-label="Admin">
          {TABS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cx("flex min-h-12 shrink-0 items-center gap-3 rounded-2xl px-3 font-semibold transition", isActive ? "bg-brand-100 text-brand-700" : "text-soft hover:bg-sunken")}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-5xl animate-page-in p-4 pb-10 md:p-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {action}
        </div>
        {children}
      </main>
    </div>
  );
}
