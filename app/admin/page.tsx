"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Modal, Notice, Select, Tabs, Textarea } from "@/components/ui";
import RejectBookingModal from "@/components/RejectBookingModal";
import { d, dt, inr } from "@/lib/utils";

type Tab = "overview" | "bookings" | "fleet" | "inspections" | "analytics";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "bookings", label: "Bookings" }, { id: "fleet", label: "Fleet" },
  { id: "inspections", label: "Inspections" }, { id: "analytics", label: "Analytics" },
];

const Table = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="border-b text-xs uppercase text-zinc-400"><tr>{head.map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
    <tbody className="divide-y">{children}</tbody></table></div>
);
const Kpi = ({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) => (
  <Card><div className="text-xs text-zinc-400">{label}</div><div className={`text-2xl font-bold ${warn ? "text-amber-400" : ""}`}>{value}</div></Card>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-zinc-500">{children}</p>;
const errText = (j: any) => (j?.details ? Object.values(j.details).flat().join(", ") : j?.error ?? "Something went wrong");
const plusYear = () => { const x = new Date(); x.setFullYear(x.getFullYear() + 1); return x.toISOString().slice(0, 10); };
const photoList = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

const newVehicle = () => ({ branchId: "", regNo: "", make: "", model: "", category: "Hatchback", fuelType: "Petrol", seats: 5,
  dailyRate: 2000, perKmRate: 10, odometerKm: 0, serviceIntervalKm: 10000, registrationExpiry: plusYear(), insuranceExpiry: plusYear(), pucExpiry: plusYear() });

function ResultTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <Empty>The query returned no rows.</Empty>;
  const cols = Object.keys(rows[0]);
  const fmt = (v: any) => (v === null || v === undefined ? "-" : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? d(v) : String(v));
  return (
    <div className="max-h-96 overflow-auto"><Table head={cols.map((c) => c.replace(/_/g, " "))}>
      {rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className="px-2 py-1.5">{fmt(r[c])}</td>)}</tr>)}
    </Table></div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // bookings
  const [ret, setRet] = useState<any>(null);
  const [rf, setRf] = useState({ actualKm: 120, severity: "None", notes: "" });
  const [reject, setReject] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [rs, setRs] = useState({ status: "Resolved", note: "", refund: 0 });

  // fleet
  const [branches, setBranches] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [vf, setVf] = useState<any>(newVehicle());
  const [svc, setSvc] = useState<any>(null);
  const [sf, setSf] = useState({ serviceType: "Scheduled", description: "", partsReplaced: "", cost: 0, odometerKm: 0, downtimeDays: 0 });
  const [edit, setEdit] = useState<any>(null);
  const [ef, setEf] = useState({ status: "", dailyRate: "", perKmRate: "" });

  // inspections (MongoDB)
  const [inspections, setInspections] = useState<any[]>([]);
  const [inspectionEdit, setInspectionEdit] = useState<any>(null);
  const [inspectionForm, setInspectionForm] = useState({ notes: "", severity: "Low", photoReferences: "" });
  const [inspectionCreateOpen, setInspectionCreateOpen] = useState(false);
  const [inspectionCreateForm, setInspectionCreateForm] = useState({ vehicleId: "", bookingId: "", notes: "", severity: "Low", photoReferences: "" });
  const [busy, setBusy] = useState(false);

  // analytics
  const [reports, setReports] = useState<any[]>([]);
  const [selected, setSelected] = useState<"telematics" | number>("telematics");
  const [result, setResult] = useState<any>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/dashboard"); const j = await r.json();
    if (!r.ok) setErr(j.error); else setData(j);
  }, []);
  const loadInspections = useCallback(async () => {
    try { const r = await fetch("/api/admin/inspections"); const j = await r.json(); if (r.ok) setInspections(j); }
    catch { /* the rest of the dashboard still works if MongoDB is down */ }
  }, []);
  const reloadAll = useCallback(async () => { await load(); await loadInspections(); }, [load, loadInspections]);
  useEffect(() => { reloadAll(); fetch("/api/branches").then((r) => r.json()).then(setBranches).catch(() => {}); }, [reloadAll]);
  useEffect(() => {
    if (tab === "analytics" && !reports.length) fetch("/api/admin/reports").then((r) => r.json()).then((j) => Array.isArray(j) && setReports(j));
  }, [tab, reports.length]);

  const say = (ok: boolean, text: string) => setNote({ ok, text });
  async function call(url: string, method: string, body: unknown) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    say(r.ok, r.ok ? "Done" : errText(j));
    if (r.ok) await reloadAll();
    return { ok: r.ok, j };
  }

  async function chooseReport(id: "telematics" | number) {
    setSelected(id); setResult(null);
    if (id === "telematics") return;
    const r = await fetch(`/api/admin/reports?id=${id}`); const j = await r.json();
    setResult(r.ok ? j : { error: j.error ?? "Query failed" });
  }

  async function doReturn() {
    const { ok, j } = await call(`/api/bookings/${ret.booking_id}/return`, "POST", { actualKm: Number(rf.actualKm), severity: rf.severity, notes: rf.notes });
    if (ok) { say(true, `Returned. Final fare ${inr(j.total_fare)}. Vehicle is now ${j.vehicle_status.replace(/_/g, " ")}. Payments: ${(j.payments ?? []).map((p: any) => `${p.kind} ${inr(p.amount)}`).join(", ")}`); setRet(null); }
  }
  async function doResolve() {
    const { ok } = await call(`/api/admin/disputes/${res.dispute_id}`, "PATCH", { status: rs.status, note: rs.note, refund: Number(rs.refund) });
    if (ok) setRes(null);
  }

  async function addVehicle() {
    setBusy(true);
    const { ok } = await call("/api/admin/vehicles", "POST", { ...vf, branchId: Number(vf.branchId) });
    setBusy(false);
    if (ok) { say(true, `Vehicle ${vf.regNo.toUpperCase()} added to the fleet.`); setAddOpen(false); setVf(newVehicle()); }
  }
  async function logService() {
    setBusy(true);
    const { ok, j } = await call("/api/admin/maintenance", "POST", {
      vehicleId: svc.vehicle_id, ...sf, partsReplaced: sf.partsReplaced || undefined, cost: Number(sf.cost), odometerKm: Number(sf.odometerKm), downtimeDays: Number(sf.downtimeDays) });
    setBusy(false);
    if (ok) { say(true, `Service logged. A trigger reset the service counter; ${svc.vehicle} is now ${String(j.status).replace(/_/g, " ")}.`); setSvc(null); }
  }
  async function saveVehicle() {
    const body: any = {};
    if (ef.status) body.status = ef.status;
    if (ef.dailyRate) body.dailyRate = Number(ef.dailyRate);
    if (ef.perKmRate) body.perKmRate = Number(ef.perKmRate);
    const { ok } = await call(`/api/admin/vehicles/${edit.vehicle_id}`, "PATCH", body);
    if (ok) { say(true, `${edit.vehicle} updated.`); setEdit(null); }
  }
  async function removeVehicle(u: any) {
    if (!window.confirm(`Remove ${u.vehicle} (${u.reg_no}) from the fleet?`)) return;
    const { ok } = await call(`/api/admin/vehicles/${u.vehicle_id}`, "DELETE", {});
    if (ok) say(true, `${u.vehicle} removed.`);
  }

  async function saveInspection() {
    setBusy(true);
    const { ok } = await call(`/api/admin/inspections/${encodeURIComponent(inspectionEdit._id)}`, "PATCH",
      { notes: inspectionForm.notes, severity: inspectionForm.severity, photo_references: photoList(inspectionForm.photoReferences) });
    setBusy(false);
    if (ok) { say(true, "Inspection updated"); setInspectionEdit(null); }
  }
  async function createInspection() {
    setBusy(true);
    const payload: any = { vehicle_id: Number(inspectionCreateForm.vehicleId), notes: inspectionCreateForm.notes,
      severity: inspectionCreateForm.severity, photo_references: photoList(inspectionCreateForm.photoReferences) };
    if (inspectionCreateForm.bookingId.trim()) payload.booking_id = Number(inspectionCreateForm.bookingId);
    const { ok } = await call("/api/admin/inspections", "POST", payload);
    setBusy(false);
    if (ok) { say(true, "Inspection created"); setInspectionCreateOpen(false); setInspectionCreateForm({ vehicleId: "", bookingId: "", notes: "", severity: "Low", photoReferences: "" }); }
  }
  async function deleteInspection(item: any) {
    if (!window.confirm("Delete this inspection? Any damage-report pointer to it in PostgreSQL will be cleared.")) return;
    const { ok } = await call(`/api/admin/inspections/${encodeURIComponent(item._id)}`, "DELETE", {});
    if (ok) say(true, "Inspection deleted");
  }

  if (err) return <p className="text-red-400">{err}</p>;
  if (!data) return <p className="text-zinc-400">Loading dashboard...</p>;
  const k = data.kpis;
  const names: Record<number, string> = Object.fromEntries(data.utilization.map((u: any) => [u.vehicle_id, `${u.vehicle} (${u.reg_no})`]));
  const setV = (key: string) => (e: React.ChangeEvent<any>) => setVf({ ...vf, [key]: e.target.value });
  const attention = [
    { label: "Upcoming bookings", n: Number(k.upcoming), tab: "bookings" as Tab, hint: "Assign a chauffeur, or reject if something has changed" },
    { label: "Open disputes", n: data.disputes.length, tab: "bookings" as Tab, hint: "Customer complaints waiting for a decision" },
    { label: "Vehicles due for service", n: data.alerts.length, tab: "fleet" as Tab, hint: "Over or close to their service interval" },
    { label: "Documents expiring within 30 days", n: data.expiring.length, tab: "fleet" as Tab, hint: "Registration, insurance, PUC and driving licences" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Fleet dashboard</h1>
        <Button variant="outline" size="sm" onClick={reloadAll}>Refresh</Button>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={(t) => { setTab(t); setNote(null); }} />
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}

      {/* ---------------------------------------------------------------- Overview */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Net revenue" value={inr(k.revenue)} /><Kpi label="Fleet size" value={k.fleet_size} />
            <Kpi label="Active rentals" value={k.active_rentals} /><Kpi label="Upcoming" value={k.upcoming} />
            <Kpi label="Open disputes" value={k.open_disputes} warn={Number(k.open_disputes) > 0} />
          </div>
          <Card>
            <h2 className="mb-3 font-semibold">Needs attention</h2>
            <div className="divide-y">
              {attention.map((a) => (
                <div key={a.label} className="flex items-center justify-between gap-3 py-2.5">
                  <div><div className="text-sm">{a.label}</div><div className="text-xs text-zinc-500">{a.hint}</div></div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xl font-bold ${a.n > 0 ? "text-amber-400" : "text-zinc-500"}`}>{a.n}</span>
                    <Button size="sm" variant="outline" onClick={() => setTab(a.tab)}>Open</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Fleet status</h2>
            <div className="flex flex-wrap gap-4">{data.statusCounts.map((s: any) =>
              <span key={s.status} className="flex items-center gap-1.5 text-sm"><Badge>{s.status}</Badge><span className="text-zinc-400">{s.count}</span></span>)}</div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- Bookings */}
      {tab === "bookings" && (
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Active and upcoming bookings</h2>
            <p className="mb-3 text-xs text-zinc-500">Rejecting an upcoming booking refunds the customer in full and frees the vehicle and chauffeur for those dates.</p>
            {data.openBookings.length ? (
              <Table head={["#", "Customer", "Vehicle", "Period", "Status", "Chauffeur", "Actions"]}>
                {data.openBookings.map((b: any) => (
                  <tr key={b.booking_id}>
                    <td className="px-2 py-1.5">{b.booking_id}</td><td className="px-2">{b.customer}</td><td className="px-2">{b.vehicle}</td>
                    <td className="px-2 text-xs">{dt(b.start_ts)} → {dt(b.end_ts)}</td><td className="px-2"><Badge>{b.status}</Badge></td>
                    <td className="px-2"><Select value={b.driver_id ?? ""} className="py-1 text-xs"
                      onChange={(e) => call(`/api/admin/bookings/${b.booking_id}/driver`, "PATCH", { driverId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Self-drive</option>{data.drivers.filter((x: any) => x.is_active).map((x: any) => <option key={x.driver_id} value={x.driver_id}>{x.full_name}</option>)}</Select></td>
                    <td className="px-2"><div className="flex gap-1">
                      <Button size="sm" onClick={() => { setRet(b); setRf({ actualKm: 120, severity: "None", notes: "" }); }}>Check in</Button>
                      {b.status === "Confirmed" && <Button size="sm" variant="outline" onClick={() => setReject(b)}>Reject</Button>}
                    </div></td>
                  </tr>))}
              </Table>
            ) : <Empty>No active or upcoming bookings.</Empty>}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Open disputes</h2>
            {data.disputes.length ? data.disputes.map((x: any) => (
              <div key={x.dispute_id} className="mb-2 rounded-md border p-3 text-sm">
                <div className="flex justify-between"><b>#{x.booking_id} · {x.customer}</b><span>{inr(x.total_fare)}</span></div>
                <p className="my-1 text-zinc-400">{x.reason}</p>
                <Button size="sm" variant="outline" onClick={() => { setRes(x); setRs({ status: "Resolved", note: "", refund: 0 }); }}>Resolve</Button></div>))
              : <Empty>No open disputes.</Empty>}
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- Fleet */}
      {tab === "fleet" && (
        <div className="space-y-5">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="font-semibold">Vehicles</h2><p className="text-xs text-zinc-500">View v_fleet_utilization, 90-day window</p></div>
              <Button size="sm" onClick={() => setAddOpen(true)}>Add vehicle</Button>
            </div>
            <Table head={["Vehicle", "Branch", "Status", "Rentals", "Utilization", "Revenue", "Odometer", "Actions"]}>
              {data.utilization.map((u: any) => (
                <tr key={u.vehicle_id}>
                  <td className="px-2 py-1.5">{u.vehicle} <span className="text-xs text-zinc-500">{u.reg_no}</span></td><td className="px-2">{u.branch}</td>
                  <td className="px-2"><Badge>{u.status}</Badge></td><td className="px-2">{u.rental_count}</td>
                  <td className="px-2"><div className="h-1.5 w-20 rounded bg-zinc-800"><div className="h-1.5 rounded bg-emerald-500" style={{ width: `${u.utilization_pct}%` }} /></div><span className="text-xs text-zinc-400">{u.utilization_pct}%</span></td>
                  <td className="px-2">{inr(u.total_revenue)}</td><td className="px-2">{Number(u.odometer_km).toLocaleString("en-IN")} km</td>
                  <td className="px-2"><div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setSvc(u); setSf({ serviceType: "Scheduled", description: "", partsReplaced: "", cost: 0, odometerKm: Number(u.odometer_km), downtimeDays: 0 }); }}>Service</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEdit(u); setEf({ status: "", dailyRate: "", perKmRate: "" }); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => removeVehicle(u)}>Remove</Button>
                  </div></td>
                </tr>))}
            </Table>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card><h2 className="mb-2 font-semibold">Maintenance alerts</h2>
              {data.alerts.length ? <Table head={["Vehicle", "Status", "Km to service"]}>{data.alerts.map((a: any) => (
                <tr key={a.vehicle_id}><td className="px-2 py-1.5">{a.vehicle} <span className="text-xs text-zinc-500">{a.reg_no}</span></td><td className="px-2"><Badge>{a.status}</Badge></td>
                  <td className={`px-2 ${a.km_to_service <= 0 ? "font-semibold text-red-400" : ""}`}>{a.km_to_service <= 0 ? `${-a.km_to_service} overdue` : a.km_to_service}</td></tr>))}</Table>
                : <Empty>All vehicles are within their service intervals.</Empty>}</Card>
            <Card><h2 className="mb-2 font-semibold">Documents expiring within 30 days</h2>
              {data.expiring.length ? <Table head={["Owner", "Document", "Expires", "Days"]}>{data.expiring.map((e: any, i: number) => (
                <tr key={i}><td className="px-2 py-1.5">{e.owner_ref}</td><td className="px-2">{e.doc_type}</td><td className="px-2">{d(e.expiry_date)}</td>
                  <td className={`px-2 ${e.days_left < 0 ? "font-semibold text-red-400" : e.days_left <= 14 ? "text-amber-400" : ""}`}>{e.days_left < 0 ? "expired" : e.days_left}</td></tr>))}</Table>
                : <Empty>Nothing expiring soon.</Empty>}</Card>
          </div>
          <Card><h2 className="mb-2 font-semibold">Chauffeurs</h2>
            <Table head={["Driver", "Licence expiry", "Trips", "Rating"]}>{data.drivers.map((x: any) => (
              <tr key={x.driver_id}><td className="px-2 py-1.5">{x.full_name}</td><td className="px-2">{d(x.license_expiry)}</td><td className="px-2">{x.trips_completed}</td><td className="px-2">{x.avg_rating ?? "-"}</td></tr>))}</Table></Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- Inspections (MongoDB) */}
      {tab === "inspections" && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-semibold">Inspection reports</h2>
              <p className="text-xs text-zinc-500">MongoDB documents. Create, read, update and delete them here; check-in also creates one automatically.</p></div>
            <Button size="sm" onClick={() => setInspectionCreateOpen(true)}>Add inspection</Button>
          </div>
          {inspections.length ? <Table head={["Date", "Vehicle", "Stage", "Severity", "Notes", "Photos", "Actions"]}>
            {inspections.map((item: any) => (
              <tr key={item._id}>
                <td className="px-2 py-2 text-xs">{d(item.inspection_date ?? item.created_at)}</td>
                <td className="px-2">{item.vehicle_id ?? "-"}</td>
                <td className="px-2">{item.stage ?? item.status ?? "-"}</td>
                <td className="px-2"><Badge>{String(item.severity ?? "Low")}</Badge></td>
                <td className="max-w-56 px-2 py-2">{item.notes || "-"}</td>
                <td className="px-2">{(item.photo_references ?? []).length}</td>
                <td className="px-2 py-2"><div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setInspectionEdit(item);
                    setInspectionForm({ notes: item.notes ?? "", severity: item.severity ?? "Low", photoReferences: (item.photo_references ?? []).join("\n") }); }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteInspection(item)}>Delete</Button>
                </div></td>
              </tr>))}
          </Table> : <Empty>No inspections loaded. Make sure MongoDB is running, then refresh.</Empty>}
        </Card>
      )}

      {/* ---------------------------------------------------------------- Analytics */}
      {tab === "analytics" && (
        <div className="grid gap-5 md:grid-cols-[17rem_1fr]">
          <Card className="h-fit p-2">
            <button onClick={() => chooseReport("telematics")}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === "telematics" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/60"}`}>
              Vehicle telematics<div className="text-xs text-zinc-500">MongoDB aggregation</div></button>
            {reports.map((r) => (
              <button key={r.id} onClick={() => chooseReport(r.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === r.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/60"}`}>
                {r.title}<div className="text-xs text-zinc-500">{r.technique}</div></button>
            ))}
          </Card>
          <Card>
            {selected === "telematics" ? (
              <>
                <h2 className="font-semibold">Vehicle telematics</h2>
                <p className="mb-3 text-xs text-zinc-500">MongoDB aggregation pipeline over the last 30 days of readings</p>
                {data.telematics ? <Table head={["Vehicle", "Distance", "Fuel / energy", "km/L", "Avg speed", "Harsh events /100 km", "Driving score"]}>
                  {data.telematics.map((t: any) => (
                    <tr key={t.vehicle_id}><td className="px-2 py-1.5">{names[t.vehicle_id] ?? `#${t.vehicle_id}`}</td><td className="px-2">{t.distance_km} km</td>
                      <td className="px-2">{t.fuel_litres > 0 ? `${t.fuel_litres} L` : `${t.energy_kwh} kWh`}</td><td className="px-2">{t.km_per_litre ?? "-"}</td>
                      <td className="px-2">{t.avg_speed} km/h</td><td className="px-2">{t.harsh_events_per_100km}</td>
                      <td className={`px-2 font-semibold ${t.driving_score < 70 ? "text-red-400" : "text-emerald-400"}`}>{t.driving_score}</td></tr>))}</Table>
                  : <Notice kind="error">MongoDB is not reachable, so telematics is hidden.</Notice>}
              </>
            ) : !result ? <Empty>Loading...</Empty> : result.error ? <Notice kind="error">{result.error}</Notice> : (
              <>
                <h2 className="font-semibold">{result.title}</h2>
                <p className="mb-2 text-xs text-zinc-500">{result.technique} · {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · from db/queries.sql (Q{result.id})</p>
                <pre className="mb-3 max-h-56 overflow-auto rounded-md border bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">{result.sql}</pre>
                <ResultTable rows={result.rows} />
              </>
            )}
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- Dialogs */}
      <RejectBookingModal booking={reject} onClose={() => setReject(null)} onDone={(m) => { setReject(null); say(true, m); reloadAll(); }} />

      <Modal open={!!ret} onClose={() => setRet(null)} title={ret ? `Check in booking #${ret.booking_id}` : ""}>
        <div className="space-y-3">
          <div><Label>Actual distance driven (km)</Label><Input type="number" min={0} value={rf.actualKm} onChange={(e) => setRf({ ...rf, actualKm: Number(e.target.value) })} /></div>
          <div><Label>Post-rental damage</Label><Select value={rf.severity} onChange={(e) => setRf({ ...rf, severity: e.target.value })}>
            <option>None</option><option>Minor</option><option>Major</option></Select></div>
          <div><Label>Inspection notes (stored in MongoDB)</Label><Input value={rf.notes} onChange={(e) => setRf({ ...rf, notes: e.target.value })} placeholder="e.g. scratch on rear bumper" /></div>
          <p className="text-xs text-zinc-500">Return time is now. The late fee or early-return refund is calculated by calc_fare() inside sp_complete_return().</p>
          <Button className="w-full" onClick={doReturn}>Complete return</Button>
        </div>
      </Modal>

      <Modal open={!!res} onClose={() => setRes(null)} title={res ? `Resolve dispute #${res.dispute_id}` : ""}>
        <div className="space-y-3">
          <div><Label>Decision</Label><Select value={rs.status} onChange={(e) => setRs({ ...rs, status: e.target.value })}><option>Resolved</option><option>Rejected</option></Select></div>
          <div><Label>Refund (₹)</Label><Input type="number" min={0} value={rs.refund} onChange={(e) => setRs({ ...rs, refund: Number(e.target.value) })} /></div>
          <div><Label>Resolution note</Label><Input value={rs.note} onChange={(e) => setRs({ ...rs, note: e.target.value })} /></div>
          <Button className="w-full" onClick={doResolve} disabled={rs.note.length < 3}>Submit decision</Button>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add vehicle">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Branch</Label><Select value={vf.branchId} onChange={setV("branchId")}><option value="">Select a branch</option>
            {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}</Select></div>
          <div><Label>Registration no.</Label><Input value={vf.regNo} onChange={setV("regNo")} placeholder="KA01AB1234" /></div>
          <div><Label>Seats</Label><Input type="number" min={1} max={15} value={vf.seats} onChange={setV("seats")} /></div>
          <div><Label>Make</Label><Input value={vf.make} onChange={setV("make")} /></div>
          <div><Label>Model</Label><Input value={vf.model} onChange={setV("model")} /></div>
          <div><Label>Category</Label><Select value={vf.category} onChange={setV("category")}>{["Hatchback", "Sedan", "SUV", "Van", "Luxury"].map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>Fuel</Label><Select value={vf.fuelType} onChange={setV("fuelType")}>{["Petrol", "Diesel", "Electric", "Hybrid", "CNG"].map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>Daily rate (₹)</Label><Input type="number" min={1} value={vf.dailyRate} onChange={setV("dailyRate")} /></div>
          <div><Label>Per-km rate (₹)</Label><Input type="number" min={0} value={vf.perKmRate} onChange={setV("perKmRate")} /></div>
          <div><Label>Odometer (km)</Label><Input type="number" min={0} value={vf.odometerKm} onChange={setV("odometerKm")} /></div>
          <div><Label>Service every (km)</Label><Input type="number" min={1000} value={vf.serviceIntervalKm} onChange={setV("serviceIntervalKm")} /></div>
          <div><Label>Registration expiry</Label><Input type="date" value={vf.registrationExpiry} onChange={setV("registrationExpiry")} /></div>
          <div><Label>Insurance expiry</Label><Input type="date" value={vf.insuranceExpiry} onChange={setV("insuranceExpiry")} /></div>
          <div><Label>PUC expiry</Label><Input type="date" value={vf.pucExpiry} onChange={setV("pucExpiry")} /></div>
          <div className="col-span-2 flex justify-end gap-2"><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addVehicle} disabled={busy || !vf.branchId || !vf.regNo || !vf.make || !vf.model}>{busy ? "Adding..." : "Add vehicle"}</Button></div>
        </div>
      </Modal>

      <Modal open={!!svc} onClose={() => setSvc(null)} title={svc ? `Log service: ${svc.vehicle}` : ""}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label><Select value={sf.serviceType} onChange={(e) => setSf({ ...sf, serviceType: e.target.value })}>{["Scheduled", "Repair", "Inspection"].map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>Odometer at service (km)</Label><Input type="number" min={0} value={sf.odometerKm} onChange={(e) => setSf({ ...sf, odometerKm: Number(e.target.value) })} /></div>
          <div className="col-span-2"><Label>Work done</Label><Input value={sf.description} onChange={(e) => setSf({ ...sf, description: e.target.value })} placeholder="e.g. oil change, brake pads" /></div>
          <div className="col-span-2"><Label>Parts replaced (optional)</Label><Input value={sf.partsReplaced} onChange={(e) => setSf({ ...sf, partsReplaced: e.target.value })} /></div>
          <div><Label>Cost (₹)</Label><Input type="number" min={0} value={sf.cost} onChange={(e) => setSf({ ...sf, cost: Number(e.target.value) })} /></div>
          <div><Label>Downtime (days)</Label><Input type="number" min={0} value={sf.downtimeDays} onChange={(e) => setSf({ ...sf, downtimeDays: Number(e.target.value) })} /></div>
          <p className="col-span-2 text-xs text-zinc-500">Saving inserts a maintenance log; a trigger then resets the service counter and clears the maintenance flag.</p>
          <div className="col-span-2 flex justify-end gap-2"><Button variant="outline" onClick={() => setSvc(null)}>Cancel</Button>
            <Button onClick={logService} disabled={busy || sf.description.trim().length < 3}>{busy ? "Saving..." : "Save service"}</Button></div>
        </div>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit ${edit.vehicle}` : ""}>
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">Leave a field empty to keep its current value. A rented vehicle cannot change status.</p>
          <div><Label>Status</Label><Select value={ef.status} onChange={(e) => setEf({ ...ef, status: e.target.value })}>
            <option value="">Keep current</option><option value="Available">Available</option><option value="Out_of_Service">Out of service</option></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>New daily rate (₹)</Label><Input type="number" min={1} value={ef.dailyRate} onChange={(e) => setEf({ ...ef, dailyRate: e.target.value })} /></div>
            <div><Label>New per-km rate (₹)</Label><Input type="number" min={0} value={ef.perKmRate} onChange={(e) => setEf({ ...ef, perKmRate: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={saveVehicle} disabled={!ef.status && !ef.dailyRate && !ef.perKmRate}>Save changes</Button></div>
        </div>
      </Modal>

      <Modal open={inspectionCreateOpen} onClose={() => setInspectionCreateOpen(false)} title="Add inspection">
        <div className="space-y-3">
          <div><Label>Vehicle ID</Label><Input type="number" min={1} value={inspectionCreateForm.vehicleId} onChange={(e) => setInspectionCreateForm({ ...inspectionCreateForm, vehicleId: e.target.value })} /></div>
          <div><Label>Booking ID (optional)</Label><Input type="number" min={1} value={inspectionCreateForm.bookingId} onChange={(e) => setInspectionCreateForm({ ...inspectionCreateForm, bookingId: e.target.value })} /></div>
          <div><Label>Notes</Label><Input value={inspectionCreateForm.notes} maxLength={5000} onChange={(e) => setInspectionCreateForm({ ...inspectionCreateForm, notes: e.target.value })} /></div>
          <div><Label>Severity</Label><Select value={inspectionCreateForm.severity} onChange={(e) => setInspectionCreateForm({ ...inspectionCreateForm, severity: e.target.value })}>
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option></Select></div>
          <div><Label>Photo references (one URL or path per line)</Label><Textarea rows={3} value={inspectionCreateForm.photoReferences}
            onChange={(e) => setInspectionCreateForm({ ...inspectionCreateForm, photoReferences: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setInspectionCreateOpen(false)}>Cancel</Button>
            <Button onClick={createInspection} disabled={busy || !inspectionCreateForm.vehicleId || Number(inspectionCreateForm.vehicleId) <= 0}>{busy ? "Creating..." : "Create inspection"}</Button></div>
        </div>
      </Modal>

      <Modal open={!!inspectionEdit} onClose={() => setInspectionEdit(null)} title="Edit inspection">
        <div className="space-y-3">
          <div><Label>Notes</Label><Input value={inspectionForm.notes} maxLength={5000} onChange={(e) => setInspectionForm({ ...inspectionForm, notes: e.target.value })} /></div>
          <div><Label>Severity</Label><Select value={inspectionForm.severity} onChange={(e) => setInspectionForm({ ...inspectionForm, severity: e.target.value })}>
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option></Select></div>
          <div><Label>Photo references (one URL or path per line)</Label><Textarea rows={4} value={inspectionForm.photoReferences}
            onChange={(e) => setInspectionForm({ ...inspectionForm, photoReferences: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setInspectionEdit(null)}>Cancel</Button>
            <Button onClick={saveInspection} disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
