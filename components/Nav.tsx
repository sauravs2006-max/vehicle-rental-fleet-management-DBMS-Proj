import { Suspense } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { AdminTabs } from "./AdminTabs";
import LogoutButton from "./LogoutButton";

export default async function Nav() {
  const s = await getSession();
  const link = "text-zinc-300 hover:text-white";
  const isAdmin = s?.role === "admin";
  return (
    <header className="border-b border-zinc-800">
      <div className="mx-auto flex min-h-12 max-w-6xl flex-wrap items-center gap-x-4 px-4">
        <Link href="/" className="font-semibold text-zinc-100">🚗 FleetRent</Link>
        {isAdmin && <Suspense fallback={null}><AdminTabs /></Suspense>}
        {s && (
          <nav className="ml-auto flex flex-wrap items-center gap-4 py-2">
            <Link href="/vehicles" className={link}>Vehicles</Link>
            <Link href="/bookings" className={link}>{isAdmin ? "All bookings" : "My bookings"}</Link>
            <span className="text-zinc-400">{s.name} · {s.role}</span>
            <LogoutButton />
          </nav>
        )}
      </div>
    </header>
  );
}
