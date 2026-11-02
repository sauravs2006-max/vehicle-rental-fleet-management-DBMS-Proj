import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Edge gate: unauthenticated users -> /login, customers cannot open /admin. Route handlers re-check (defence in depth).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("fleet_session")?.value;
  let role: string | null = null;
  if (token && process.env.JWT_SECRET) {
    try { role = (await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET))).payload.role as string; } catch { role = null; }
  }
  if (!role) return NextResponse.redirect(new URL("/login", req.url));
  if (pathname.startsWith("/admin") && role !== "admin") return NextResponse.redirect(new URL("/vehicles", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/vehicles/:path*", "/bookings/:path*", "/admin/:path*"] };
