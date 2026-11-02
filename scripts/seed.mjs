// Seeds PostgreSQL (relational data) + MongoDB (inspections, telematics) with realistic, scenario-driven data.
import pg from "pg";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const mongo = new MongoClient(process.env.MONGODB_URI);
await mongo.connect();
const mdb = mongo.db(process.env.MONGODB_DB ?? "fleet_ops");

// deterministic PRNG so every seed run produces the same dataset
let seed = 42;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DAY = 86400000, now = Date.now();
const at = (offsetDays, hour = 10) => { const d = new Date(now + offsetDays * DAY); d.setHours(hour, 0, 0, 0); return d; };
const dateOnly = (offsetDays) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10);

const q = (text, params) => pool.query(text, params);

await q("TRUNCATE disputes, reviews, damage_reports, payments, bookings, maintenance_logs, drivers, vehicles, branches, users RESTART IDENTITY CASCADE");
await Promise.all(["inspections", "telematics"].map((c) => mdb.collection(c).deleteMany({})));

// ---------- users ----------
const adminHash = await bcrypt.hash("Admin@123", 10);
const custHash = await bcrypt.hash("Customer@123", 10);
await q(`INSERT INTO users (email, password_hash, full_name, phone, role) VALUES ('admin@fleet.test',$1,'Fleet Manager','+91 80 4000 1000','admin')`, [adminHash]);
const customers = [
  ["priya@example.com", "Priya Nair", "+91 98450 11111", 620],
  ["rahul@example.com", "Rahul Sharma", "+91 98450 22222", 120],
  ["ananya@example.com", "Ananya Rao", "+91 98450 33333", 80],
  ["karthik@example.com", "Karthik Gowda", "+91 98450 44444", 300],
  ["meera@example.com", "Meera Iyer", "+91 98450 55555", 0],
];
for (const [i, c] of customers.entries())
  await q(`INSERT INTO users (email, password_hash, full_name, phone, license_no, loyalty_points) VALUES ($1,$2,$3,$4,$5,$6)`,
    [c[0], custHash, c[1], c[2], `KA0120210${String(12340 + i)}`, c[3]]);
const custIds = [2, 3, 4, 5, 6];   // priya, rahul, ananya, karthik, meera

// ---------- branches / drivers ----------
await q(`INSERT INTO branches (name, city, address) VALUES
  ('Indiranagar Hub','Bengaluru','100 Feet Rd, Indiranagar'),
  ('Kempegowda Airport','Bengaluru','Terminal 1 Parking, Devanahalli'),
  ('Mysuru Central','Mysuru','Sayyaji Rao Rd, Mysuru')`);
await q(`INSERT INTO drivers (full_name, phone, license_no, license_expiry) VALUES
  ('Manjunath K','+91 99000 10001','KA0520100011',$1),
  ('Suresh Babu','+91 99000 10002','KA0520110022',$2),
  ('Imran Pasha','+91 99000 10003','KA0520120033',$3),
  ('Lakshmi Devi','+91 99000 10004','KA0520130044',$4)`,
  [dateOnly(900), dateOnly(20), dateOnly(1500), dateOnly(700)]);   // Suresh's licence expires in 20 days -> dashboard alert

