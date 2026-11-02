"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Modal, Notice, Select, Source } from "@/components/ui";
import { inr } from "@/lib/utils";

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const iso = (v: string) => new Date(v).toISOString();
const tomorrow = () => { const d = new Date(Date.now() + 86400000); d.setHours(10, 0, 0, 0); return d; };

export default function Catalog() {
  const [branches, setBranches] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [f, setF] = useState({ branchId: "", category: "", fuel: "", seats: "", maxRate: "",
    start: localInput(tomorrow()), end: localInput(new Date(tomorrow().getTime() + 2 * 86400000)) });
  const [sel, setSel] = useState<any>(null);
  const [km, setKm] = useState(100);
  const [pay, setPay] = useState("UPI");
  const [quote, setQuote] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/branches").then((r) => r.json()).then(setBranches); }, []);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && k !== "start" && k !== "end") p.set(k, v);
    if (f.start && f.end && new Date(f.end) > new Date(f.start)) { p.set("start", iso(f.start)); p.set("end", iso(f.end)); }
    const r = await fetch("/api/vehicles?" + p); if (r.ok) setVehicles(await r.json());
  }, [f]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!sel) return;
    setQuote(null);
    if (!(new Date(f.end) > new Date(f.start))) return;
    const p = new URLSearchParams({ vehicleId: sel.vehicle_id, start: iso(f.start), end: iso(f.end), km: String(km) });
    fetch("/api/quote?" + p).then((r) => r.json()).then((q) => setQuote(q.error ? null : q));
  }, [sel, f.start, f.end, km]);

  async function book() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: sel.vehicle_id, start: iso(f.start), end: iso(f.end), estDistanceKm: km, paymentMethod: pay }) });
    const d = await r.json(); setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: d.dbEffect }); setSel(null); load(); }
    else setMsg({ ok: false, text: d.details ? JSON.stringify(d.details) : d.error });
  }

  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <div>
        <h1>Find a vehicle</h1>
        <Source>PostgreSQL: vehicles joined to branches and reviews; NOT EXISTS on bookings checks the dates</Source>
      </div>
      <div className="grid grid-cols-2 gap-4 border-b pb-4 md:grid-cols-4">
        <div><Label>Pick-up</Label><Input type="datetime-local" value={f.start} onChange={set("start")} /></div>
        <div><Label>Return</Label><Input type="datetime-local" value={f.end} onChange={set("end")} /></div>
        <div><Label>Branch</Label><Select value={f.branchId} onChange={set("branchId")}><option value="">All</option>
          {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}</Select></div>
        <div><Label>Category</Label><Select value={f.category} onChange={set("category")}><option value="">All</option>
          {["Hatchback", "Sedan", "SUV", "Van", "Luxury"].map((c) => <option key={c}>{c}</option>)}</Select></div>
        <div><Label>Fuel</Label><Select value={f.fuel} onChange={set("fuel")}><option value="">Any</option>
          {["Petrol", "Diesel", "Electric", "Hybrid", "CNG"].map((c) => <option key={c}>{c}</option>)}</Select></div>
        <div><Label>Min seats</Label><Select value={f.seats} onChange={set("seats")}><option value="">Any</option>
          {[2, 4, 5, 7].map((c) => <option key={c} value={c}>{c}+</option>)}</Select></div>
        <div><Label>Max ₹/day</Label><Input type="number" min={0} value={f.maxRate} onChange={set("maxRate")} placeholder="e.g. 3500" /></div>
      </div>

      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <p className="text-zinc-400">{vehicles.length} vehicles available for the selected dates</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vehicles.map((v) => (
          <Card key={v.vehicle_id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{v.make} {v.model}</div><div className="text-xs text-zinc-400">{v.reg_no} · {v.branch_name}</div></div>
              <Badge>{v.status}</Badge>
            </div>
            <div className="text-zinc-400">{v.category} · {v.fuel_type} · {v.seats} seats</div>
            <div className="text-zinc-300">{Number(v.avg_rating) > 0 ? `Rated ${v.avg_rating} out of 5 (${v.review_count} reviews)` : "No reviews yet"}</div>
            <div className="mt-auto flex items-center justify-between pt-2">
              <div><span className="font-semibold">{inr(v.daily_rate)}</span><span className="text-xs text-zinc-400"> /day + {inr(v.per_km_rate)}/km</span></div>
              <Button onClick={() => { setSel(v); setMsg(null); }}>Book</Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Book ${sel.make} ${sel.model}` : ""}>
        {sel && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Pick-up</Label><Input type="datetime-local" value={f.start} onChange={set("start")} /></div>
              <div><Label>Return</Label><Input type="datetime-local" value={f.end} onChange={set("end")} /></div>
              <div><Label>Estimated distance (km)</Label><Input type="number" min={0} max={5000} value={km} onChange={(e) => setKm(Math.max(0, Number(e.target.value)))} /></div>
              <div><Label>Payment</Label><Select value={pay} onChange={(e) => setPay(e.target.value)}>{["UPI", "Card", "Wallet", "Cash"].map((m) => <option key={m}>{m}</option>)}</Select></div>
            </div>
            {quote ? (
              <div className="border-t pt-2">
                <Source>PostgreSQL: calc_fare()</Source>
                <div className="mt-2 flex justify-between"><span>Base ({quote.billed_days} day{quote.billed_days > 1 ? "s" : ""})</span><span className="tabular-nums">{inr(quote.base_fare)}</span></div>
                <div className="flex justify-between"><span>Distance</span><span className="tabular-nums">{inr(quote.distance_fare)}</span></div>
                {Number(quote.discount) > 0 && <div className="flex justify-between"><span>Loyalty discount</span><span className="tabular-nums">−{inr(quote.discount)}</span></div>}
                <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{inr(quote.total)}</span></div>
                <p className="mt-2 text-xs text-zinc-400">Late returns: 1 h grace, then 1.5× hourly rate. Early returns refund unused days.</p>
              </div>
            ) : <p className="text-zinc-400">Pick valid dates to see the price...</p>}
            {msg && !msg.ok && <Notice kind="error">{msg.text}</Notice>}
            <Button className="w-full" disabled={busy || !quote} onClick={book}>{busy ? "Processing..." : "Confirm & pay"}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
