// Small UI building blocks (same cn() + variant style as shadcn/ui, so they can be swapped for the real ones later).
import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "default", size = "md", ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "danger" | "ghost"; size?: "sm" | "md" }) {
  const v = {
    default: "bg-zinc-100 text-zinc-900 hover:bg-white",
    outline: "border border-zinc-700 text-zinc-200 hover:bg-zinc-800",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "text-zinc-300 hover:bg-zinc-800",
  }[variant];
  return <button className={cn("inline-flex items-center justify-center rounded-md font-medium transition disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm", v, className)} {...p} />;
}
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
  <div className={cn("rounded-xl border border-zinc-800 bg-zinc-900 p-4", className)} {...p} />;

const field = "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, r) =>
  <input ref={r} className={cn(field, className)} {...p} />);
Input.displayName = "Input";
export const Select = ({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, className)} {...p} />;
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(field, className)} {...p} />;
export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
  <label className={cn("mb-1 block text-xs font-medium text-zinc-400", className)} {...p} />;

const tone: Record<string, string> = {
  Available: "bg-emerald-900/40 text-emerald-300", Rented: "bg-teal-900/40 text-teal-300",
  Maintenance_Required: "bg-amber-900/40 text-amber-300", Under_Maintenance: "bg-orange-900/40 text-orange-300",
  Out_of_Service: "bg-red-900/40 text-red-300", Confirmed: "bg-zinc-700/60 text-zinc-200", Active: "bg-teal-900/40 text-teal-300",
  Completed: "bg-emerald-900/40 text-emerald-300", Cancelled: "bg-zinc-800 text-zinc-400", Open: "bg-red-900/40 text-red-300",
  Resolved: "bg-emerald-900/40 text-emerald-300", Rejected: "bg-zinc-800 text-zinc-400",
  Low: "bg-emerald-900/40 text-emerald-300", Medium: "bg-amber-900/40 text-amber-300", High: "bg-orange-900/40 text-orange-300", Critical: "bg-red-900/40 text-red-300",
};
export const Badge = ({ children }: { children: string }) =>
  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone[children] ?? "bg-zinc-800 text-zinc-300")}>{children.replace(/_/g, " ")}</span>;

/** Success / error / info message box. */
export function Notice({ kind = "info", className, ...p }: React.HTMLAttributes<HTMLParagraphElement> & { kind?: "ok" | "error" | "info" }) {
  const c = { ok: "border-emerald-900 bg-emerald-950/60 text-emerald-300", error: "border-red-900 bg-red-950/60 text-red-300",
    info: "border-zinc-800 bg-zinc-900 text-zinc-300" }[kind];
  return <p className={cn("rounded-md border p-2.5 text-sm", c, className)} {...p} />;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-zinc-800">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium transition",
            value === t.id ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200")}>{t.label}</button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-zinc-400 hover:text-zinc-100" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
