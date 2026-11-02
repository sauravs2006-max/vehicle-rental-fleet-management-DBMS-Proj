import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { loadReports } from "@/lib/reports";

// GET /api/admin/reports          -> list of available reports (title, technique, SQL text)
// GET /api/admin/reports?id=3     -> runs that report and returns its rows
// Only queries from db/queries.sql can run (looked up by number), never SQL sent by the client.
export const GET = route(async (req) => {
  await requireRole("admin");
  const reports = loadReports();
  const idParam = req.nextUrl.searchParams.get("id");
  if (!idParam) return json(reports.map(({ params, ...r }) => r));

  const report = reports.find((r) => r.id === Number(idParam));
  if (!report) throw new HttpError(404, "Unknown report");
  const { rows, rowCount } = await query(report.sql, report.params);
  return json({ id: report.id, title: report.title, technique: report.technique, sql: report.sql, rowCount, rows: rows.slice(0, 100) });
});
