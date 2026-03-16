import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "bg-white text-black hover:bg-zinc-200 active:bg-zinc-300 shadow-sm",
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-hover active:bg-zinc-800",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-surface",
  danger: "border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
};

const buttonSizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[11px] font-semibold uppercase tracking-wider",
  md: "h-10 px-5 text-xs font-semibold uppercase tracking-wider",
  lg: "h-12 px-6 text-sm font-semibold uppercase tracking-wider",
};

export function Button({ className, children, variant = "secondary", size = "md", type = "button", ...props }: React.ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button type={type} className={cn("inline-flex items-center justify-center rounded-md transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30", buttonVariantClass[variant], buttonSizeClass[size], className)} {...props}>
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return <section className={cn("glass-panel rounded-lg p-6", className)}>{children}</section>;
}

export function Input({ className, ...props }: React.ComponentPropsWithoutRef<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-border bg-surface px-4 text-sm text-foreground placeholder:text-zinc-700 outline-none focus:border-border-strong transition-all",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.ComponentPropsWithoutRef<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-10 w-full rounded-md border border-border bg-surface px-4 text-sm text-zinc-300 outline-none focus:border-border-strong transition-all appearance-none cursor-pointer",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

export function Textarea({ className, ...props }: React.ComponentPropsWithoutRef<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-border bg-surface p-4 text-sm text-foreground placeholder:text-zinc-700 outline-none focus:border-border-strong transition-all resize-none leading-relaxed",
        className
      )}
      {...props}
    />
  );
}

const badgeClass: Record<BadgeTone, string> = {
  neutral: "border-border bg-surface text-muted-foreground",
  success: "border-emerald-500/10 bg-emerald-500/5 text-emerald-400",
  warning: "border-amber-500/10 bg-amber-500/5 text-amber-400",
  danger: "border-rose-500/10 bg-rose-500/5 text-rose-400",
  info: "border-sky-500/10 bg-sky-500/5 text-sky-400",
};

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children?: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]", badgeClass[tone], className)}>{children}</span>;
}

export function Dialog({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose: () => void; children?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div role="dialog" className="w-full max-w-xl bg-surface border border-border rounded-lg p-8 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium tracking-tight text-white">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-white transition-colors">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Dropdown({ value, onChange, options, className, ...props }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<"select">, "value" | "onChange">) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={cn(
          "h-10 w-full rounded-md border border-border bg-surface px-4 text-sm text-zinc-300 outline-none focus:border-border-strong transition-all appearance-none cursor-pointer",
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

export function Tabs({ activeTab, onChange, tabs, className }: {
  activeTab: string;
  onChange: (value: string) => void;
  tabs: Array<{ value: string; label: string; count?: number }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all",
            activeTab === tab.value
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] tabular-nums">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("group relative inline-flex", className)}>
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap shadow-lg">
        {label}
      </div>
    </div>
  );
}

const toastToneClass: Record<string, string> = {
  danger: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  info: "border-sky-500/20 bg-sky-500/10 text-sky-400",
  neutral: "border-border bg-surface text-muted-foreground",
};

export function Toast({ tone = "neutral", className, children }: { tone?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", toastToneClass[tone] ?? toastToneClass.neutral, className)}>
      {children}
    </div>
  );
}

export { cn };
