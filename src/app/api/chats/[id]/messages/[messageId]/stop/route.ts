import type { NextRequest } from "next/server";

import { stopReply } from "@/server/replies";
import { chatOwner } from "@/server/repo";
import { json, requireProfile } from "@/server/session";

/** The Stop button. The reply keeps what it has written so far. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/chats/[id]/messages/[messageId]/stop">) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { id: chatId, messageId } = await ctx.params;
  if (chatOwner(chatId) !== auth.profile.id) return json({ error: "not-found" }, 404);
  return json({ stopped: stopReply(messageId) });
}
