import { type NextRequest, NextResponse } from "next/server";

import { rightsOver } from "@/server/pin";
import { adminProfileId, countProfiles, deleteProfile, getProfile, setProfileLanguage, updateProfile } from "@/server/repo";
import { hashPin, json, requireUnlocked, writeSession } from "@/server/session";
import { parseProfileInput, readJson } from "@/server/validate";

/**
 * Editing a profile: yourself (signed in to it, or with its PIN from the picker) or the admin.
 * Deleting one: the admin only, and never the admin's own profile. `currentPin` is the PIN typed in the
 * picker: the profile's own PIN or the admin's.
 */

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/profiles/[id]">) {
  const session = requireUnlocked(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!getProfile(id)) return json({ error: "not-found" }, 404);

  // Language alone (Settings > Language) is a harmless per-person preference.
  if (Object.keys(body).length === 1 && (body.language === "en" || body.language === "vi")) {
    if (session.profileId !== id) return json({ error: "forbidden" }, 403);
    return json({ profile: setProfileLanguage(id, body.language) });
  }

  const rights = rightsOver(session, id, body.currentPin);
  if (rights instanceof Response) return rights;
  const input = parseProfileInput(body);
  if (typeof input === "string") return json({ error: input }, 400);
  const pinHash = input.pin === undefined ? undefined : input.pin === null ? null : hashPin(input.pin);
  return json({ profile: updateProfile(id, input, pinHash) });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/profiles/[id]">) {
  const session = requireUnlocked(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!getProfile(id)) return json({ error: "not-found" }, 404);
  if (id === adminProfileId()) return json({ error: "admin-profile" }, 409);
  if (countProfiles() <= 1) return json({ error: "last-profile" }, 409);
  const rights = rightsOver(session, id, body.currentPin);
  if (rights instanceof Response) return rights;
  if (rights !== "admin") return json({ error: "admin-only" }, 403);
  deleteProfile(id);
  const res = NextResponse.json({ ok: true });
  return session.profileId === id ? writeSession(res, { profileId: null }) : res;
}