// ---------- vehicles ----------
// [branch, reg, make, model, category, fuel, seats, daily, perKm, odo, lastService, regExp, insExp, pucExp, kmpl]
const V = [
  [1,"KA01AB1001","Maruti","Swift","Hatchback","Petrol",5,1800,9,18400,10000,700,300,200,18],
  [1,"KA01AB1002","Hyundai","i20","Hatchback","Petrol",5,1900,9,12300,10000,800,250,150,17],
  [1,"KA01AB1003","Honda","City","Sedan","Petrol",5,2800,12,29800,20000,600,200,120,15],   // 200 km from service threshold
  [1,"KA01AB1004","Toyota","Camry","Sedan","Hybrid",5,3800,14,21000,15000,900,400,20,22],   // PUC expires in 20 days
  [2,"KA05CD2001","Mahindra","XUV700","SUV","Diesel",7,4200,16,34000,30000,1000,330,260,13],
  [2,"KA05CD2002","Tata","Nexon EV","SUV","Electric",5,3200,8,15200,10000,1100,500,365,0],
  [2,"KA05CD2003","Toyota","Innova Crysta","Van","Diesel",7,4800,17,58000,50000,500,210,180,11],
  [2,"KA05CD2004","Kia","Seltos","SUV","Petrol",5,3500,14,26500,20000,650,260,170,14],
  [3,"KA09EF3001","Hyundai","Verna","Sedan","Diesel",5,2900,12,23000,20000,720,280,190,17],
  [3,"KA09EF3002","Maruti","Ertiga","Van","CNG",7,2600,10,41000,40000,610,230,140,20],
  [3,"KA09EF3003","BMW","3 Series","Luxury","Petrol",5,7500,28,17800,10000,950,12,200,11],     // insurance expires in 12 days
  [3,"KA09EF3004","Tata","Tiago","Hatchback","Petrol",5,1500,8,64000,60000,300,150,100,19],
];
for (const v of V)
  await q(`INSERT INTO vehicles (branch_id, reg_no, make, model, category, fuel_type, seats, daily_rate, per_km_rate, odometer_km, last_service_km,
                                 registration_expiry, insurance_expiry, puc_expiry)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [...v.slice(0, 11), dateOnly(v[11]), dateOnly(v[12]), dateOnly(v[13])]);

// ---------- maintenance history (trigger trg_after_maintenance keeps vehicles in sync) ----------
const parts = ["Engine oil + filter", "Brake pads (front)", "Air filter, wiper blades", "Tyre rotation, alignment", "Coolant flush", "Battery check"];
for (const [i, v] of V.entries()) {
  const last = v[10];
  if (last >= 10000) await q(`INSERT INTO maintenance_logs (vehicle_id, service_type, description, parts_replaced, cost, odometer_km, downtime_days, serviced_on)
     VALUES ($1,'Scheduled','Periodic service',$2,$3,$4,1,$5)`, [i + 1, pick(parts), 3500 + Math.floor(rnd() * 3000), last - 10000, dateOnly(-200)]);
  await q(`INSERT INTO maintenance_logs (vehicle_id, service_type, description, parts_replaced, cost, odometer_km, downtime_days, serviced_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [i + 1, i % 4 === 0 ? "Repair" : "Scheduled", i % 4 === 0 ? "AC compressor repair" : "Periodic service", pick(parts),
       4000 + Math.floor(rnd() * 5000), last, i % 4 === 0 ? 4 : 1, dateOnly(-(20 + i * 5))]);
}

