import type { NextRequest } from "next/server";

import { usageReport } from "@/server/repo";
import { json, requireAdmin } from "@/server/session";

const PERIODS = new Set([7, 30, 90]);

/** Family usage for the admin: `?days=7|30|90&tz=<minutes east of UTC>`. */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
  const tz = Number(req.nextUrl.searchParams.get("tz") ?? 0);
  if (!PERIODS.has(days)) return json({ error: "bad-days" }, 400);
  if (!Number.isInteger(tz) || Math.abs(tz) > 14 * 60) return json({ error: "bad-tz" }, 400);
  return json(usageReport(days, tz));
}
