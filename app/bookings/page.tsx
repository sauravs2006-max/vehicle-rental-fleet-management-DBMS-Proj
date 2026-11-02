"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Notice, Select } from "@/components/ui";
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
    if (r.ok) { setOpen(null); setText(""); setMsg({ ok: true, text: open.kind === "review" ? "Thanks for your review." : "Complaint submitted. Our team will look into it." }); load(); }
    else setMsg({ ok: false, text: d.details ? Object.values(d.details).flat().join(", ") : d.error });
  }

  const isAdmin = role === "admin";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isAdmin ? "All bookings" : "My bookings"}</h1>
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <div className="space-y-3">
        {rows.map((b) => (
          <Card key={b.booking_id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">#{b.booking_id} · {b.vehicle} <span className="text-xs font-normal text-zinc-400">({b.reg_no})</span></div>
                <div className="text-sm text-zinc-400">{dt(b.start_ts)} → {dt(b.end_ts)} · {b.branch}</div>
                <div className="text-xs text-zinc-500">{b.customer_name} · Driver: {b.driver_name ?? "self-drive"}{b.returned_ts ? ` · returned ${dt(b.returned_ts)}` : ""}</div>
              </div>
              <div className="text-right"><Badge>{b.status}</Badge><div className="mt-1 font-semibold">{inr(b.total_fare)}</div></div>
            </div>

            {b.status === "Cancelled" && (
              <p className="mt-2 rounded-md bg-zinc-800 p-2 text-sm text-zinc-300">
                Rejected by FleetRent{b.cancel_reason ? `: ${b.cancel_reason}` : ""}. {isAdmin ? "The payment was refunded." : "Your payment has been refunded."}
              </p>
            )}

            {/* Admins manage bookings; only customers review or complain about their own rentals. */}
            {isAdmin && b.status === "Confirmed" && (
              <div className="mt-2"><Button size="sm" variant="outline" onClick={() => setReject(b)}>Reject booking</Button></div>
            )}
            {role === "customer" && b.status === "Completed" && (
              <div className="mt-2 flex gap-2">
                {!b.reviewed && <Button size="sm" variant="outline" onClick={() => { setOpen({ id: b.booking_id, kind: "review" }); setText(""); }}>Write review</Button>}
                {b.dispute_status === "Open" ? <Badge>Open</Badge> :
                  <Button size="sm" variant="ghost" onClick={() => { setOpen({ id: b.booking_id, kind: "dispute" }); setText(""); }}>Raise complaint</Button>}
              </div>
            )}
            {role === "customer" && open && open.id === b.booking_id && (
              <div className="mt-3 space-y-2 rounded-md bg-zinc-800/60 p-3">
                {open.kind === "review" && <Select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</Select>}
                <Input value={text} onChange={(e) => setText(e.target.value)}
                  placeholder={open.kind === "review" ? "How was the vehicle? (AC, comfort, noise...)" : "Describe the problem (min 10 characters)"} />
                <div className="flex gap-2"><Button size="sm" onClick={submit}>Submit</Button><Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button></div>
              </div>
            )}
          </Card>
        ))}
        {!rows.length && <p className="text-sm text-zinc-500">No bookings yet.</p>}
      </div>
      <RejectBookingModal booking={reject} onClose={() => setReject(null)}
        onDone={(m) => { setReject(null); setMsg({ ok: true, text: m }); load(); }} />
    </div>
  );
}
