import type { NextRequest } from "next/server";

import { documentKind, MAX_DOCUMENT_BYTES } from "@/lib/documents";
import { ExtractError, extractText } from "@/server/extract";
import { json, requireProfile } from "@/server/session";

/**
 * Reads a PDF or Office file and returns its text, which the browser then attaches to the message.
 * Body: the raw file (application/octet-stream). Query: ?name=<file name>.
 */
export async function POST(req: NextRequest) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const name = (req.nextUrl.searchParams.get("name") ?? "").slice(0, 200);
  if (!documentKind(name)) return json({ error: "unsupported" }, 415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES) return json({ error: "too-big" }, 413);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return json({ error: "too-big" }, 413);
  if (bytes.byteLength === 0) return json({ error: "empty" }, 422);
  try {
    return json(await extractText(name, bytes));
  } catch (err) {
    if (err instanceof ExtractError) return json({ error: err.code }, err.code === "unsupported" ? 415 : 422);
    throw err;
  }
}
