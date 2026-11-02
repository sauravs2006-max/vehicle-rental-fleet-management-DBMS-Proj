import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
export const inr = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return (v < 0 ? "-₹" : "₹") + Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
};
/** Exact rupee amount (keeps the paise), for lines that report what the database stored. */
export const inrExact = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};
export const dt = (s: string | Date | null | undefined) =>
  s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
export const d = (s: string | Date | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";
