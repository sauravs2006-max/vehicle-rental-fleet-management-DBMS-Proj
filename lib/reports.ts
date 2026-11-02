import { readFileSync } from "node:fs";
import path from "node:path";

export type Report = { id: number; title: string; technique: string; sql: string; params: unknown[] };

// Only these blocks of db/queries.sql are plain SELECTs that are safe to run from the dashboard.
const RUNNABLE = new Set([1, 2, 3, 4, 5, 6, 7, 10, 11]);

/**
 * Reads db/queries.sql and turns every "-- Q<n> <title> (<technique>)" block into a report.
 * Doing it this way keeps one copy of each query: the file you show in the viva is the one the app runs.
 */
export function loadReports(): Report[] {
  const text = readFileSync(path.join(process.cwd(), "db", "queries.sql"), "utf8");
  const reports: Report[] = [];
  for (const block of text.split(/^-- Q(?=\d+ )/m).slice(1)) {
    const [head, ...rest] = block.split("\n");
    const m = head.match(/^(\d+) (.*) \(([^()]*)\)\s*$/);
    const id = Number(m ? m[1] : head.split(" ")[0]);
    if (!RUNNABLE.has(id)) continue;
    const sql = rest.filter((l) => !l.trim().startsWith("--")).join("\n").trim();
    reports.push({
      id, title: m ? m[2] : head.replace(/^\d+ /, ""), technique: m ? m[3] : "SQL",
      sql, params: sql.includes("$1") ? [7] : [],
    });
  }
  return reports;
}
