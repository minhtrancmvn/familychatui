import type { NextRequest } from "next/server";

import { reorderPinned } from "@/server/repo";
import { json, requireProfile } from "@/server/session";
import { isId, readJson } from "@/server/validate";

/** Saves the order of this profile's pinned chats (after a drag): `{ ids: [...] }`, top first. */
export async function PUT(req: NextRequest) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { ids } = await readJson(req);
  if (!Array.isArray(ids) || ids.length > 500 || !ids.every(isId) || new Set(ids).size !== ids.length) {
    return json({ error: "bad-request" }, 400);
  }
  // A different set means this device's list is stale (pinned or unpinned elsewhere): reload it.
  return reorderPinned(auth.profile.id, ids) ? json({ ok: true }) : json({ error: "stale" }, 409);
}
