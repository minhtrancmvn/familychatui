import "server-only";

import { getModel } from "@/lib/models";
import type { ReplyEvent, Source } from "@/lib/types";

import { ninerouterApiKey, ninerouterBaseUrl } from "./env";
import type { HistoryMessage } from "./repo";

/** Talks to 9router server-side. The API key never reaches the browser. */

export interface Capabilities {
  search: boolean;
  vision: boolean;
}

const CAPS_TTL_MS = 5 * 60_000;
let capsCache: { at: number; byId: Map<string, Capabilities> } | null = null;

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${ninerouterApiKey()}`,
    "Content-Type": "application/json",
    // 9router's token savers (caveman, RTK, headroom) are on globally for coding tools. Caveman makes
    // replies terse fragments ("Yes. No see image.") and adds ~2k prompt tokens; the family gets plain replies.
    "x-9router-token-saver": "off",
  };
}

/** Live `capabilities` from /v1/models, cached for 5 minutes. Falls back to the catalog's flags if 9router is unreachable. */
export async function capabilitiesFor(modelId: string): Promise<Capabilities> {
  const now = Date.now();
  if (!capsCache || now - capsCache.at > CAPS_TTL_MS) {
    try {
      const res = await fetch(`${ninerouterBaseUrl()}/models`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Array<{ id: string; capabilities?: Partial<Capabilities> }> };
      const byId = new Map<string, Capabilities>();
      for (const m of body.data ?? []) {
        byId.set(m.id, { search: m.capabilities?.search === true, vision: m.capabilities?.vision === true });
      }
      capsCache = { at: now, byId };
    } catch (err) {
      console.warn("[9router] /models failed, using catalog capabilities:", (err as Error).message);
      if (capsCache) capsCache.at = now - CAPS_TTL_MS + 30_000; // retry in 30s
    }
  }
  const live = capsCache?.byId.get(modelId);
  if (live) return live;
  const model = getModel(modelId);
  return { search: model.search, vision: model.vision };
}

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are a helpful assistant in a private family chat app.",
    `Today's date is ${today}.`,
    "Always reply in the language of the user's latest message, even if earlier messages or these instructions use another language.",
    "Use Markdown when it helps: short paragraphs, lists, tables, fenced code blocks.",
  ].join(" ");
}

function textOf(m: HistoryMessage, vision: boolean): string {
  const parts = [m.content];
  for (const a of m.attachments) {
    if (a.kind === "file") parts.push(`Attached file "${a.name}":\n\`\`\`\n${a.data}\n\`\`\``);
    else if (!vision) parts.push(`[The user attached an image, "${a.name}", but this model can't see images.]`);
  }
  return parts.filter(Boolean).join("\n\n");
}

function images(m: HistoryMessage, vision: boolean): string[] {
  return vision ? m.attachments.filter((a) => a.kind === "image").map((a) => a.data) : [];
}

// ---------- SSE parsing ----------

