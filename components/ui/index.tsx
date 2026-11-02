// Small UI building blocks (same cn() + variant style as shadcn/ui, so they can be swapped for the real ones later).
import * as React from "react";
import { cn } from "@/lib/utils";

/** Two styles: solid (default) and outline. `destructive` only swaps the colour to the red accent. */
export function Button({ className, variant = "default", destructive = false, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline"; destructive?: boolean }) {
  const v = variant === "default"
    ? (destructive ? "bg-red-600 text-white hover:bg-red-500" : "bg-zinc-100 text-zinc-900 hover:bg-zinc-300")
    : cn("border hover:bg-zinc-800", destructive ? "border-red-900 text-red-400" : "border-zinc-700 text-zinc-200");
  return <button className={cn("inline-flex h-8 items-center justify-center whitespace-nowrap rounded px-2 font-medium disabled:opacity-50", v, className)} {...p} />;
}
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
  <div className={cn("rounded border border-zinc-800 p-4", className)} {...p} />;

/** A heading, the one-line database source, and the content. Sections are split by a divider, not a box. */
export function Section({ title, source, action, children }: { title: string; source: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2>{title}</h2><Source>{source}</Source></div>
        {action}
      </div>
      {children}
    </section>
  );
}
/** The small grey line that says which database a section reads from. */
export const Source = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-zinc-400">{children}</p>;

const field = "h-8 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, r) =>
  <input ref={r} className={cn(field, className)} {...p} />);
Input.displayName = "Input";
export const Select = ({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, className)} {...p} />;
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(field, "h-auto py-2", className)} {...p} />;
export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
  <label className={cn("mb-2 block text-xs font-medium text-zinc-400", className)} {...p} />;

export const Badge = ({ children }: { children: string }) =>
  <span className="whitespace-nowrap rounded border border-zinc-700 px-2 text-xs text-zinc-300">{children.replace(/_/g, " ")}</span>;

/** Success / error message line. */
export function Notice({ kind = "ok", className, children, ...p }: React.HTMLAttributes<HTMLParagraphElement> & { kind?: "ok" | "error" }) {
  return (
    <p className={cn("rounded border border-zinc-700 bg-zinc-950 p-2 text-zinc-200", className)} {...p}>
      {kind === "error" && <span className="font-semibold">Error: </span>}{children}
    </p>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded border border-zinc-700 bg-zinc-950 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2>{title}</h2>
          <button onClick={onClose} className="text-base leading-none text-zinc-400 hover:text-zinc-100" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
