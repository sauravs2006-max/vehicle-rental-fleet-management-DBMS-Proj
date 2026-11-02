import { getSession } from "@/lib/auth";
import { json, route } from "@/lib/http";
export const GET = route(async () => json({ user: await getSession() }));
