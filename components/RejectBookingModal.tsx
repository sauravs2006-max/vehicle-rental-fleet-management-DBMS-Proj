"use client";
import { useEffect, useState } from "react";
import { Button, Input, Label, Modal, Notice, Select } from "@/components/ui";
import { inr } from "@/lib/utils";

const PRESETS = ["Driver unavailable", "Vehicle unavailable", "Vehicle needs urgent repair", "Other"];

/** Admin dialog for rejecting an upcoming (Confirmed) booking. The refund and slot release happen in sp_reject_booking(). */
export default function RejectBookingModal({ booking, onClose, onDone }:
  { booking: { booking_id: number; vehicle?: string; customer?: string; customer_name?: string } | null; onClose: () => void; onDone: (message: string) => void }) {
  const [preset, setPreset] = useState(PRESETS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setPreset(PRESETS[0]); setDetails(""); setErr(""); }, [booking?.booking_id]);

  const reason = preset === "Other" ? details.trim() : details.trim() ? `${preset}: ${details.trim()}` : preset;

  async function submit() {
    if (!booking) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/admin/bookings/${booking.booking_id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.details ? Object.values(j.details).flat().join(", ") : j.error ?? "Could not reject the booking"); return; }
    onDone(`Booking #${booking.booking_id} rejected. ${Number(j.refunded) > 0 ? `${inr(j.refunded)} refunded to the customer.` : "Nothing had been paid."}`);
  }

  const who = booking?.customer ?? booking?.customer_name;
  return (
    <Modal open={!!booking} onClose={onClose} title={booking ? `Reject booking #${booking.booking_id}` : ""}>
      <div className="space-y-3">
        <p className="text-sm text-zinc-400">
          {booking?.vehicle}{who ? ` for ${who}` : ""}. The customer is refunded in full, the vehicle and driver become free for those dates, and the reason is shown to the customer.
        </p>
        <div><Label>Reason</Label><Select value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map((p) => <option key={p}>{p}</option>)}</Select></div>
        <div><Label>{preset === "Other" ? "Details (required)" : "Extra details (optional)"}</Label>
          <Input value={details} maxLength={250} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. assigned chauffeur is on sick leave" /></div>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Keep booking</Button>
          <Button variant="danger" onClick={submit} disabled={busy || reason.length < 5}>{busy ? "Rejecting..." : "Reject and refund"}</Button>
        </div>
      </div>
    </Modal>
  );
}
