import { query } from "@/lib/db";
import { json, route } from "@/lib/http";
export const GET = route(async () => json((await query("SELECT branch_id, name, city FROM branches ORDER BY name")).rows));
