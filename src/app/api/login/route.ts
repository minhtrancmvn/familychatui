import { type NextRequest, NextResponse } from "next/server";

import { recordFailure, recordSuccess, waitSeconds } from "@/server/rate-limit";
import { recaptchaPasses, recaptchaSiteKey } from "@/server/recaptcha";
import { clientIp, crossSite, json, passwordMatches, writeSession } from "@/server/session";
import { readJson } from "@/server/validate";

/** The login screen asks which reCAPTCHA site key to load (null while the check is off). */
export function GET() {
  return json({ recaptchaSiteKey: recaptchaSiteKey() });
}

/** Checks the shared family password and remembers this device. */
export async function POST(req: NextRequest) {
  if (crossSite(req)) return json({ error: "forbidden" }, 403);
  const ip = clientIp(req);
  const key = `login:${ip}`;
  const wait = waitSeconds(key);
  if (wait > 0) return json({ error: "wait", retryAfter: wait }, 429);

  const { password, captcha } = await readJson(req);
  // A failed check counts as a wrong guess, so a script can't keep asking Google either.
  if (!(await recaptchaPasses(captcha, ip))) {
    recordFailure(key);
    return json({ error: "captcha" }, 403);
  }
  if (typeof password !== "string" || !passwordMatches(password)) {
    recordFailure(key);
    return json({ error: "wrong-password" }, 401);
  }
  recordSuccess(key);
  return writeSession(NextResponse.json({ ok: true }), { profileId: null });
}