/** Yields the `data:` payload of each server-sent event. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function failure(res: Response): Promise<Error> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { error?: { message?: string } | string };
      detail = typeof body.error === "string" ? body.error : (body.error?.message ?? text);
    } catch {
      detail = text;
    }
  } catch {
    // ignore
  }
  return new Error(`9router HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
}

function addSource(list: Source[], url: unknown, title: unknown): boolean {
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return false;
  if (list.some((s) => s.url === url)) return false;
  let label = typeof title === "string" && title.trim() ? title.trim() : "";
  if (!label) {
    try {
      label = new URL(url).hostname;
    } catch {
      return false;
    }
  }
  list.push({ url, title: label.slice(0, 200) });
  return true;
}

// ---------- /v1/responses (Codex models: structured web-search citations) ----------

async function* viaResponses(
  modelId: string,
  history: HistoryMessage[],
  caps: Capabilities,
  signal: AbortSignal,
): AsyncGenerator<ReplyEvent> {
  const input = history.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", content: m.content }
      : {
          role: "user",
          content: [
            { type: "input_text", text: textOf(m, caps.vision) || " " },
            ...images(m, caps.vision).map((url) => ({ type: "input_image", image_url: url })),
          ],
        },
  );
  const res = await fetch(`${ninerouterBaseUrl()}/responses`, {
    method: "POST",
    headers: headers(),
    signal,
    body: JSON.stringify({
      model: modelId,
      stream: true,
      instructions: systemPrompt(),
      input,
      ...(caps.search ? { tools: [{ type: "web_search" }] } : {}),
    }),
  });
  if (!res.ok || !res.body) throw await failure(res);

  const sources: Source[] = [];
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = String(event.type ?? "");
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
      yield { type: "delta", text: event.delta };
    } else if (type.startsWith("response.web_search_call.") && type !== "response.web_search_call.completed") {
      yield { type: "searching" };
    } else if (type === "response.output_text.annotation.added") {
      const a = event.annotation as { type?: string; url?: string; title?: string } | undefined;
      if (a?.type === "url_citation" && addSource(sources, a.url, a.title)) yield { type: "sources", sources: [...sources] };
    } else if (type === "response.completed") {
      // Some providers only report citations on the finished response.
      const output = ((event.response as { output?: unknown[] } | undefined)?.output ?? []) as Array<{
        content?: Array<{ annotations?: Array<{ type?: string; url?: string; title?: string }> }>;
      }>;
      let added = false;
      for (const item of output)
        for (const part of item.content ?? [])
          for (const a of part.annotations ?? []) if (a.type === "url_citation") added = addSource(sources, a.url, a.title) || added;
      if (added) yield { type: "sources", sources: [...sources] };
    } else if (type === "response.failed" || type === "error") {
      const err =
        (event.response as { error?: { message?: string } } | undefined)?.error?.message ??
        (event.error as { message?: string } | undefined)?.message ??
        (typeof event.message === "string" ? event.message : "the model failed");
      throw new Error(err);
    }
  }
}

// ---------- /v1/chat/completions (everything else) ----------

async function* viaChatCompletions(
  modelId: string,
  history: HistoryMessage[],
  caps: Capabilities,
  signal: AbortSignal,
): AsyncGenerator<ReplyEvent> {
  const messages = [
    { role: "system", content: systemPrompt() },
    ...history.map((m) => {
      const text = textOf(m, caps.vision);
      const pics = m.role === "user" ? images(m, caps.vision) : [];
      if (pics.length === 0) return { role: m.role, content: text };
      return {
        role: m.role,
        content: [
          ...(text ? [{ type: "text", text }] : []),
          ...pics.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      };
    }),
  ];
  const res = await fetch(`${ninerouterBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: headers(),
    signal,
    body: JSON.stringify({
      model: modelId,
      stream: true,
      messages,
      ...(caps.search ? { tools: [{ type: "web_search" }] } : {}),
    }),
  });
  if (!res.ok || !res.body) throw await failure(res);

  const sources: Source[] = [];
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break;
    let chunk: {
      error?: { message?: string };
      choices?: Array<{
        delta?: { content?: string | null; annotations?: Array<{ type?: string; url_citation?: { url?: string; title?: string } }> };
      }>;
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      continue;
    }
    if (chunk.error) throw new Error(chunk.error.message ?? "the model failed");
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.content) yield { type: "delta", text: delta.content };
    let added = false;
    for (const a of delta.annotations ?? [])
      if (a.type === "url_citation") added = addSource(sources, a.url_citation?.url, a.url_citation?.title) || added;
    if (added) yield { type: "sources", sources: [...sources] };
  }
}

// Fast, cheap models for chat titles, tried in order (DeepSeek Flash answers in ~1.3 s).
const TITLE_MODELS = ["ds/deepseek-flash", "9r-combo-light"];
const TITLE_PROMPT =
  "You name chat conversations. Reply with only a short title of at most 6 words for the conversation below, " +
  "in the same language as the user's message. No quotes, no emoji, no ending punctuation.";

function cleanTitle(raw: string): string | null {
  const line = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const title = line
    .replace(/^(title|tiêu đề)\s*:\s*/i, "")
    .replace(/^["'“”‘’`*#\s]+|["'“”‘’`*\s]+$/g, "")
    .replace(/[.。!?:;,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title || title.length > 120) return null;
  return title.length > 60 ? `${title.slice(0, 59).trimEnd()}…` : title;
}

/** A short title for a conversation, in its language. Null when no title model answered in time. */
export async function generateTitle(question: string, answer: string): Promise<string | null> {
  const conversation = `User: ${question.slice(0, 2000)}\n\nAssistant: ${answer.slice(0, 2000)}`;
  for (const model of TITLE_MODELS) {
    try {
      const res = await fetch(`${ninerouterBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: headers(),
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: 300,
          temperature: 0.3,
          messages: [
            { role: "system", content: TITLE_PROMPT },
            { role: "user", content: conversation },
          ],
        }),
      });
      if (!res.ok) throw await failure(res);
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
      const title = cleanTitle(body.choices?.[0]?.message?.content ?? "");
      if (title) return title;
    } catch (err) {
      console.warn(`[title] ${model}:`, (err as Error).message);
    }
  }
  return null;
}

/** Streams one reply. Codex models go through /v1/responses so web-search sources come back structured. */
export async function* streamReply(modelId: string, history: HistoryMessage[], signal: AbortSignal): AsyncGenerator<ReplyEvent> {
  const caps = await capabilitiesFor(modelId);
  if (modelId.startsWith("cx/")) yield* viaResponses(modelId, history, caps, signal);
  else yield* viaChatCompletions(modelId, history, caps, signal);
}
