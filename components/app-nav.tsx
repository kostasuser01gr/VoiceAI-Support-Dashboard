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
              "rounded-xl border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all",
              active
                ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
                : "border-white/5 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.05] hover:text-white",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
