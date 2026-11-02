import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { registerSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const b = registerSchema.parse(await req.json());
  const hash = await bcrypt.hash(b.password, 10);
  // role is NEVER taken from the client: self-registration always creates a customer
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, full_name, phone, license_no, role)
     VALUES ($1,$2,$3,$4,$5,'customer') RETURNING user_id, full_name, email, role`,
    [b.email, hash, b.fullName, b.phone ?? null, b.licenseNo ?? null]);
  const u = rows[0];
  await createSession({ userId: u.user_id, role: u.role, name: u.full_name, email: u.email });
  return json({ role: u.role }, 201);
});
