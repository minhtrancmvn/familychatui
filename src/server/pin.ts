import "server-only";

import { recordFailure, recordSuccess, waitSeconds } from "./rate-limit";
import { adminProfileId, getPinHash } from "./repo";
import { json, pinMatches, type Session } from "./session";

/**
 * Checks a profile's PIN with the guess limiter. Returns null when the caller may go ahead (no PIN, or the
 * right one), otherwise the error Response to send. Used to enter a profile: only its own PIN works.
 */
export function checkPin(profileId: string, pin: unknown): Response | null {
  const hash = getPinHash(profileId);
  if (hash === undefined) return json({ error: "not-found" }, 404);
  if (hash === null) return null;
  const key = `pin:${profileId}`;
  const wait = waitSeconds(key);
  if (wait > 0) return json({ error: "wait", retryAfter: wait }, 429);
  if (typeof pin !== "string" || !pinMatches(pin, hash)) {
    recordFailure(key);
    return json({ error: "wrong-pin" }, 403);
  }
  recordSuccess(key);
  return null;
}

/** What someone may do to a profile: "self" = edit it, "admin" = also delete it (and edit anyone). */
export type Rights = "self" | "admin";

/**
 * What a PIN typed for `targetId` proves (from the profile picker, where nobody is signed in to a
 * profile yet). The admin's PIN gives "admin"; the target's own PIN gives "self". A profile without a
 * PIN is open to anyone ("self"), and an admin without a PIN can't prove more than anyone else, so
 * then everyone gets "admin".
 */
export function rightsFromPin(targetId: string, pin: unknown): Rights | Response {
  const targetHash = getPinHash(targetId);
  if (targetHash === undefined) return json({ error: "not-found" }, 404);
  const adminId = adminProfileId();
  const adminHash = adminId ? getPinHash(adminId) : null;
  if (!adminId || adminHash === null) return "admin";

  const typed = typeof pin === "string" && /^\d{4}$/.test(pin) ? pin : null;
  const adminKey = `pin:${adminId}`;
  if (typed && adminHash && waitSeconds(adminKey) === 0 && pinMatches(typed, adminHash)) {
    recordSuccess(adminKey);
    return "admin";
  }
  if (targetHash === null) return "self";

  const key = `pin:${targetId}`;
  const wait = waitSeconds(key);
  if (wait > 0) return json({ error: "wait", retryAfter: wait }, 429);
  if (typed && pinMatches(typed, targetHash)) {
    recordSuccess(key);
    return "self";
  }
  recordFailure(key);
  if (typed && adminId !== targetId) recordFailure(adminKey);
  return json({ error: "wrong-pin" }, 403);
}

/** Rights over `targetId` for this request: from the signed-in profile first, else from a typed PIN. */
export function rightsOver(session: Session, targetId: string, pin: unknown): Rights | Response {
  const adminId = adminProfileId();
  if (session.profileId && session.profileId === adminId) return "admin";
  if (session.profileId === targetId) return "self";
  return rightsFromPin(targetId, pin);
}

/** Adding or deleting profiles: the admin, signed in or proven with their PIN. */
export function requireAdminRights(session: Session, pin: unknown): Response | null {
  const adminId = adminProfileId();
  if (!adminId) return null; // first profile ever
  const rights = rightsOver(session, adminId, pin);
  if (rights instanceof Response) return rights;
  return rights === "admin" ? null : json({ error: "admin-only" }, 403);
}
