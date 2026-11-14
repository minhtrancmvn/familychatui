import { type NextRequest, NextResponse } from "next/server";

import { clearSession, crossSite, json } from "@/server/session";

/** Forgets the family password on this device. */
export async function POST(req: NextRequest) {
  if (crossSite(req)) return json({ error: "forbidden" }, 403);
  return clearSession(NextResponse.json({ ok: true }));
}
