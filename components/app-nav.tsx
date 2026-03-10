import Link from "next/link";

import { cn } from "@/components/ui/primitives";

type NavKey =
  | "dashboard"
  | "actions"
  | "history"
  | "integrations"
  | "settings"
  | "status";

const navItems: Array<{ key: NavKey; href: string; label: string }> = [
  { key: "dashboard", href: "/", label: "Dashboard" },
  { key: "actions", href: "/actions", label: "Actions" },
  { key: "history", href: "/history", label: "History" },
  { key: "integrations", href: "/integrations", label: "Integrations" },
  { key: "settings", href: "/settings", label: "Settings" },
  { key: "status", href: "/status", label: "Status" },
];

export function AppNav({
  current,
  className,
}: {
  current?: NavKey;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-wrap items-center gap-2", className)} aria-label="Primary">
      {navItems.map((item) => {
        const active = item.key === current;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors",
              active
                ? "border-cyan-300 bg-cyan-50 text-cyan-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
