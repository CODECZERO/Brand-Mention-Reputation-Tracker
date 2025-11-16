import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-emerald-500",
  neutral: "text-slate-500",
  negative: "text-rose-500",
};

export function formatDate(date: string | number | Date) {
  const value = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return value.toLocaleString();
}
