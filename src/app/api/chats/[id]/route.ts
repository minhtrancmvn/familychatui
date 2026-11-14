import type { NextRequest } from "next/server";

import { liveContent, stopChatReplies } from "@/server/replies";
import { deleteChat, getChat, renameChat, setKeepForever } from "@/server/repo";
import { json, requireProfile } from "@/server/session";
import { parseTitle, readJson } from "@/server/validate";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/chats/[id]">) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const chat = getChat(auth.profile.id, id);
  if (!chat) return json({ error: "not-found" }, 404);
  // A reply still being written is saved every few seconds; show the newest text.
  for (const m of chat.messages) {
    if (m.status !== "streaming") continue;
    const live = liveContent(m.id);
    if (live) {
      m.content = live.content;
      m.sources = live.sources.length ? live.sources : undefined;
    }
  }
  return json({ chat });
}

/** Rename (`title`) and/or keep forever (`keepForever`). */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/chats/[id]">) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body.title === undefined && typeof body.keepForever !== "boolean") return json({ error: "bad-request" }, 400);
  if (body.title !== undefined) {
    const title = parseTitle(body.title);
    if (!title) return json({ error: "bad-title" }, 400);
    if (!renameChat(auth.profile.id, id, title)) return json({ error: "not-found" }, 404);
  }
  if (typeof body.keepForever === "boolean" && !setKeepForever(auth.profile.id, id, body.keepForever)) {
    return json({ error: "not-found" }, 404);
  }
  return json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/chats/[id]">) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  // A chat that never got its first message only exists in the browser; deleting it is fine.
  if (deleteChat(auth.profile.id, id)) stopChatReplies(id);
  return json({ ok: true });
}
