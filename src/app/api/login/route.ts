import { type NextRequest, NextResponse } from "next/server";

import { recordFailure, recordSuccess, waitSeconds } from "@/server/rate-limit";
import { clientIp, crossSite, json, passwordMatches, writeSession } from "@/server/session";
import { readJson } from "@/server/validate";

/** Checks the shared family password and remembers this device. */
export async function POST(req: NextRequest) {
  if (crossSite(req)) return json({ error: "forbidden" }, 403);
  const key = `login:${clientIp(req)}`;
  const wait = waitSeconds(key);
  if (wait > 0) return json({ error: "wait", retryAfter: wait }, 429);

  const { password } = await readJson(req);
  if (typeof password !== "string" || !passwordMatches(password)) {
    recordFailure(key);
    return json({ error: "wrong-password" }, 401);
  }
  recordSuccess(key);
  return writeSession(NextResponse.json({ ok: true }), { profileId: null });
}
