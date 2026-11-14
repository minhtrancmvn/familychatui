import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { documentKind, type ExtractErrorCode, extensionOf } from "@/lib/documents";

/**
 * Turns an uploaded document into plain text for the model. PDFs: pdftotext (poppler). Word-like
 * files: LibreOffice to UTF-8 text. Spreadsheets: LibreOffice to CSV, every sheet. Presentations:
 * LibreOffice to PDF, then pdftotext, one section per slide. LibreOffice runs one file at a time,
 * because each run needs 150-250 MB on a 2 GB host.
 */

const MAX_TEXT_CHARS = 200_000;
const SOFFICE_TIMEOUT_MS = 120_000;
const PDFTOTEXT_TIMEOUT_MS = 60_000;
// Every sheet as its own CSV: comma, double quote, UTF-8, ..., sheet number -1 = all sheets (LibreOffice 7.2+).
const CSV_ALL_SHEETS = "csv:Text - txt - csv (StarCalc):44,34,UTF8,1,,0,false,true,false,false,false,-1";

export class ExtractError extends Error {
  constructor(readonly code: ExtractErrorCode) {
    super(code);
  }
}

function run(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${path.basename(cmd)} failed: ${err.message} ${String(stderr).slice(0, 300)}`));
      else resolve(stdout);
    });
  });
}

function sofficeBin(): string {
  if (process.env.SOFFICE_BIN) return process.env.SOFFICE_BIN;
  const mac = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
  return existsSync(mac) ? mac : "soffice";
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs LibreOffice jobs one after another. */
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

async function soffice(dir: string, input: string, convertTo: string): Promise<string> {
  const out = path.join(dir, "out");
  await run(
    sofficeBin(),
    [
      // A private profile per run: no lock clashes, nothing left in the service user's home.
      `-env:UserInstallation=file://${path.join(dir, "profile")}`,
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--convert-to",
      convertTo,
      "--outdir",
      out,
      input,
    ],
    SOFFICE_TIMEOUT_MS,
  );
  return out;
}

function pdfToText(file: string): Promise<string> {
  return run("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], PDFTOTEXT_TIMEOUT_MS);
}

async function writerText(dir: string, input: string): Promise<string> {
  const out = await soffice(dir, input, "txt:Text (encoded):UTF8");
  return readFile(path.join(out, "input.txt"), "utf8");
}

async function calcText(dir: string, input: string): Promise<string> {
  const out = await soffice(dir, input, CSV_ALL_SHEETS);
  const files = (await readdir(out)).filter((f) => f.endsWith(".csv")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const parts: string[] = [];
  for (const file of files) {
    // input-<Sheet name>.csv, or input.csv for a single sheet
    const sheet = file.replace(/^input-?/, "").replace(/\.csv$/, "") || "Sheet";
    const csv = (await readFile(path.join(out, file), "utf8")).replace(/(,*\r?\n)+$/, "\n");
    if (csv.replace(/[,\s"]/g, "")) parts.push(`## Sheet: ${sheet}\n${csv}`);
  }
  return parts.join("\n");
}

async function impressText(dir: string, input: string): Promise<string> {
  const out = await soffice(dir, input, "pdf");
  const pages = (await pdfToText(path.join(out, "input.pdf"))).split("\f");
  return pages
    .map((page, i) => (page.trim() ? `## Slide ${i + 1}\n${page.trim()}` : ""))
    .filter(Boolean)
    .join("\n\n");
}

function tidy(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function extractText(name: string, bytes: Uint8Array): Promise<{ text: string; truncated: boolean }> {
  const kind = documentKind(name);
  if (!kind) throw new ExtractError("unsupported");
  const dir = await mkdtemp(path.join(tmpdir(), "familychat-doc-"));
  try {
    const input = path.join(dir, `input.${extensionOf(name)}`);
    await writeFile(input, bytes);
    let raw: string;
    try {
      if (kind === "pdf") raw = await pdfToText(input);
      else raw = await oneAtATime(() => (kind === "writer" ? writerText : kind === "calc" ? calcText : impressText)(dir, input));
    } catch (err) {
      console.error(`[extract] ${name}:`, (err as Error).message);
      throw new ExtractError("failed");
    }
    const text = tidy(raw);
    if (!text) throw new ExtractError("empty");
    if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
    return { text: `${text.slice(0, MAX_TEXT_CHARS)}\n\n[… the rest of the document was cut off]`, truncated: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
