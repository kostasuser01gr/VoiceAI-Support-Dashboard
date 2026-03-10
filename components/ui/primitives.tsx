import type { ReactNode } from "react";

type ClassValue = string | false | null | undefined;

function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary:
    "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100",
  ghost:
    "border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  danger:
    "border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 active:bg-rose-200",
};

const buttonSizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function Button({
  className,
  children,
  variant = "secondary",
  size = "md",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariantClass[variant],
        buttonSizeClass[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900",
        "placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const badgeClass: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  success: "border-emerald-200 bg-emerald-100 text-emerald-800",
  warning: "border-amber-200 bg-amber-100 text-amber-800",
  danger: "border-rose-200 bg-rose-100 text-rose-800",
  info: "border-cyan-200 bg-cyan-100 text-cyan-800",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        badgeClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Tabs({
  value,
  onChange,
  tabs,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  tabs: Array<{ value: string; label: string; count?: number }>;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap gap-2", className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold transition-colors",
              active
                ? "border-cyan-300 bg-cyan-50 text-cyan-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1",
            )}
          >
            <span>{tab.label}</span>
            {typeof tab.count === "number" && <span>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toast({
  tone = "info",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-300 bg-rose-50 text-rose-800"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : tone === "success"
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : tone === "info"
            ? "border-cyan-300 bg-cyan-50 text-cyan-800"
            : "border-slate-300 bg-slate-50 text-slate-700";

  return (
    <div className={cn("rounded-xl border px-3 py-2 text-sm", toneClass, className)}>
      {children}
    </div>
  );
}

export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex cursor-help items-center", className)}
    >
      {children}
    </span>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-sm text-slate-600">{description}</p>}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Dropdown({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export { cn };
