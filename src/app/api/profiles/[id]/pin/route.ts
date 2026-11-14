import type { NextRequest } from "next/server";

import { rightsFromPin } from "@/server/pin";
import { json, requireUnlocked } from "@/server/session";
import { readJson } from "@/server/validate";

/**
 * Checks a PIN typed in "Manage profiles" without entering the profile. The profile's own PIN gives
 * `rights: "self"` (edit it); the admin's PIN gives `rights: "admin"` (edit or delete anyone).
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/profiles/[id]/pin">) {
  const session = requireUnlocked(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const { pin } = await readJson(req);
  const rights = rightsFromPin(id, pin);
  return rights instanceof Response ? rights : json({ ok: true, rights });
}
