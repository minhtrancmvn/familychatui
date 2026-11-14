import "server-only";

import { CHAT_RETENTION_DAYS } from "@/lib/config";

import { stopChatReplies } from "./replies";
import { deleteChatsInactiveSince } from "./repo";

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/** Deletes every chat with no new message for CHAT_RETENTION_DAYS, except those kept forever. */
export function sweepInactiveChats(now = Date.now()): number {
  const ids = deleteChatsInactiveSince(now - CHAT_RETENTION_DAYS * DAY_MS);
  ids.forEach(stopChatReplies);
  if (ids.length) console.log(`[cleanup] deleted ${ids.length} chat(s) with no new message for ${CHAT_RETENTION_DAYS} days`);
  return ids.length;
}

/** Sweeps once at startup, then every hour. Called from src/instrumentation.ts. */
export function startCleanup(): void {
  const holder = globalThis as unknown as { __familychatCleanup?: ReturnType<typeof setInterval> };
  if (holder.__familychatCleanup) return;
  const run = () => {
    try {
      sweepInactiveChats();
    } catch (err) {
      console.error("[cleanup] failed:", err);
    }
  };
  console.log(`[cleanup] deleting chats with no new message for ${CHAT_RETENTION_DAYS} days (now and hourly)`);
  run();
  holder.__familychatCleanup = setInterval(run, SWEEP_EVERY_MS);
  holder.__familychatCleanup.unref?.();
}