// ---------- historical bookings (completed), priced with calc_fare() exactly like the live workflow ----------
const completed = [];
async function pay(bookingId, amount, kind, when, method = "Card") {
  if (Number(amount) > 0) await q(`INSERT INTO payments (booking_id, amount, method, kind, paid_at) VALUES ($1,$2,$3,$4,$5)`, [bookingId, amount, method, kind, when]);
}
for (const [i] of V.entries()) {
  const vid = i + 1;
  let cursor = -85 + Math.floor(rnd() * 6);
  while (true) {
    const dur = 1 + Math.floor(rnd() * 4);
    const start = at(cursor), end = new Date(start.getTime() + dur * DAY);
    if (end.getTime() > now - 4 * DAY) break;
    const r = rnd();
    const returned = r < 0.25 ? new Date(end.getTime() + (2 + Math.floor(rnd() * 5)) * 3600000)           // late
                   : r < 0.40 && dur >= 2 ? new Date(end.getTime() - DAY + 3600000)                       // early
                   : new Date(end.getTime() - 1800000);
    const km = 60 + Math.floor(rnd() * 500), est = Math.round(km / 50) * 50;
    const uid = pick(custIds), driver = rnd() < 0.3 ? pick([1, 3, 4]) : null;
    const quote = (await q(`SELECT * FROM calc_fare($1,$2,$3,$4,NULL,false)`, [vid, start, end, est])).rows[0];
    const fin = (await q(`SELECT * FROM calc_fare($1,$2,$3,$4,$5,false)`, [vid, start, end, km, returned])).rows[0];
    const b = (await q(`INSERT INTO bookings (user_id, vehicle_id, driver_id, start_ts, end_ts, returned_ts, est_distance_km, actual_distance_km, total_fare, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Completed',$10) RETURNING booking_id`,
      [uid, vid, driver, start, end, returned, est, km, fin.total, new Date(start.getTime() - 2 * DAY)])).rows[0];
    await pay(b.booking_id, quote.total, "Fare", new Date(start.getTime() - 2 * DAY), pick(["Card", "UPI", "Wallet"]));
    const adj = Number(fin.total) - Number(quote.total);
    if (adj > 0) await pay(b.booking_id, adj, Number(fin.late_fee) > 0 ? "Late_Fee" : "Adjustment", returned);
    if (adj < 0) await pay(b.booking_id, -adj, "Refund", returned);
    completed.push({ id: b.booking_id, vid, uid, start, returned, km, plate: V[i][1] });
    cursor += dur + 1 + Math.floor(rnd() * 6);
  }
}

// ---------- live scenarios ----------
async function liveBooking(vid, uid, start, end, status, est, loyalty = false) {
  const f = (await q(`SELECT * FROM calc_fare($1,$2,$3,$4,NULL,$5)`, [vid, start, end, est, loyalty])).rows[0];
  const b = (await q(`INSERT INTO bookings (user_id, vehicle_id, start_ts, end_ts, est_distance_km, total_fare, status, loyalty_discount, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now() - interval '1 day') RETURNING booking_id`, [uid, vid, start, end, est, f.total, status, loyalty])).rows[0];
  await pay(b.booking_id, f.total, "Fare", new Date(), "UPI");
  if (status === "Active") await q(`UPDATE vehicles SET status='Rented' WHERE vehicle_id=$1`, [vid]);
}
await liveBooking(1, 3, at(-1), at(2), "Active", 300);                           // Rahul has the Swift now
await liveBooking(8, 5, at(-2), new Date(now - 5 * 3600000), "Active", 200);     // Karthik is ~5h LATE with the Seltos  -> demo late fee
await liveBooking(9, 2, at(3), at(6), "Confirmed", 250, true);                   // Priya's upcoming Verna (5% loyalty discount)
await liveBooking(3, 6, at(1), at(2), "Confirmed", 350);                         // Meera's Honda City: 350 km pushes it past the service threshold -> trigger demo

