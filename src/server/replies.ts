import "server-only";

import { getModel } from "@/lib/models";
import type { Attachment, MessageStatus, ReplyEvent, Source } from "@/lib/types";

import { type GeneratedImage, generateImage, streamReply } from "./ninerouter";
import { finishReply, getMessage, type HistoryMessage, imageRefsFor, messageAttachments, saveReplyProgress } from "./repo";
import { titleChat } from "./titles";

/**
 * Replies run on the server, detached from the HTTP request that started them: a phone that locks or
 * loses signal mid-reply gets the whole answer when it reconnects. Only Stop (or the time limit) ends one early.
 */

const SAVE_EVERY_MS = 2_000;
const PING_EVERY_MS = 15_000; // Cloudflare closes a proxied connection after 125s without bytes
const MAX_REPLY_MS = 10 * 60_000;

interface LiveReply {
  chatId: string;
  content: string;
  sources: Source[];
  searching: boolean;
  stop: AbortController;
  listeners: Set<(event: ReplyEvent) => void>;
}

const holder = globalThis as unknown as { __familychatReplies?: Map<string, LiveReply> };
const live = (holder.__familychatReplies ??= new Map<string, LiveReply>());

export function chatIsBusy(chatId: string): boolean {
  for (const reply of live.values()) if (reply.chatId === chatId) return true;
  return false;
}

/** The in-memory text of a reply that is still being written (newer than what was last saved). */
export function liveContent(replyId: string): { content: string; sources: Source[] } | null {
  const reply = live.get(replyId);
  return reply ? { content: reply.content, sources: reply.sources } : null;
}

/** Stops every reply still being written in a chat (the chat is being deleted). */
export function stopChatReplies(chatId: string): void {
  for (const reply of live.values()) if (reply.chatId === chatId) reply.stop.abort();
}

export function stopReply(replyId: string): boolean {
  const reply = live.get(replyId);
  if (!reply) return false;
  reply.stop.abort();
  return true;
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|socket/i.test(message)) return "Can't reach 9router right now.";
  return message.slice(0, 300);
}

// gpt-image models take prompts up to 32,000 characters.
const MAX_IMAGE_PROMPT = 32_000;

/** What to draw: the latest message, plus the text of any files attached to it. */
function imagePrompt(history: HistoryMessage[]): string {
  const question = history.findLast((m) => m.role === "user");
  if (!question) return "";
  const files = question.attachments.filter((a) => a.kind === "file").map((a) => `${a.name}:\n${a.data}`);
  return [question.content.trim(), ...files].filter(Boolean).join("\n\n").slice(0, MAX_IMAGE_PROMPT);
}

export function startReply(chatId: string, replyId: string, modelId: string, history: HistoryMessage[]): void {
  const reply: LiveReply = {
    chatId,
    content: "",
    sources: [],
    searching: false,
    stop: new AbortController(),
    listeners: new Set(),
  };
  live.set(replyId, reply);
  const emit = (event: ReplyEvent) => reply.listeners.forEach((listener) => listener(event));
  const timeout = AbortSignal.timeout(MAX_REPLY_MS);
  const signal = AbortSignal.any([reply.stop.signal, timeout]);

  void (async () => {
    let status: Exclude<MessageStatus, "streaming"> = "done";
    let error: string | undefined;
    let savedAt = Date.now();
    const images: GeneratedImage[] = [];
    try {
      if (getModel(modelId).image) {
        const prompt = imagePrompt(history);
        if (!prompt) throw new Error("Describe the picture you want.");
        images.push(await generateImage(modelId, prompt, imageRefsFor(chatId, replyId), signal));
      } else {
        for await (const event of streamReply(modelId, history, signal)) {
          if (event.type === "delta") {
            reply.content += event.text;
            reply.searching = false;
          } else if (event.type === "sources") {
            reply.sources = event.sources;
          } else if (event.type === "searching") {
            if (reply.searching) continue;
            reply.searching = true;
          }
          emit(event);
          if (Date.now() - savedAt > SAVE_EVERY_MS) {
            saveReplyProgress(replyId, reply.content);
            savedAt = Date.now();
          }
        }
      }
      if (!reply.content.trim() && images.length === 0) {
        status = "error";
        error = "The model sent an empty reply.";
      }
    } catch (err) {
      if (reply.stop.signal.aborted) {
        status = "stopped";
      } else if (timeout.aborted) {
        status = "error";
        error = "The reply took too long and was cut off.";
      } else {
        status = "error";
        error = friendlyError(err);
        console.error(`[reply ${replyId}] ${modelId}:`, err);
      }
    }
    let attachments: Attachment[] = [];
    try {
      attachments = finishReply(replyId, { content: reply.content, status, sources: reply.sources, error, images });
    } finally {
      live.delete(replyId);
      emit({ type: "done", status, error, ...(attachments.length ? { attachments } : {}) });
    }
    // After the first good reply, name the chat. The reply already shows as done meanwhile.
    if (status === "done") {
      try {
        const title = await titleChat(chatId);
        if (title) emit({ type: "title", title });
      } catch (err) {
        console.warn(`[title] chat ${chatId}:`, (err as Error).message);
      }
    }
    emit({ type: "end" });
  })();
}

/**
 * An SSE response that follows a reply: a snapshot of what exists so far, then live events until done.
 * Disconnecting only unsubscribes; the reply keeps going.
 */
export function followReply(replyId: string): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: ReplyEvent) => write(`data: ${JSON.stringify(event)}\n\n`);
      const close = () => {
        if (closed) return;
        cleanup();
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };

      const reply = live.get(replyId);
      if (!reply) {
        const saved = getMessage(replyId);
        const status = saved?.status === "streaming" || !saved ? "stopped" : saved.status;
        send({
          type: "snapshot",
          content: saved?.content ?? "",
          sources: saved?.sources ? (JSON.parse(saved.sources) as Source[]) : [],
          searching: false,
        });
        const attachments = saved ? messageAttachments(replyId) : [];
        send({ type: "done", status, error: saved?.error ?? undefined, ...(attachments.length ? { attachments } : {}) });
        close();
        return;
      }

      const listener = (event: ReplyEvent) => {
        send(event);
        if (event.type === "end") close();
      };
      const ping = setInterval(() => write(": ping\n\n"), PING_EVERY_MS);
      cleanup = () => {
        clearInterval(ping);
        reply.listeners.delete(listener);
      };
      reply.listeners.add(listener);
      send({ type: "snapshot", content: reply.content, sources: reply.sources, searching: reply.searching });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
