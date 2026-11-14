import { DOCUMENT_ACCEPT, documentKind, type ExtractErrorCode, MAX_DOCUMENT_BYTES } from "./documents";
import type { OutgoingAttachment } from "./types";

/**
 * Turns picked files into what the server accepts: photos downscaled to JPEG data URLs (a phone photo
 * drops from ~4 MB to ~300 KB, which also keeps model token costs down), text files as their text,
 * PDFs and Office files as the text the server extracts from them.
 */

const MAX_IMAGE_SIDE = 1600;
const MAX_TEXT_BYTES = 200_000;
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|log|xml|ya?ml|html?)$/i;

export const ACCEPT = `image/*,.txt,.md,.csv,.tsv,.json,.log,.xml,.yaml,.yml,.html,${DOCUMENT_ACCEPT}`;

export function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/** PDF, Word, Excel, PowerPoint, OpenDocument, iWork: read on the server. */
export function isDocument(file: File): boolean {
  return documentKind(file.name) !== null;
}

export function isTextFile(file: File): boolean {
  return file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXTENSIONS.test(file.name);
}

export type FileCheck = "ok" | "unsupported" | "too-big";

export function checkFile(file: File): FileCheck {
  if (isImage(file)) return file.size > 30 * 1024 * 1024 ? "too-big" : "ok";
  if (isDocument(file)) return file.size > MAX_DOCUMENT_BYTES ? "too-big" : "ok";
  if (isTextFile(file)) return file.size > MAX_TEXT_BYTES ? "too-big" : "ok";
  return "unsupported";
}

/** Uploads a document and returns its text, or why it couldn't be read. */
export async function readDocument(file: File): Promise<{ text: string } | { error: ExtractErrorCode }> {
  try {
    const res = await fetch(`/api/attachments/extract?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    const body = (await res.json()) as { text?: string; error?: string };
    if (res.ok && body.text) return { text: body.text };
    const code = body.error;
    return { error: code === "unsupported" || code === "too-big" || code === "empty" ? code : "failed" };
  } catch {
    return { error: "failed" };
  }
}

async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  // JPEG has no transparency; paint white so transparent PNGs don't turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** `documentText`: what the server read from a PDF/Office file (see readDocument). */
export async function encodeAttachment(
  file: File,
  meta: { id: string; name: string },
  documentText?: string,
): Promise<OutgoingAttachment> {
  if (isImage(file)) {
    const data = await downscale(file);
    return { ...meta, kind: "image", size: file.size, mime: "image/jpeg", data };
  }
  const mime = file.type || "application/octet-stream";
  if (documentText !== undefined) return { ...meta, kind: "file", size: file.size, mime, data: documentText };
  return { ...meta, kind: "file", size: file.size, mime, data: await file.text() };
}