// ---------- reviews ----------
const goodC = ["Smooth ride and very clean interior", "Great mileage, comfortable seats", "Pickup was quick, vehicle in perfect condition", "AC was ice cold, loved the sunroof"];
const badC = ["AC was weak and the cabin smelled", "Brake noise at low speed, felt unsafe", "Late handover and a dirty interior", "Steering vibration above 80 km/h"];
for (const c of completed) if (rnd() < 0.6) {
  const rating = pick([5, 5, 4, 4, 4, 3, 2, 1]);
  await q(`INSERT INTO reviews (booking_id, user_id, vehicle_id, rating, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [c.id, c.uid, c.vid, rating, rating >= 4 ? pick(goodC) : pick(badC), new Date(c.returned.getTime() + 3600000)]);
}

// ---------- MongoDB: inspections (schema-less) -> damage_reports pointers ----------
const minorTarget = [...completed].reverse().find((c) => c.vid === 5);       // XUV700's latest return had minor damage
const docs = completed.flatMap((c) => ["pre_rental", "post_rental"].map((stage) => {
  const dmg = stage === "post_rental" && c === minorTarget;
  const createdAt = stage === "pre_rental" ? c.start : c.returned;
  return { booking_id: c.id, vehicle_id: c.vid, stage, severity: dmg ? "Medium" : "Low",
    status: "Recorded", inspection_date: createdAt,
    notes: dmg ? "Scratch on rear bumper, approx 12 cm; customer acknowledged" : pick(["No issues found", "Clean, no visible damage", "Minor dust on exterior only", "All fluids topped up"]),
    checklist: { tyres: true, brakes: true, lights: true, interiorClean: rnd() > 0.1, fuelLevelPct: Math.round(40 + rnd() * 60) },
    photo_references: [`/inspections/b${c.id}-${stage}-1.jpg`],
    inspector_id: 1, created_at: createdAt };
}));
const ins = await mdb.collection("inspections").insertMany(docs);
for (const [i, doc] of docs.entries())
  await q(`INSERT INTO damage_reports (booking_id, vehicle_id, stage, severity, notes, mongo_inspection_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [doc.booking_id, doc.vehicle_id, doc.stage === "pre_rental" ? "Pre_Rental" : "Post_Rental", doc.severity === "Medium" ? "Minor" : "None", doc.notes, ins.insertedIds[i].toString(), doc.created_at]);
//  ^ the Minor post-rental row fires trg_damage_flags_vehicle => XUV700 becomes Maintenance_Required

// ---------- explicit fleet states ----------
await q(`UPDATE vehicles SET status='Under_Maintenance' WHERE vehicle_id=7`);   // Innova in the workshop
await q(`UPDATE vehicles SET status='Out_of_Service'   WHERE vehicle_id=12`);   // Tiago retired

// ---------- disputes ----------
const ananya = [...completed].reverse().find((c) => c.uid === 4);
const karthik = [...completed].reverse().find((c) => c.uid === 5);
await q(`INSERT INTO disputes (booking_id, raised_by, reason) VALUES ($1,4,'I was charged a late fee but returned the car on time; please review the handover timestamps.')`, [ananya.id]);
await q(`INSERT INTO disputes (booking_id, raised_by, reason, status, resolution_note, refund_amount, resolved_by, resolved_at)
         VALUES ($1,5,'Vehicle AC was not working for the whole trip.','Resolved','Goodwill refund issued after AC fault confirmed.',300,1, now() - interval '2 days')`, [karthik.id]);
await pay(karthik.id, 300, "Refund", new Date(), "Wallet");

// ---------- MongoDB: 30 days of telematics ----------
const tele = [];
for (const [i, v] of V.entries()) {
  const vid = i + 1, kmpl = v[14], style = vid === 5 ? 0.12 : vid === 11 ? 0.08 : 0.025;
  let odo = v[9] - 3000;
  for (let day = 29; day >= 0; day--) {
    if (rnd() < 0.3) continue;                      // idle day
    for (const hour of [6, 9, 12, 15, 18, 21]) {
      const speed = 18 + rnd() * 55, dist = Math.round((speed * (0.2 + rnd() * 0.5)) * 10) / 10;
      odo += Math.round(dist);
      tele.push({ vehicle_id: vid, ts: at(-day, hour), speed_kmph: Math.round(speed * 10) / 10, distance_km: dist,
        fuel_litres: kmpl ? Math.round((dist / kmpl) * 100) / 100 : 0, energy_kwh: kmpl ? 0 : Math.round(dist * 0.15 * 100) / 100,
        odometer_km: odo, harsh_brake: rnd() < style, harsh_accel: rnd() < style / 2, engine_temp_c: Math.round(85 + rnd() * 20) });
    }
  }
}
await mdb.collection("telematics").insertMany(tele);

console.log(`✔ seeded: ${completed.length} completed bookings, ${docs.length} inspection docs, ${tele.length} telematics readings`);
await pool.end(); await mongo.close();
