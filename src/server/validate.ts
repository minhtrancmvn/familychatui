import "server-only";

import type { Lang, OutgoingAttachment, ProfileInput } from "@/lib/types";

/** Checks request bodies. Each parser returns the clean value, or a string saying what's wrong. */

export const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_DATA_URL = 8 * 1024 * 1024;
const MAX_TEXT_FILE_CHARS = 300_000;
const MAX_MESSAGE_CHARS = 100_000;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(value);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "vi";
}

export function parseProfileInput(body: Record<string, unknown>): ProfileInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 20) return "name must be 1-20 characters";
  const emoji = typeof body.emoji === "string" ? body.emoji : "";
  if (!emoji || emoji.length > 16) return "bad emoji";
  const color = typeof body.color === "string" ? body.color : "";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return "bad color";
  if (!isLang(body.language)) return "bad language";
  const pin = body.pin;
  if (pin !== undefined && pin !== null && !(typeof pin === "string" && /^\d{4}$/.test(pin))) return "PIN must be 4 digits";
  return { name, emoji, color, language: body.language, pin: pin as string | null | undefined };
}

export function parseText(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_MESSAGE_CHARS) return null;
  return value.trim();
}

export function parseTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/\s+/g, " ").trim();
  return title && title.length <= 120 ? title : null;
}

export function parseAttachments(value: unknown): OutgoingAttachment[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return `at most ${MAX_ATTACHMENTS} attachments`;
  const result: OutgoingAttachment[] = [];
  for (const raw of value as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== "object" || !isId(raw.id)) return "bad attachment";
    const name = typeof raw.name === "string" ? raw.name.slice(0, 200) : "file";
    const data = typeof raw.data === "string" ? raw.data : "";
    const mime = typeof raw.mime === "string" ? raw.mime.slice(0, 100) : "";
    if (raw.kind === "image") {
      if (data.length > MAX_IMAGE_DATA_URL || !IMAGE_DATA_URL.test(data)) return `image "${name}" is too big or not an image`;
    } else if (raw.kind === "file") {
      if (data.length > MAX_TEXT_FILE_CHARS) return `file "${name}" is too long`;
    } else {
      return "bad attachment kind";
    }
    const size = typeof raw.size === "number" && raw.size >= 0 ? Math.round(raw.size) : data.length;
    result.push({ id: raw.id, name, size, kind: raw.kind, mime: mime || (raw.kind === "image" ? "image/jpeg" : "text/plain"), data });
  }
  return result;
}
