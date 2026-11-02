"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Modal, Notice, Section, Select, Source, Textarea } from "@/components/ui";
import { useAdminTab } from "@/components/AdminTabs";
import RejectBookingModal from "@/components/RejectBookingModal";
import { cn, d, dt, inr } from "@/lib/utils";

const Table = ({ head, right = [], children }: { head: string[]; right?: string[]; children: React.ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full text-left [&_td]:p-2 [&_th]:p-2">
    <thead className="border-b text-xs text-zinc-400"><tr>{head.map((h) => <th key={h} className={cn("font-medium", right.includes(h) && "text-right")}>{h}</th>)}</tr></thead>
    <tbody className="divide-y">{children}</tbody></table></div>
);
/** A numeric table cell (its heading goes in the Table's `right` list). */
const Num = ({ children }: { children: React.ReactNode }) => <td className="text-right tabular-nums">{children}</td>;
const Kpi = ({ label, value }: { label: string; value: string | number }) => (
  <div><div className="text-xs text-zinc-400">{label}</div><div className="text-base font-semibold tabular-nums">{value}</div></div>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-zinc-500">{children}</p>;
const errText = (j: any) => (j?.details ? Object.values(j.details).flat().join(", ") : j?.error ?? "Something went wrong");
const plusYear = () => { const x = new Date(); x.setFullYear(x.getFullYear() + 1); return x.toISOString().slice(0, 10); };
const photoList = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const isNumeric = (v: any) => v === null || v === undefined || typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v));
/** The analytics endpoint returns one row per branch per day; the Overview shows the totals per branch. */
const perBranch = (rows: any[]) => Object.values(rows.reduce((acc: Record<number, { branch: string; bookings: number; revenue: number }>, r) => {
  const x = (acc[r.branch_id] ??= { branch: r.branch, bookings: 0, revenue: 0 });
  x.bookings += r.bookings; x.revenue += Number(r.net_revenue);
  return acc;
}, {}));

const newVehicle = () => ({ branchId: "", regNo: "", make: "", model: "", category: "Hatchback", fuelType: "Petrol", seats: 5,
  dailyRate: 2000, perKmRate: 10, odometerKm: 0, serviceIntervalKm: 10000, registrationExpiry: plusYear(), insuranceExpiry: plusYear(), pucExpiry: plusYear() });

function ResultTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <Empty>The query returned no rows.</Empty>;
  const cols = Object.keys(rows[0]);
  const label = (c: string) => c.replace(/_/g, " ");
  const numeric = cols.filter((c) => rows.every((r) => isNumeric(r[c])));
  const fmt = (v: any) => (v === null || v === undefined ? "-" : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? d(v) : String(v));
  return (
    <div className="max-h-96 overflow-auto"><Table head={cols.map(label)} right={numeric.map(label)}>
      {rows.map((r, i) => <tr key={i}>{cols.map((c) => numeric.includes(c) ? <Num key={c}>{fmt(r[c])}</Num> : <td key={c}>{fmt(r[c])}</td>)}</tr>)}
    </Table></div>
  );
}

export default function AdminPage() {
  return <Suspense fallback={<p className="text-zinc-400">Loading dashboard...</p>}><AdminDashboard /></Suspense>;
}

