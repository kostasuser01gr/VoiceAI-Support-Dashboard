import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "border border-white/10 bg-white text-black hover:bg-white/90 active:bg-white/80 shadow-[0_0_15px_rgba(255,255,255,0.1)]",
  secondary: "border border-white/5 bg-white/5 text-white hover:bg-white/10 active:bg-white/8 shadow-sm",
  ghost: "border border-transparent bg-transparent text-zinc-400 hover:text-white hover:bg-white/5",
  danger: "border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 active:bg-rose-500/30",
};

const buttonSizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs tracking-tight",
  md: "h-10 px-5 text-sm font-medium tracking-tight",
  lg: "h-12 px-6 text-sm font-medium tracking-tight",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ className, children, variant = "secondary", size = "md", type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn("inline-flex items-center justify-center rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-40", buttonVariantClass[variant], buttonSizeClass[size], className)} {...props}>
      {children}
    </button>
  );
}

interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className, children }: CardProps) {
  return <section className={cn("glass-panel rounded-xl p-6", className)}>{children}</section>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-sky-500/50 focus:bg-white/[0.04] transition-all",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 text-sm text-zinc-300 outline-none focus:border-sky-500/50 focus:bg-white/[0.04] transition-all appearance-none cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-sky-500/50 focus:bg-white/[0.04] transition-all resize-none leading-relaxed",
        className
      )}
      {...props}
    />
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
  const badgeClass: Record<BadgeTone, string> = {
    neutral: "border-white/10 bg-white/5 text-zinc-400",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    danger: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    info: "border-sky-500/20 bg-sky-500/10 text-sky-400",
  };
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", badgeClass[tone], className)}>{children}</span>;
}

export function Toast({ tone = "neutral", className, children }: BadgeProps) {
  const toastClass: Record<BadgeTone, string> = {
    neutral: "border-white/10 bg-white/5 text-zinc-400",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    danger: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    info: "border-sky-500/20 bg-sky-500/10 text-sky-400",
  };
  return <div className={cn("rounded-lg border px-4 py-3 text-sm", toastClass[tone], className)}>{children}</div>;
}

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: DropdownOption[];
  className?: string;
}

export function Dropdown({ value, onChange, options, className }: DropdownProps) {
  return (
    <Select value={value} onChange={onChange} className={className}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </Select>
  );
}

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex space-x-2 border-b border-white/10", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2",
            activeTab === tab.id
              ? "border-sky-400 text-sky-400"
              : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-white/20"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface TooltipProps {
  label: string;
  children: ReactNode;
}

export function Tooltip({ label, children }: TooltipProps) {
  return (
    <div className="group relative inline-flex">
      {children}
      <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 z-50 border border-white/10">
        {label}
      </div>
    </div>
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, description, onClose, children }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div role="dialog" className="w-full max-w-2xl glass-panel rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
            {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full w-8 h-8 p-0">✕</Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export { cn };