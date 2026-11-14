import { type NextRequest, NextResponse } from "next/server";

import { recordFailure, recordSuccess, waitSeconds } from "@/server/rate-limit";
import { clientIp, json, passwordMatches, requireAdmin, setFamilyPassword, writeSession } from "@/server/session";
import { readJson } from "@/server/validate";

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

/**
 * Changes the shared family password (Settings, admin only). Needs the current one. This device stays signed in;
 * every other device has to enter the new password.
 */
export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  // Same budget as the login screen: a wrong "current password" is a password guess.
  const key = `login:${clientIp(req)}`;
  const wait = waitSeconds(key);
  if (wait > 0) return json({ error: "wait", retryAfter: wait }, 429);

  const { current, next } = await readJson(req);
  if (typeof current !== "string" || !passwordMatches(current)) {
    recordFailure(key);
    return json({ error: "wrong-password" }, 403);
  }
  recordSuccess(key);
  if (typeof next !== "string") return json({ error: "bad-request" }, 400);
  const clean = next.trim();
  if (clean.length < MIN_LENGTH || clean.length > MAX_LENGTH) return json({ error: "too-short" }, 400);
  if (clean === current.trim()) return json({ error: "same-password" }, 400);

  setFamilyPassword(clean);
  // Re-sign this device's cookie with the new key.
  return writeSession(NextResponse.json({ ok: true }), auth.session);
}
