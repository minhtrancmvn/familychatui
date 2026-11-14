import "server-only";

import { generateTitle } from "./ninerouter";
import { setGeneratedTitle, untitledFirstExchange } from "./repo";

/**
 * Names a chat from its first question and answer, once. Returns the new title, or null when the chat
 * already has one (generated or renamed by a person) or no model answered.
 */
export async function titleChat(chatId: string): Promise<string | null> {
  const exchange = untitledFirstExchange(chatId);
  if (!exchange) return null;
  const title = await generateTitle(exchange.user, exchange.assistant);
  if (!title) return null;
  return setGeneratedTitle(chatId, title) ? title : null;
}
