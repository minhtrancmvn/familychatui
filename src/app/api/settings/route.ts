import type { NextRequest } from "next/server";

import { getFamilySettings, saveFamilySettings } from "@/server/repo";
import { json, requireAdmin } from "@/server/session";
import { readJson } from "@/server/validate";

/** Family-wide settings: default model for new chats and which models are hidden. Admin only. */
export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req);
  const current = getFamilySettings();
  const next = {
    defaultModelId: typeof body.defaultModelId === "string" ? body.defaultModelId : current.defaultModelId,
    hiddenModelIds: Array.isArray(body.hiddenModelIds)
      ? body.hiddenModelIds.filter((id): id is string => typeof id === "string")
      : current.hiddenModelIds,
  };
  return json({ settings: saveFamilySettings(next) });
}
