import type { NextRequest } from "next/server";

import { getFamilySettings, getProfile, listChats, listProfiles } from "@/server/repo";
import { json, readSession } from "@/server/session";

/** Everything the app needs on load: lock state, profiles, family settings and the active profile's chat list. */
export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return json({ unlocked: false });
  const profile = session.profileId ? getProfile(session.profileId) : null;
  return json({
    unlocked: true,
    profileId: profile?.id ?? null,
    profiles: listProfiles(),
    settings: getFamilySettings(),
    chats: profile ? listChats(profile.id) : [],
  });
}
