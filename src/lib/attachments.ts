import { DOCUMENT_ACCEPT, documentKind, type ExtractErrorCode, extensionOf, MAX_DOCUMENT_BYTES } from "./documents";
import { notebookToText } from "./notebook";
import type { OutgoingAttachment } from "./types";

/**
 * Turns picked files into what the server accepts: photos downscaled to JPEG data URLs (a phone photo
 * drops from ~4 MB to ~300 KB, which also keeps model token costs down), text and code files as their
 * text, Jupyter notebooks as Markdown made here, PDFs and Office files as the text the server extracts.
 */

const MAX_IMAGE_SIDE = 1600;
const MAX_TEXT_BYTES = 200_000;
/** Same cut-off as documents read on the server (src/server/extract.ts). */
const MAX_NOTEBOOK_CHARS = 200_000;

/** Plain text, Markdown, data, config and source code: sent as they are. */
const TEXT_EXTENSIONS = new Set(
  [
    // text, Markdown, data
    "txt text md markdown mdx rst adoc org tex bib csv tsv json jsonl jsonc json5 log xml yaml yml toml ini cfg conf properties srt vtt diff patch",
    // web
    "html htm css scss sass less js mjs cjs jsx ts mts cts tsx vue svelte astro graphql gql",
    // Python, data science
    "py pyi pyw r rmd qmd jl sql",
    // other languages
    "c h cc cpp cxx hh hpp cs java kt kts scala groovy gradle go rs swift m mm rb php pl pm lua dart ex exs erl hs clj elm ml fs nim zig sol proto",
    // shell, build, infrastructure
    "sh bash zsh fish ps1 bat cmd mk cmake dockerfile tf hcl nix",
  ]
    .join(" ")
    .split(" "),
);

export const ACCEPT = [
  "image/*",
  ".ipynb",
  ...Array.from(TEXT_EXTENSIONS, (ext) => `.${ext}`),
  DOCUMENT_ACCEPT,
].join(",");

export function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

function isNotebook(file: File): boolean {
  return extensionOf(file.name) === "ipynb";
}

/**
 * Files read before they can be sent: PDF, Word, Excel, PowerPoint, OpenDocument and iWork on the
 * server, Jupyter notebooks here.
 */
export function isDocument(file: File): boolean {
  return documentKind(file.name) !== null || isNotebook(file);
}

export function isTextFile(file: File): boolean {
  return file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXTENSIONS.has(extensionOf(file.name));
}

export type FileCheck = "ok" | "unsupported" | "too-big";

export function checkFile(file: File): FileCheck {
  if (isImage(file)) return file.size > 30 * 1024 * 1024 ? "too-big" : "ok";
  if (isDocument(file)) return file.size > MAX_DOCUMENT_BYTES ? "too-big" : "ok";
  if (isTextFile(file)) return file.size > MAX_TEXT_BYTES ? "too-big" : "ok";
  return "unsupported";
}

async function readNotebook(file: File): Promise<{ text: string } | { error: ExtractErrorCode }> {
  let text: string;
  try {
    text = notebookToText(await file.text());
  } catch {
    return { error: "failed" };
  }
  if (!text.trim()) return { error: "empty" };
  if (text.length <= MAX_NOTEBOOK_CHARS) return { text };
  return { text: `${text.slice(0, MAX_NOTEBOOK_CHARS)}\n\n[… the rest of the notebook was cut off]` };
}

/** Returns a document's text (see isDocument), or why it couldn't be read. */
export async function readDocument(file: File): Promise<{ text: string } | { error: ExtractErrorCode }> {
  if (isNotebook(file)) return readNotebook(file);
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
