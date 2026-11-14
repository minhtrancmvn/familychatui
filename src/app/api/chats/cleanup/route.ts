import type { NextRequest } from "next/server";

import { stopChatReplies } from "@/server/replies";
import { deleteChatsInactiveSince } from "@/server/repo";
import { json, requireProfile } from "@/server/session";
import { readJson } from "@/server/validate";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Clean up chats" (Settings): deletes this profile's chats with no new message for `olderThanDays`
 * days, or all of them with `olderThanDays: null`. Chats kept forever always stay.
 */
export async function POST(req: NextRequest) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { olderThanDays } = await readJson(req);
  let cutoff: number;
  if (olderThanDays === null) {
    cutoff = Number.MAX_SAFE_INTEGER;
  } else if (typeof olderThanDays === "number" && Number.isInteger(olderThanDays) && olderThanDays >= 1 && olderThanDays <= 3650) {
    cutoff = Date.now() - olderThanDays * DAY_MS;
  } else {
    return json({ error: "bad-request" }, 400);
  }
  const deleted = deleteChatsInactiveSince(cutoff, auth.profile.id);
  deleted.forEach(stopChatReplies);
  return json({ deleted });
}
