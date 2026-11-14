/**
 * Documents the server turns into text before they go to a model: PDFs with pdftotext, Office and
 * iWork files with headless LibreOffice (old binary formats included). Shared by browser and server.
 */

export type DocumentKind = "pdf" | "writer" | "calc" | "impress";

const KINDS: Record<string, DocumentKind> = {};
for (const ext of ["pdf"]) KINDS[ext] = "pdf";
for (const ext of ["doc", "docx", "docm", "dot", "dotx", "odt", "ott", "rtf", "wpd", "wps", "pages"]) KINDS[ext] = "writer";
for (const ext of ["xls", "xlsx", "xlsm", "xlsb", "ods", "ots", "numbers"]) KINDS[ext] = "calc";
for (const ext of ["ppt", "pptx", "pptm", "pps", "ppsx", "odp", "otp", "key"]) KINDS[ext] = "impress";

/** Largest document the server accepts (nginx allows 25 MB per request). */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function documentKind(name: string): DocumentKind | null {
  return KINDS[extensionOf(name)] ?? null;
}

/** For the file picker's `accept`. */
export const DOCUMENT_ACCEPT = Object.keys(KINDS)
  .map((ext) => `.${ext}`)
  .join(",");

/** Why the server couldn't read a document. */
export type ExtractErrorCode = "unsupported" | "too-big" | "empty" | "failed";
