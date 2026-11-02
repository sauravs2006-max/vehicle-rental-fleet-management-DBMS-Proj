"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Notice, Select, Source } from "@/components/ui";
import RejectBookingModal from "@/components/RejectBookingModal";
import { dt, inr } from "@/lib/utils";

export default function Bookings() {
  const [role, setRole] = useState<"admin" | "customer" | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState<{ id: number; kind: "review" | "dispute" } | null>(null);
  const [reject, setReject] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => { const r = await fetch("/api/bookings"); if (r.ok) setRows(await r.json()); }, []);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.user?.role ?? null));
    load();
  }, [load]);

  async function submit() {
    if (!open) return;
    const url = open.kind === "review" ? "/api/reviews" : "/api/disputes";
    const body = open.kind === "review" ? { bookingId: open.id, rating, comment: text || undefined } : { bookingId: open.id, reason: text };
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (r.ok) { setOpen(null); setText(""); setMsg({ ok: true, text: d.dbEffect }); load(); }
    else setMsg({ ok: false, text: d.details ? Object.values(d.details).flat().join(", ") : d.error });
  }

  const isAdmin = role === "admin";
  return (
    <div className="space-y-2">
      <div>
        <h1>{isAdmin ? "All bookings" : "My bookings"}</h1>
        <Source>PostgreSQL: bookings, read as role {isAdmin ? "fleet_admin" : "fleet_customer"}{isAdmin ? "" : "; row-level security limits it to your own rows"}</Source>
      </div>
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <div className="divide-y border-t">
        {rows.map((b) => (
          <div key={b.booking_id} className="space-y-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">#{b.booking_id} · {b.vehicle} <span className="text-xs font-normal text-zinc-400">({b.reg_no})</span></div>
                <div className="text-zinc-400">{dt(b.start_ts)} to {dt(b.end_ts)} · {b.branch}</div>
                <div className="text-xs text-zinc-500">{b.customer_name} · Driver: {b.driver_name ?? "self-drive"}{b.returned_ts ? ` · returned ${dt(b.returned_ts)}` : ""}</div>
              </div>
              <div className="text-right"><Badge>{b.status}</Badge><div className="mt-2 font-semibold tabular-nums">{inr(b.total_fare)}</div></div>
            </div>

            {b.status === "Cancelled" && (
              <p className="text-zinc-300">
                Rejected by FleetRent{b.cancel_reason ? `: ${b.cancel_reason}` : ""}. {isAdmin ? "The payment was refunded." : "Your payment has been refunded."}
              </p>
            )}

            {/* Admins manage bookings; only customers review or complain about their own rentals. */}
            {isAdmin && b.status === "Confirmed" && (
              <div><Button variant="outline" destructive onClick={() => setReject(b)}>Reject booking</Button></div>
            )}
            {role === "customer" && b.status === "Completed" && (
              <div className="flex items-center gap-2">
                {!b.reviewed && <Button variant="outline" onClick={() => { setOpen({ id: b.booking_id, kind: "review" }); setText(""); }}>Write review</Button>}
                {b.dispute_status === "Open" ? <Badge>Open</Badge> :
                  <Button variant="outline" onClick={() => { setOpen({ id: b.booking_id, kind: "dispute" }); setText(""); }}>Raise complaint</Button>}
              </div>
            )}
            {role === "customer" && open && open.id === b.booking_id && (
              <div className="space-y-2">
                {open.kind === "review" && <Select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}</Select>}
                <Input value={text} onChange={(e) => setText(e.target.value)}
                  placeholder={open.kind === "review" ? "How was the vehicle? (AC, comfort, noise...)" : "Describe the problem (min 10 characters)"} />
                <div className="flex gap-2"><Button onClick={submit}>Submit</Button><Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button></div>
              </div>
            )}
          </div>
        ))}
        {!rows.length && <p className="py-4 text-zinc-500">No bookings yet.</p>}
      </div>
      <RejectBookingModal booking={reject} onClose={() => setReject(null)}
        onDone={(m) => { setReject(null); setMsg({ ok: true, text: m }); load(); }} />
    </div>
  );
}
