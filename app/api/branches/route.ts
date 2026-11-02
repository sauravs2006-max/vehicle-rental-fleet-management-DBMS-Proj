import { query } from "@/lib/db";
import { json, route } from "@/lib/http";
// force-dynamic: otherwise the build freezes the branch list and a db:reset never shows up.
export const dynamic = "force-dynamic";

export const GET = route(async () => json((await query("SELECT branch_id, name, city FROM branches ORDER BY name")).rows));
