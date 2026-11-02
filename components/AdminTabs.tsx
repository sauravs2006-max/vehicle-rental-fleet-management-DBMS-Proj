"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" }, { id: "bookings", label: "Bookings" }, { id: "fleet", label: "Fleet" },
  { id: "inspections", label: "Inspections" }, { id: "analytics", label: "Analytics" },
] as const;
export type AdminTab = (typeof TABS)[number]["id"];

/** The open tab is kept in the URL (?tab=fleet), so a reload or the back button stays on it. */
export function useAdminTab(): AdminTab {
  const t = useSearchParams().get("tab");
  return TABS.find((x) => x.id === t)?.id ?? "overview";
}

export function AdminTabs() {
  const onDashboard = usePathname() === "/admin";
  const router = useRouter();
  const current = useAdminTab();
  function open(id: AdminTab) {
    const url = id === "overview" ? "/admin" : `/admin?tab=${id}`;
    // pushState on the dashboard: a router navigation would remount the page and refetch everything.
    if (onDashboard) window.history.pushState(null, "", url); else router.push(url);
  }
  return (
    <div className="flex flex-wrap gap-2 self-stretch">
      {TABS.map((t) => (
        <button key={t.id} onClick={() => open(t.id)}
          className={cn("-mb-px h-12 border-b-2 px-2 font-medium",
            onDashboard && current === t.id ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200")}>{t.label}</button>
      ))}
    </div>
  );
}
