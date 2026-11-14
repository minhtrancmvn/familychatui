import "server-only";

import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import type { Profile } from "@/lib/types";

import { familyPassword, sessionSecret } from "./env";
import { getProfile, getSetting, setSetting } from "./repo";

/**
 * One signed cookie per device: "this device knows the family password" plus the chosen profile.
 * The HMAC key mixes in the family password, so changing the password signs every device out.
 *
 * The password starts as FAMILY_PASSWORD from the environment. Once someone changes it in Settings,
 * its scrypt hash lives in the database (settings key `family_password`) and the env value is ignored.
 */

const COOKIE = "familychat_session";
const MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookie lifetime at 400 days

export interface Session {
  profileId: string | null;
}

const PASSWORD_SETTING = "family_password";

function storedPasswordHash(): string | null {
  return getSetting(PASSWORD_SETTING);
}

function signingKey(): Buffer {
  const material = storedPasswordHash() ?? familyPassword();
  return createHmac("sha256", sessionSecret()).update(`session:${material}`).digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, p: session.profileId })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(value: string | undefined): Session | null {
  if (!value) return null;
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: number; p?: unknown };
    if (data.v !== 1) return null;
    return { profileId: typeof data.p === "string" ? data.p : null };
  } catch {
    return null;
  }
}

export function readSession(req: NextRequest): Session | null {
  return decode(req.cookies.get(COOKIE)?.value);
}

export function writeSession(res: NextResponse, session: Session): NextResponse {
  res.cookies.set(COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

export function clearSession(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

export function passwordMatches(input: string): boolean {
  const stored = storedPasswordHash();
  if (stored) return secretMatches(input.trim(), stored);
  const a = createHmac("sha256", "cmp").update(input.trim()).digest();
  const b = createHmac("sha256", "cmp").update(familyPassword()).digest();
  return timingSafeEqual(a, b);
}

/** Replaces the family password. Every session signed with the old one stops working. */
export function setFamilyPassword(next: string): void {
  setSetting(PASSWORD_SETTING, hashSecret(next.trim()));
}

/** scrypt with a random salt, stored as `salt:hash` (hex). Used for PINs and the family password. */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(secret, salt, 32).toString("hex")}`;
}

export function secretMatches(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const actual = scryptSync(secret, Buffer.from(saltHex, "hex"), 32);
  return timingSafeEqual(actual, Buffer.from(hashHex, "hex"));
}

export const hashPin = hashSecret;
export const pinMatches = secretMatches;

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Refuses cross-site writes. SameSite=Lax already keeps the cookie off cross-site POSTs; this also
 * covers same-site subdomains and requires a JSON or raw-bytes body, which a plain HTML form can't send.
 */
export function crossSite(req: NextRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD") return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return true;
    } catch {
      return true;
    }
  }
  const type = req.headers.get("content-type") ?? "";
  return req.method !== "DELETE" && !type.startsWith("application/json") && !type.startsWith("application/octet-stream");
}

/** The device has entered the family password. Returns a Response to send back when it hasn't. */
export function requireUnlocked(req: NextRequest): Session | Response {
  if (crossSite(req)) return json({ error: "forbidden" }, 403);
  const session = readSession(req);
  if (!session) return json({ error: "locked" }, 401);
  return session;
}

/** Unlocked and inside a profile that still exists. */
export function requireProfile(req: NextRequest): { session: Session; profile: Profile } | Response {
  const session = requireUnlocked(req);
  if (session instanceof Response) return session;
  const profile = session.profileId ? getProfile(session.profileId) : null;
  if (!profile) return json({ error: "no-profile" }, 403);
  return { session, profile };
}

/** Inside the admin's profile (family settings, family password). */
export function requireAdmin(req: NextRequest): { session: Session; profile: Profile } | Response {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  if (!auth.profile.isAdmin) return json({ error: "admin-only" }, 403);
  return auth;
}

/**
 * Caller IP for rate limiting: X-Real-IP, which nginx always overwrites with the address it sees
 * (Cloudflare's CF-Connecting-IP only when the request really comes from Cloudflare; see the realip
 * snippet in deploy/setup-host.sh). Never read CF-Connecting-IP here: without Cloudflare in front,
 * anyone could send it and get a fresh guess budget.
 */
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") || "local";
}
