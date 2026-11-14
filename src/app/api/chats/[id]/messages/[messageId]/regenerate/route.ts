import type { NextRequest } from "next/server";

import { hasModel } from "@/lib/models";
import { chatIsBusy, followReply, startReply } from "@/server/replies";
import { chatOwner, getMessage, historyBefore, resetReply } from "@/server/repo";
import { json, requireProfile } from "@/server/session";
import { readJson } from "@/server/validate";

/** Writes a reply again, optionally with another model ("Retry with…"). Streams like a new message. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/chats/[id]/messages/[messageId]/regenerate">) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { id: chatId, messageId } = await ctx.params;
  const { modelId } = await readJson(req);

  if (chatOwner(chatId) !== auth.profile.id) return json({ error: "not-found" }, 404);
  const message = getMessage(messageId);
  if (!message || message.chat_id !== chatId || message.role !== "assistant") return json({ error: "not-found" }, 404);
  const useModel = typeof modelId === "string" ? modelId : message.model_id;
  if (!hasModel(useModel)) return json({ error: "unknown-model" }, 400);
  if (chatIsBusy(chatId)) return json({ error: "busy" }, 409);

  resetReply(chatId, messageId, useModel);
  startReply(chatId, messageId, useModel, historyBefore(chatId, messageId));
  return followReply(messageId);
}
