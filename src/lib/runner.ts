import { api, ApiError, errorFrom } from "./api";
import { hasModel } from "./models";
import { useAppStore } from "./store";
import type { Message, OutgoingAttachment, ReplyEvent } from "./types";
import { uid } from "./util";

/**
 * Streams replies outside React, so a reply keeps arriving while the user moves around the app.
 * The server keeps writing a reply even if this connection drops; we re-attach and pick up the rest.
 */

const followers = new Map<string, AbortController>();
const MAX_RECONNECTS = 40;

function findMessage(chatId: string, messageId: string): Message | undefined {
  return useAppStore
    .getState()
    .chats.find((c) => c.id === chatId)
    ?.messages.find((m) => m.id === messageId);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function readEvents(res: Response, onEvent: (event: ReplyEvent) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue; // ": ping" keep-alives
        try {
          onEvent(JSON.parse(line.slice(5)) as ReplyEvent);
        } catch {
          // ignore a malformed line
        }
      }
    }
  }
}

/** Applies server events to the reply until it's done, re-attaching after dropped connections. */
async function follow(chatId: string, replyId: string, open: (signal: AbortSignal) => Promise<Response>) {
  followers.get(replyId)?.abort();
  const controller = new AbortController();
  followers.set(replyId, controller);

  const patch = (p: Partial<Omit<Message, "id">>) => {
    if (!findMessage(chatId, replyId)) {
      controller.abort(); // chat deleted while the reply was arriving
      return;
    }
    useAppStore.getState().patchMessage(chatId, replyId, p);
  };

  let finished = false;
  const onEvent = (event: ReplyEvent) => {
    switch (event.type) {
      case "snapshot":
        patch({
          content: event.content,
          // An empty list means "searching" to the message view; undefined means no search.
          sources: event.sources.length ? event.sources : event.searching ? [] : undefined,
        });
        break;
      case "searching":
        if (!findMessage(chatId, replyId)?.sources) patch({ sources: [] });
        break;
      case "delta":
        patch({ content: (findMessage(chatId, replyId)?.content ?? "") + event.text });
        break;
      case "sources":
        patch({ sources: event.sources });
        break;
      case "done": {
        const current = findMessage(chatId, replyId);
        patch({
          status: event.status,
          error: event.error,
          sources: current?.sources?.length ? current.sources : undefined,
        });
        finished = true;
        break;
      }
      case "title":
        // The server named the chat after its first reply (the stream stays open briefly for this).
        useAppStore.getState().applyChatTitle(chatId, event.title);
        break;
      case "end":
        break;
    }
  };

  try {
    for (let attempt = 0; !finished && !controller.signal.aborted; attempt++) {
      try {
        const res = await open(controller.signal);
        if (!res.ok) {
          const err = await errorFrom(res);
          if (err.status === 401 || err.code === "no-profile") return;
          patch({ status: "error", error: err.code === "busy" ? "Another reply is still being written." : err.code });
          return;
        }
        await readEvents(res, onEvent);
      } catch {
        if (controller.signal.aborted) return;
      }
      if (finished || controller.signal.aborted) return;
      if (attempt >= MAX_RECONNECTS) {
        patch({ status: "error", error: "Lost the connection to the server." });
        return;
      }
      // Dropped before the end (phone slept, signal lost): wait, then re-attach to the same reply.
      await sleep(Math.min(1000 * (attempt + 1), 5000), controller.signal);
      open = (signal) => fetch(`/api/chats/${chatId}/messages/${replyId}/stream`, { signal, cache: "no-store" });
    }
  } finally {
    if (followers.get(replyId) === controller) followers.delete(replyId);
  }
}

function post(path: string, body: unknown) {
  return (signal: AbortSignal) =>
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
}

export function sendMessage(opts: { chatId: string; text: string; modelId: string; attachments: OutgoingAttachment[] }) {
  const { chatId, text, modelId, attachments } = opts;
  const state = useAppStore.getState();
  const chat = state.chats.find((c) => c.id === chatId);
  const now = Date.now();
  const userMessageId = uid();
  const replyId = uid();
  state.addMessage(chatId, {
    id: userMessageId,
    role: "user",
    content: text,
    modelId,
    createdAt: now,
    status: "done",
    // Only name/size stay in the browser; the contents go to the server.
    attachments: attachments.length ? attachments.map(({ id, name, size, kind }) => ({ id, name, size, kind })) : undefined,
  });
  state.addMessage(chatId, { id: replyId, role: "assistant", content: "", modelId, createdAt: now + 1, status: "streaming" });
  void follow(
    chatId,
    replyId,
    post(`/api/chats/${chatId}/messages`, { userMessageId, replyId, text, modelId, attachments, title: chat?.title }),
  );
}

/** Rewrites an assistant reply, optionally with a different model ("Retry with…"). */
export function regenerate(chatId: string, messageId: string, modelId?: string) {
  const state = useAppStore.getState();
  const message = findMessage(chatId, messageId);
  if (!message) return;
  const useModel = modelId ?? (hasModel(message.modelId) ? message.modelId : state.settings.defaultModelId);
  state.patchMessage(chatId, messageId, { content: "", status: "streaming", modelId: useModel, sources: undefined, error: undefined });
  state.setChatModel(chatId, useModel);
  void follow(chatId, messageId, post(`/api/chats/${chatId}/messages/${messageId}/regenerate`, { modelId: useModel }));
}

/** Re-attaches to replies that were still being written when the chat was loaded (reload, other device). */
export function resumeStreaming(chatId: string) {
  const chat = useAppStore.getState().chats.find((c) => c.id === chatId);
  for (const m of chat?.messages ?? []) {
    if (m.status === "streaming" && !followers.has(m.id)) {
      void follow(chatId, m.id, (signal) =>
        fetch(`/api/chats/${chatId}/messages/${m.id}/stream`, { signal, cache: "no-store" }),
      );
    }
  }
}

/** The Stop button: the server ends the reply and the stream reports it as stopped. */
export function stopReply(chatId: string, messageId: string) {
  api(`/api/chats/${chatId}/messages/${messageId}/stop`, { body: {} }).catch((err: unknown) => {
    if (!(err instanceof ApiError)) console.warn("Stop failed:", err);
  });
}
