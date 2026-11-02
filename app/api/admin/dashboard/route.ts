import { query } from "@/lib/db";
import { fleetTelematicsSummary } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireRole("admin");
  // Nothing else schedules this procedure, and only Active bookings can be checked in.
  await query("CALL sp_activate_due_bookings()");
  const [kpi, util, alerts, expiring, open, drivers, disputes, tele] = await Promise.all([
    query(`SELECT
        (SELECT COALESCE(SUM(CASE WHEN kind='Refund' THEN -amount ELSE amount END),0) FROM payments WHERE status='Paid') AS revenue,
        (SELECT count(*) FROM bookings WHERE status='Active')    AS active_rentals,
        (SELECT count(*) FROM bookings WHERE status='Confirmed') AS upcoming,
        (SELECT count(*) FROM disputes WHERE status='Open')      AS open_disputes,
        (SELECT count(*) FROM vehicles) AS fleet_size`),
    query("SELECT * FROM v_fleet_utilization ORDER BY total_revenue DESC"),
    query("SELECT * FROM v_maintenance_alerts ORDER BY km_to_service"),
    query("SELECT * FROM v_expiring_documents ORDER BY days_left"),
    query(`SELECT b.booking_id, u.full_name AS customer, v.make || ' ' || v.model AS vehicle, v.reg_no,
                  b.start_ts, b.end_ts, b.status, b.driver_id, d.full_name AS driver_name
             FROM bookings b JOIN users u USING (user_id) JOIN vehicles v USING (vehicle_id)
             LEFT JOIN drivers d ON d.driver_id = b.driver_id
            WHERE b.status IN ('Confirmed','Active') ORDER BY b.start_ts`),
    query("SELECT * FROM v_driver_performance ORDER BY full_name"),
    query(`SELECT x.dispute_id, x.booking_id, x.reason, x.created_at, u.full_name AS customer, b.total_fare
             FROM disputes x JOIN users u ON u.user_id = x.raised_by JOIN bookings b USING (booking_id)
            WHERE x.status = 'Open' ORDER BY x.created_at`),
    fleetTelematicsSummary(30).catch(() => null),   // dashboard still renders if MongoDB is down
  ]);
  return json({
    kpis: kpi.rows[0], utilization: util.rows, alerts: alerts.rows,
    expiring: expiring.rows, openBookings: open.rows, drivers: drivers.rows, disputes: disputes.rows, telematics: tele,
  });
});
