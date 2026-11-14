import type { NextRequest } from "next/server";

import { hasModel } from "@/lib/models";
import { chatIsBusy, followReply, startReply } from "@/server/replies";
import { chatOwner, historyBefore, messageExists, saveTurn } from "@/server/repo";
import { json, requireProfile } from "@/server/session";
import { isId, parseAttachments, parseText, parseTitle, readJson } from "@/server/validate";

/**
 * Sends a message and streams the reply (SSE). The browser picks the ids so it can show both messages
 * right away. The chat is created on its first message.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/chats/[id]/messages">) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { id: chatId } = await ctx.params;
  const body = await readJson(req);

  const { userMessageId, replyId, modelId } = body;
  const text = parseText(body.text);
  const attachments = parseAttachments(body.attachments);
  if (!isId(chatId) || !isId(userMessageId) || !isId(replyId) || userMessageId === replyId) {
    return json({ error: "bad-ids" }, 400);
  }
  if (typeof modelId !== "string" || !hasModel(modelId)) return json({ error: "unknown-model" }, 400);
  if (text === null) return json({ error: "bad-text" }, 400);
  if (typeof attachments === "string") return json({ error: attachments }, 400);
  if (!text && attachments.length === 0) return json({ error: "empty" }, 400);

  const owner = chatOwner(chatId);
  if (owner !== null && owner !== auth.profile.id) return json({ error: "not-found" }, 404);
  if (chatIsBusy(chatId)) return json({ error: "busy" }, 409);
  if (messageExists(userMessageId) || messageExists(replyId)) return json({ error: "duplicate" }, 409);

  saveTurn({
    profileId: auth.profile.id,
    chatId,
    title: parseTitle(body.title) ?? "New chat",
    modelId,
    userMessageId,
    replyId,
    text,
    attachments,
  });
  startReply(chatId, replyId, modelId, historyBefore(chatId, replyId));
  return followReply(replyId);
}
