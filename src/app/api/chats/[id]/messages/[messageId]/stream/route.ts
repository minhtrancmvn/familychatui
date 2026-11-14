import type { NextRequest } from "next/server";

import { followReply } from "@/server/replies";
import { chatOwner, getMessage } from "@/server/repo";
import { json, requireProfile } from "@/server/session";

/** Re-attaches to a reply after a dropped connection or a reload: snapshot, then live events. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/chats/[id]/messages/[messageId]/stream">) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { id: chatId, messageId } = await ctx.params;
  if (chatOwner(chatId) !== auth.profile.id || getMessage(messageId)?.chat_id !== chatId) {
    return json({ error: "not-found" }, 404);
  }
  return followReply(messageId);
}