function AdminDashboard() {
  const tab = useAdminTab();
  const [data, setData] = useState<any>(null);
  const [branchWeek, setBranchWeek] = useState<any[] | null>(null);
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
  const loadBranchWeek = useCallback(async () => {
    const r = await fetch("/api/admin/analytics/branch-daily-availability-revenue?days=7"); const j = await r.json();
    setBranchWeek(r.ok ? perBranch(j.rows) : null);
  }, []);
  const loadInspections = useCallback(async () => {
    try { const r = await fetch("/api/admin/inspections"); const j = await r.json(); if (r.ok) setInspections(j); }
    catch { /* the rest of the dashboard still works if MongoDB is down */ }
  }, []);
  const reloadAll = useCallback(async () => { await load(); await Promise.all([loadBranchWeek(), loadInspections()]); }, [load, loadBranchWeek, loadInspections]);
  useEffect(() => { reloadAll(); fetch("/api/branches").then((r) => r.json()).then(setBranches).catch(() => {}); }, [reloadAll]);
  useEffect(() => setNote(null), [tab]);
  useEffect(() => {
    if (tab === "analytics" && !reports.length) fetch("/api/admin/reports").then((r) => r.json()).then((j) => Array.isArray(j) && setReports(j));
  }, [tab, reports.length]);

  const say = (ok: boolean, text: string) => setNote({ ok, text });
  // On success the note is the API's own account of what the database did.
  async function call(url: string, method: string, body: unknown) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    say(r.ok, r.ok ? j.dbEffect : errText(j));
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
    const { ok } = await call(`/api/bookings/${ret.booking_id}/return`, "POST", { actualKm: Number(rf.actualKm), severity: rf.severity, notes: rf.notes });
    if (ok) setRet(null);
  }
  async function doResolve() {
    const { ok } = await call(`/api/admin/disputes/${res.dispute_id}`, "PATCH", { status: rs.status, note: rs.note, refund: Number(rs.refund) });
    if (ok) setRes(null);
  }

  async function addVehicle() {
    setBusy(true);
    const { ok } = await call("/api/admin/vehicles", "POST", { ...vf, branchId: Number(vf.branchId) });
    setBusy(false);
    if (ok) { setAddOpen(false); setVf(newVehicle()); }
  }
  async function logService() {
    setBusy(true);
    const { ok } = await call("/api/admin/maintenance", "POST", {
      vehicleId: svc.vehicle_id, ...sf, partsReplaced: sf.partsReplaced || undefined, cost: Number(sf.cost), odometerKm: Number(sf.odometerKm), downtimeDays: Number(sf.downtimeDays) });
    setBusy(false);
    if (ok) setSvc(null);
  }
  async function saveVehicle() {
    const body: any = {};
    if (ef.status) body.status = ef.status;
    if (ef.dailyRate) body.dailyRate = Number(ef.dailyRate);
    if (ef.perKmRate) body.perKmRate = Number(ef.perKmRate);
    const { ok } = await call(`/api/admin/vehicles/${edit.vehicle_id}`, "PATCH", body);
    if (ok) setEdit(null);
  }
  async function removeVehicle(u: any) {
    if (!window.confirm(`Remove ${u.vehicle} (${u.reg_no}) from the fleet?`)) return;
    await call(`/api/admin/vehicles/${u.vehicle_id}`, "DELETE", {});
  }

  async function saveInspection() {
    setBusy(true);
    const { ok } = await call(`/api/admin/inspections/${encodeURIComponent(inspectionEdit._id)}`, "PATCH",
      { notes: inspectionForm.notes, severity: inspectionForm.severity, photo_references: photoList(inspectionForm.photoReferences) });
    setBusy(false);
    if (ok) setInspectionEdit(null);
  }
  async function createInspection() {
    setBusy(true);
    const payload: any = { vehicle_id: Number(inspectionCreateForm.vehicleId), notes: inspectionCreateForm.notes,
      severity: inspectionCreateForm.severity, photo_references: photoList(inspectionCreateForm.photoReferences) };
    if (inspectionCreateForm.bookingId.trim()) payload.booking_id = Number(inspectionCreateForm.bookingId);
    const { ok } = await call("/api/admin/inspections", "POST", payload);
    setBusy(false);
    if (ok) { setInspectionCreateOpen(false); setInspectionCreateForm({ vehicleId: "", bookingId: "", notes: "", severity: "Low", photoReferences: "" }); }
  }
  async function deleteInspection(item: any) {
    if (!window.confirm("Delete this inspection? Any damage-report pointer to it in PostgreSQL will be cleared.")) return;
    await call(`/api/admin/inspections/${encodeURIComponent(item._id)}`, "DELETE", {});
  }

  if (err) return <Notice kind="error">{err}</Notice>;
  if (!data) return <p className="text-zinc-400">Loading dashboard...</p>;
  const k = data.kpis;
  const names: Record<number, string> = Object.fromEntries(data.utilization.map((u: any) => [u.vehicle_id, `${u.vehicle} (${u.reg_no})`]));
  const setV = (key: string) => (e: React.ChangeEvent<any>) => setVf({ ...vf, [key]: e.target.value });
  const reportButton = (active: boolean) => cn("w-full p-2 text-left", active ? "font-semibold text-zinc-100" : "text-zinc-400 hover:text-zinc-200");

  return (
    <div>
      {/* Sticky and above the dialog overlay, so the result of an action is always in view. */}
      {note && <div className="sticky top-0 z-[60]"><Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice></div>}

      {/* ---------------------------------------------------------------- Overview */}
      {tab === "overview" && (
        <>
          <Section title="Summary" source="PostgreSQL: scalar subqueries over payments, vehicles, bookings and disputes">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <Kpi label="Net revenue" value={inr(k.revenue)} /><Kpi label="Fleet size" value={k.fleet_size} />
              <Kpi label="Active rentals" value={k.active_rentals} /><Kpi label="Upcoming" value={k.upcoming} />
              <Kpi label="Open disputes" value={k.open_disputes} />
            </div>
          </Section>
          <Section title="Last 7 days by branch" source="PostgreSQL: CTE with generate_series. Bookings: created in the window, not cancelled. Revenue: paid in the window, net of refunds.">
            {branchWeek ? <Table head={["Branch", "Bookings", "Revenue"]} right={["Bookings", "Revenue"]}>
              {branchWeek.map((b: any) => <tr key={b.branch}><td>{b.branch}</td><Num>{b.bookings}</Num><Num>{inr(b.revenue)}</Num></tr>)}
            </Table> : <Empty>Could not load the branch figures.</Empty>}
          </Section>
        </>
      )}

      {/* ---------------------------------------------------------------- Bookings */}
      {tab === "bookings" && (
        <>
          <Section title="Active and upcoming bookings" source="PostgreSQL: bookings joined to users, vehicles and drivers">
            {data.openBookings.length ? (
              <Table head={["#", "Customer", "Vehicle", "Period", "Status", "Assign chauffeur", "Actions"]} right={["#"]}>
                {data.openBookings.map((b: any) => (
                  <tr key={b.booking_id}>
                    <Num>{b.booking_id}</Num><td>{b.customer}</td><td>{b.vehicle}</td>
                    <td className="text-xs">{dt(b.start_ts)} to {dt(b.end_ts)}</td><td><Badge>{b.status}</Badge></td>
                    <td><Select value={b.driver_id ?? ""} aria-label={`Assign chauffeur to booking ${b.booking_id}`}
                      onChange={(e) => call(`/api/admin/bookings/${b.booking_id}/driver`, "PATCH", { driverId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Self-drive</option>{data.drivers.filter((x: any) => x.is_active).map((x: any) => <option key={x.driver_id} value={x.driver_id}>{x.full_name}</option>)}</Select></td>
                    <td>
                      {b.status === "Active" && <Button onClick={() => { setRet(b); setRf({ actualKm: 120, severity: "None", notes: "" }); }}>Check in</Button>}
                      {b.status === "Confirmed" && <Button variant="outline" destructive onClick={() => setReject(b)}>Reject</Button>}
                    </td>
                  </tr>))}
              </Table>
            ) : <Empty>No active or upcoming bookings.</Empty>}
          </Section>
          <Section title="Open disputes" source="PostgreSQL: disputes joined to users and bookings">
            {data.disputes.length ? (
              <Table head={["Booking", "Customer", "Reason", "Fare", "Actions"]} right={["Booking", "Fare"]}>
                {data.disputes.map((x: any) => (
                  <tr key={x.dispute_id}>
                    <Num>{x.booking_id}</Num><td>{x.customer}</td><td className="text-zinc-400">{x.reason}</td><Num>{inr(x.total_fare)}</Num>
                    <td><Button variant="outline" onClick={() => { setRes(x); setRs({ status: "Resolved", note: "", refund: 0 }); }}>Resolve</Button></td>
                  </tr>))}
              </Table>
            ) : <Empty>No open disputes.</Empty>}
          </Section>
        </>
      )}

      {/* ---------------------------------------------------------------- Fleet */}
      {tab === "fleet" && (
        <>
          <Section title="Vehicles" source="PostgreSQL: view v_fleet_utilization, 90-day window" action={<Button onClick={() => setAddOpen(true)}>Add vehicle</Button>}>
            <Table head={["Vehicle", "Branch", "Status", "Rentals", "Utilization", "Revenue", "Odometer", "Actions"]} right={["Rentals", "Utilization", "Revenue", "Odometer"]}>
              {data.utilization.map((u: any) => (
                <tr key={u.vehicle_id}>
                  <td>{u.vehicle} <span className="text-xs text-zinc-500">{u.reg_no}</span></td><td>{u.branch}</td>
                  <td><Badge>{u.status}</Badge></td><Num>{u.rental_count}</Num><Num>{u.utilization_pct}%</Num>
                  <Num>{inr(u.total_revenue)}</Num><Num>{Number(u.odometer_km).toLocaleString("en-IN")} km</Num>
                  <td><div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setSvc(u); setSf({ serviceType: "Scheduled", description: "", partsReplaced: "", cost: 0, odometerKm: Number(u.odometer_km), downtimeDays: 0 }); }}>Service</Button>
                    <Button variant="outline" onClick={() => { setEdit(u); setEf({ status: "", dailyRate: "", perKmRate: "" }); }}>Edit</Button>
                    <Button variant="outline" destructive onClick={() => removeVehicle(u)}>Remove</Button>
                  </div></td>
                </tr>))}
            </Table>
          </Section>
          <Section title="Maintenance alerts" source="PostgreSQL: view v_maintenance_alerts">
            {data.alerts.length ? <Table head={["Vehicle", "Status", "Km to service"]} right={["Km to service"]}>{data.alerts.map((a: any) => (
              <tr key={a.vehicle_id}><td>{a.vehicle} <span className="text-xs text-zinc-500">{a.reg_no}</span></td><td><Badge>{a.status}</Badge></td>
                <Num>{a.km_to_service <= 0 ? `${-a.km_to_service} overdue` : a.km_to_service}</Num></tr>))}</Table>
              : <Empty>All vehicles are within their service intervals.</Empty>}
          </Section>
          <Section title="Documents expiring within 30 days" source="PostgreSQL: view v_expiring_documents">
            {data.expiring.length ? <Table head={["Owner", "Document", "Expires", "Days"]} right={["Days"]}>{data.expiring.map((e: any, i: number) => (
              <tr key={i}><td>{e.owner_ref}</td><td>{e.doc_type}</td><td>{d(e.expiry_date)}</td><Num>{e.days_left < 0 ? "expired" : e.days_left}</Num></tr>))}</Table>
              : <Empty>Nothing expiring soon.</Empty>}
          </Section>
          <Section title="Chauffeurs" source="PostgreSQL: view v_driver_performance">
            <Table head={["Driver", "Licence expiry", "Trips", "Rating"]} right={["Trips", "Rating"]}>{data.drivers.map((x: any) => (
              <tr key={x.driver_id}><td>{x.full_name}</td><td>{d(x.license_expiry)}</td><Num>{x.trips_completed}</Num><Num>{x.avg_rating ?? "-"}</Num></tr>))}</Table>
          </Section>
        </>
      )}

      {/* ---------------------------------------------------------------- Inspections (MongoDB) */}
      {tab === "inspections" && (
        <Section title="Inspection reports" source="MongoDB: inspections collection, latest 50 documents. Check-in also creates one."
          action={<Button onClick={() => setInspectionCreateOpen(true)}>Add inspection</Button>}>
          {inspections.length ? <Table head={["Date", "Vehicle", "Stage", "Severity", "Notes", "Photos", "Actions"]} right={["Vehicle", "Photos"]}>
            {inspections.map((item: any) => (
              <tr key={item._id}>
                <td className="text-xs">{d(item.inspection_date ?? item.created_at)}</td>
                <Num>{item.vehicle_id ?? "-"}</Num>
                <td>{item.stage ?? item.status ?? "-"}</td>
                <td><Badge>{String(item.severity ?? "Low")}</Badge></td>
                <td className="max-w-56">{item.notes || "-"}</td>
                <Num>{(item.photo_references ?? []).length}</Num>
                <td><div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setInspectionEdit(item);
                    setInspectionForm({ notes: item.notes ?? "", severity: item.severity ?? "Low", photoReferences: (item.photo_references ?? []).join("\n") }); }}>Edit</Button>
                  <Button variant="outline" destructive onClick={() => deleteInspection(item)}>Delete</Button>
                </div></td>
              </tr>))}
          </Table> : <Empty>No inspections loaded. Make sure MongoDB is running, then refresh.</Empty>}
        </Section>
      )}

      {/* ---------------------------------------------------------------- Analytics */}
      {tab === "analytics" && (
        <div className="grid gap-4 py-4 md:grid-cols-[16rem_1fr]">
          <div className="h-fit divide-y border-b md:border-b-0 md:border-r">
            <button onClick={() => chooseReport("telematics")} className={reportButton(selected === "telematics")}>
              Vehicle telematics<div className="text-xs font-normal text-zinc-500">MongoDB: aggregation pipeline</div></button>
            {reports.map((r) => (
              <button key={r.id} onClick={() => chooseReport(r.id)} className={reportButton(selected === r.id)}>
                {r.title}<div className="text-xs font-normal text-zinc-500">PostgreSQL: {r.technique}</div></button>
            ))}
          </div>
          <div className="min-w-0 space-y-2">
            {selected === "telematics" ? (
              <>
                <div><h2>Vehicle telematics</h2>
                  <Source>MongoDB: aggregation pipeline over the last 30 days of telematics readings (lib/analytics.ts)</Source></div>
                {data.telematics ? <Table head={["Vehicle", "Distance", "Fuel / energy", "km/L", "Avg speed", "Harsh events /100 km", "Driving score"]}
                  right={["Distance", "Fuel / energy", "km/L", "Avg speed", "Harsh events /100 km", "Driving score"]}>
                  {data.telematics.map((t: any) => (
                    <tr key={t.vehicle_id}><td>{names[t.vehicle_id] ?? `#${t.vehicle_id}`}</td><Num>{t.distance_km} km</Num>
                      <Num>{t.fuel_litres > 0 ? `${t.fuel_litres} L` : `${t.energy_kwh} kWh`}</Num><Num>{t.km_per_litre ?? "-"}</Num>
                      <Num>{t.avg_speed} km/h</Num><Num>{t.harsh_events_per_100km}</Num><Num>{t.driving_score}</Num></tr>))}</Table>
                  : <Notice kind="error">MongoDB is not reachable, so telematics is hidden.</Notice>}
              </>
            ) : !result ? <Empty>Loading...</Empty> : result.error ? <Notice kind="error">{result.error}</Notice> : (
              <>
                <div><h2>{result.title}</h2>
                  <Source>PostgreSQL: {result.technique} · {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · from db/queries.sql (Q{result.id})</Source></div>
                <pre className="max-h-56 overflow-auto rounded border p-2 text-xs leading-relaxed text-zinc-300">{result.sql}</pre>
                <ResultTable rows={result.rows} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- Dialogs */}
      <RejectBookingModal booking={reject} onClose={() => setReject(null)} onDone={(m) => { setReject(null); say(true, m); reloadAll(); }} />

      <Modal open={ret?.status === "Active"} onClose={() => setRet(null)} title={ret ? `Complete return: booking #${ret.booking_id}` : ""}>
        <div className="space-y-4">
          <div><Label>Actual distance driven (km)</Label><Input type="number" min={0} value={rf.actualKm} onChange={(e) => setRf({ ...rf, actualKm: Number(e.target.value) })} /></div>
          <div><Label>Post-rental damage</Label><Select value={rf.severity} onChange={(e) => setRf({ ...rf, severity: e.target.value })}>
            <option>None</option><option>Minor</option><option>Major</option></Select></div>
          <div><Label>Inspection notes (stored in MongoDB)</Label><Input value={rf.notes} onChange={(e) => setRf({ ...rf, notes: e.target.value })} placeholder="e.g. scratch on rear bumper" /></div>
          <p className="text-xs text-zinc-500">The return time is now. calc_fare() recalculates the fare from the return time and actual distance, and sp_complete_return() inserts any late fee, adjustment or refund into payments.</p>
          <Button className="w-full" onClick={doReturn}>Complete return</Button>
        </div>
      </Modal>

      <Modal open={!!res} onClose={() => setRes(null)} title={res ? `Resolve dispute #${res.dispute_id}` : ""}>
        <div className="space-y-4">
          <div><Label>Decision</Label><Select value={rs.status} onChange={(e) => setRs({ ...rs, status: e.target.value })}><option>Resolved</option><option>Rejected</option></Select></div>
          <div><Label>Refund (₹)</Label><Input type="number" min={0} value={rs.refund} onChange={(e) => setRs({ ...rs, refund: Number(e.target.value) })} /></div>
          <div><Label>Resolution note</Label><Input value={rs.note} onChange={(e) => setRs({ ...rs, note: e.target.value })} /></div>
          <Button className="w-full" onClick={doResolve} disabled={rs.note.length < 3}>Submit decision</Button>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add vehicle">
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
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
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">Leave a field empty to keep its current value. A rented vehicle cannot change status.</p>
          <div><Label>Status</Label><Select value={ef.status} onChange={(e) => setEf({ ...ef, status: e.target.value })}>
            <option value="">Keep current</option><option value="Available">Available</option><option value="Out_of_Service">Out of service</option></Select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>New daily rate (₹)</Label><Input type="number" min={1} value={ef.dailyRate} onChange={(e) => setEf({ ...ef, dailyRate: e.target.value })} /></div>
            <div><Label>New per-km rate (₹)</Label><Input type="number" min={0} value={ef.perKmRate} onChange={(e) => setEf({ ...ef, perKmRate: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={saveVehicle} disabled={!ef.status && !ef.dailyRate && !ef.perKmRate}>Save changes</Button></div>
        </div>
      </Modal>

      <Modal open={inspectionCreateOpen} onClose={() => setInspectionCreateOpen(false)} title="Add inspection">
        <div className="space-y-4">
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
        <div className="space-y-4">
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
