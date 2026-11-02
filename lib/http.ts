import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler: maps validation / auth / PostgreSQL errors to clean JSON responses. */
export function route<C = unknown>(handler: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e: any) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json({ error: "Validation failed", details: e.flatten().fieldErrors }, { status: 400 });
      const pg: Record<string, [number, string]> = {
        "23505": [409, "That value already exists"],
        "23P01": [409, "That time slot conflicts with an existing reservation"],
        "23514": [422, "Value rejected by a database CHECK constraint"],
        "23503": [422, "Referenced record does not exist or is still in use"],
        "23502": [422, "A required value is missing"],
        "P0001": [422, e?.message ?? "Rejected by a database rule"],
      };
      const hit = e?.code ? pg[e.code] : undefined;
      if (hit) return NextResponse.json({ error: hit[1], constraint: e.constraint ?? undefined }, { status: hit[0] });
      console.error(e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export function intParam(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
}
