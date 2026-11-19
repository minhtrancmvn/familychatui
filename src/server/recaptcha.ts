import "server-only";

import { RECAPTCHA_ACTION } from "@/lib/config";

import { recaptchaKeys } from "./env";

/**
 * reCAPTCHA v3 on the family password, the only screen strangers can reach. Google scores each visit
 * from 0.0 (bot) to 1.0 (person) with nothing to click. The password and the guess limiter stay the real
 * lock; this turns away scripted guessing before it reaches them.
 */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
// Google suggests 0.5. VPN and iCloud Private Relay visitors often score lower, and a family member
// locked out is worse than a bot reaching the rate-limited password check.
const MIN_SCORE = 0.3;
const TIMEOUT_MS = 5000;
// Problems with our own keys, which no visitor can cause: let the password decide, and log loudly.
const OWN_KEY_ERRORS = new Set(["missing-input-secret", "invalid-input-secret"]);

interface Verdict {
  success?: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
}

if (!recaptchaKeys() && (process.env.RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SECRET_KEY)) {
  console.warn("reCAPTCHA is off: set both RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY.");
}

/** The site key the login screen loads, or null while the check is off. */
export function recaptchaSiteKey(): string | null {
  return recaptchaKeys()?.siteKey ?? null;
}

/**
 * True when the token passes, or when the check is off. If Google can't be reached or rejects our own
 * keys, the visitor gets through to the password check (logged); a missing, bad or low-scoring token fails.
 */
export async function recaptchaPasses(token: unknown, ip: string): Promise<boolean> {
  const keys = recaptchaKeys();
  if (!keys) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    console.info("reCAPTCHA failed: no token");
    return false;
  }
  const form = new URLSearchParams({ secret: keys.secretKey, response: token });
  if (ip !== "local") form.set("remoteip", ip);

  let verdict: Verdict;
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    verdict = (await res.json()) as Verdict;
  } catch (err) {
    console.warn("reCAPTCHA unavailable, letting the password check decide:", err);
    return true;
  }

  const errors = verdict["error-codes"] ?? [];
  if (errors.some((code) => OWN_KEY_ERRORS.has(code))) {
    console.error(`reCAPTCHA keys rejected by Google (${errors.join(" ")}); letting the password check decide.`);
    return true;
  }
  const pass =
    verdict.success === true &&
    verdict.action === RECAPTCHA_ACTION &&
    typeof verdict.score === "number" &&
    verdict.score >= MIN_SCORE;
  const detail = [`score ${verdict.score ?? "-"}`, `action ${verdict.action ?? "-"}`, ...(errors.length ? [`errors ${errors.join(" ")}`] : [])];
  console.info(`reCAPTCHA ${pass ? "passed" : "failed"}: ${detail.join(", ")}`);
  return pass;
}
