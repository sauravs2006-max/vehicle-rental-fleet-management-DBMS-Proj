import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export default async function Nav() {
  const s = await getSession();
  const link = "text-zinc-300 hover:text-white";
  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-zinc-100">🚗 FleetRent</Link>
        {s && (
          <nav className="flex items-center gap-5 text-sm">
            {s.role === "admin" ? <Link href="/admin" className={link}>Fleet dashboard</Link> : null}
            <Link href="/vehicles" className={link}>Vehicles</Link>
            <Link href="/bookings" className={link}>{s.role === "admin" ? "All bookings" : "My bookings"}</Link>
            <span className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300">{s.name} · {s.role}</span>
            <LogoutButton />
          </nav>
        )}
      </div>
    </header>
  );
}
