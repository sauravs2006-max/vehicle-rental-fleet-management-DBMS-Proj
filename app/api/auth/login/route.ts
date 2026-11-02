import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { loginSchema } from "@/lib/validation";

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const POST = route(async (req) => {
  const b = loginSchema.parse(await req.json());
  const { rows } = await query("SELECT user_id, full_name, email, role, password_hash FROM users WHERE email = $1", [b.email]);
  const u = rows[0];
  // constant-ish behaviour: same error whether the e-mail or the password is wrong
  const ok = u ? await bcrypt.compare(b.password, u.password_hash) : await bcrypt.compare(b.password, DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, "Invalid email or password");
  await createSession({ userId: u.user_id, role: u.role, name: u.full_name, email: u.email });
  return json({ role: u.role });
});
