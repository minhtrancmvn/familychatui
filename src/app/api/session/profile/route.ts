import { type NextRequest, NextResponse } from "next/server";

import { checkPin } from "@/server/pin";
import { getProfile, listChats } from "@/server/repo";
import { json, requireUnlocked, writeSession } from "@/server/session";
import { readJson } from "@/server/validate";

/** Enters a profile (checking its PIN), or leaves it with `{ profileId: null }`. */
export async function POST(req: NextRequest) {
  const session = requireUnlocked(req);
  if (session instanceof Response) return session;
  const { profileId, pin } = await readJson(req);

  if (profileId === null) return writeSession(NextResponse.json({ ok: true }), { profileId: null });
  if (typeof profileId !== "string") return json({ error: "bad-request" }, 400);

  const denied = checkPin(profileId, pin);
  if (denied) return denied;
  const res = NextResponse.json({ ok: true, profile: getProfile(profileId), chats: listChats(profileId) });
  return writeSession(res, { profileId });
}
