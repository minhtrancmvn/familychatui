/**
 * Rewrites the math notations models use into the one form remark-math reads (`$$`), so KaTeX can draw it.
 *
 * - `\[…\]` and `$$…$$` are display math. On lines of their own they become a `$$` block; in the middle of a
 *   sentence they become inline math drawn at display size.
 * - `\(…\)` and `$…$` are inline math. A single `$` pair only counts under Pandoc's rule (no space just inside
 *   the dollars, no digit right after the closing one), so prices like "$5 and $10" stay text.
 * - Every other `$` is escaped, because remark-math must never see a dollar this function didn't place.
 * - Inside math, a bare `$` or `%` means a dollar or percent sign. GPT writes `\frac{$1.89}{$10.1}` and
 *   `\boxed{18.71%}`; KaTeX fails on the `$` and reads `%` as the start of a comment.
 *
 * Fenced code and code spans are left alone. A math opener with no closer yet (a reply still streaming) stays text.
 */
export function prepareMath(markdown: string): string {
  if (!/[$\\]/.test(markdown)) return markdown;
  const out: string[] = [];
  let prose: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    if (fence) {
      out.push(line);
      const t = line.trim();
      if (t.length >= fence.length && t === fence[0].repeat(t.length)) fence = null;
      continue;
    }
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (open) {
      if (prose.length) out.push(convertProse(prose.join("\n")));
      prose = [];
      fence = open[1];
      out.push(line);
      continue;
    }
    prose.push(line);
  }
  if (prose.length) out.push(convertProse(prose.join("\n")));
  return out.join("\n");
}

const BLANK_LINE = /\n[ \t]*\n/;

function convertProse(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      // A code span ends at the next backtick run of the same length; without one, the backticks are text.
      const run = /^`+/.exec(text.slice(i))![0];
      const close = findRun(text, i + run.length, run);
      const end = close < 0 ? i + run.length : close + run.length;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (c === "\\") {
      const next = text[i + 1];
      if (next === "[" || next === "(") {
        const end = text.indexOf(next === "[" ? "\\]" : "\\)", i + 2);
        if (end >= 0 && !BLANK_LINE.test(text.slice(i + 2, end))) {
          out += math(text, i, end + 2, text.slice(i + 2, end), next === "[");
          i = end + 2;
          continue;
        }
      }
      // Any other escape stays as written, together with the character it escapes.
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "$") {
      if (text[i + 1] === "$") {
        const end = text.indexOf("$$", i + 2);
        if (end >= 0 && !BLANK_LINE.test(text.slice(i + 2, end))) {
          out += math(text, i, end + 2, text.slice(i + 2, end), true);
          i = end + 2;
          continue;
        }
        out += "\\$\\$";
        i += 2;
        continue;
      }
      const end = closingDollar(text, i);
      if (end >= 0) {
        out += math(text, i, end + 1, text.slice(i + 1, end), false);
        i = end + 1;
        continue;
      }
      out += "\\$";
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Index of the next backtick run exactly as long as `run`, or -1. */
function findRun(text: string, from: number, run: string): number {
  const re = /`+/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0].length === run.length) return m.index;
  }
  return -1;
}

/** Pandoc's rule for `$…$` on one line: the closing `$` follows a non-space and is not followed by a digit. */
function closingDollar(text: string, open: number): number {
  const first = text[open + 1];
  if (first === undefined || /\s|\$/.test(first)) return -1;
  for (let j = open + 1; j < text.length && text[j] !== "\n"; j++) {
    if (text[j] === "\\") {
      j += 1;
      continue;
    }
    if (text[j] === "$" && !/\s/.test(text[j - 1]) && !/\d/.test(text[j + 1] ?? "")) return j;
  }
  return -1;
}

/** Bare `$` and `%` become signs; escapes such as `\$`, `\%` and `\\` are kept as they are. */
function escapeTex(tex: string): string {
  return tex.replace(/\\[\s\S]|[$%]/g, (m) => (m.length === 2 ? m : `\\${m}`));
}

function math(text: string, start: number, end: number, body: string, display: boolean): string {
  const tex = escapeTex(body.trim());
  if (!tex) return "";
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const indent = text.slice(lineStart, start);
  const lineEnd = text.indexOf("\n", end);
  const rest = text.slice(end, lineEnd < 0 ? text.length : lineEnd);
  if (display && !indent.trim() && !rest.trim()) {
    // A block of its own. The indent (already written) keeps it inside a list item.
    const lines = tex.split("\n").map((l) => (l.startsWith(indent) ? l : indent + l.trimStart()));
    return `$$\n${lines.join("\n")}\n${indent}$$`;
  }
  return `$$ ${display ? "\\displaystyle " : ""}${tex.replace(/\s*\n\s*/g, " ")} $$`;
}
