import { fenced } from "./util";

/**
 * Jupyter notebooks (.ipynb) are JSON, often padded with base64 plots. The browser turns them into
 * Markdown before sending: Markdown cells as they are, code cells as code blocks, and the text each
 * cell printed. Pictures are left out, and long outputs keep only their start and end.
 */

const OUTPUT_KEEP = 1_000;

type Text = string | string[] | undefined;

interface Output {
  output_type?: string;
  text?: Text;
  data?: Record<string, Text>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

interface Cell {
  cell_type?: string;
  source?: Text;
  outputs?: Output[];
  execution_count?: number | null;
}

interface Notebook {
  cells?: Cell[];
  metadata?: { language_info?: { name?: string }; kernelspec?: { language?: string } };
}

function joined(text: Text): string {
  return (Array.isArray(text) ? text.join("") : (text ?? "")).trimEnd();
}

/** Training logs and tracebacks can run for pages; the start and the end say the most. */
function shortened(text: string): string {
  if (text.length <= OUTPUT_KEEP * 2) return text;
  const cut = text.length - OUTPUT_KEEP * 2;
  return `${text.slice(0, OUTPUT_KEEP)}\n[… ${cut} characters cut …]\n${text.slice(-OUTPUT_KEEP)}`;
}

function outputText(out: Output): string {
  if (out.output_type === "stream") return joined(out.text);
  if (out.output_type === "error") {
    // Tracebacks carry terminal colour codes.
    const trace = (out.traceback ?? []).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    return trace.trim() || `${out.ename ?? "Error"}: ${out.evalue ?? ""}`;
  }
  const data = out.data ?? {};
  if (Object.keys(data).some((type) => type.startsWith("image/"))) return "[picture, not included]";
  return joined(data["text/plain"]);
}

/** Throws when `raw` isn't a notebook. */
export function notebookToText(raw: string): string {
  const notebook = JSON.parse(raw) as Notebook;
  if (!notebook || !Array.isArray(notebook.cells)) throw new Error("not a Jupyter notebook");
  const lang = notebook.metadata?.language_info?.name ?? notebook.metadata?.kernelspec?.language ?? "";
  const parts: string[] = [];
  for (const cell of notebook.cells) {
    const source = joined(cell.source);
    if (cell.cell_type !== "code") {
      if (source) parts.push(source);
      continue;
    }
    const outputs = (cell.outputs ?? []).map(outputText).filter(Boolean);
    if (!source && outputs.length === 0) continue;
    const label = typeof cell.execution_count === "number" ? `In [${cell.execution_count}]:\n` : "";
    parts.push(label + fenced(source, lang));
    for (const out of outputs) parts.push(`Output:\n${fenced(shortened(out))}`);
  }
  return parts.join("\n\n");
}
