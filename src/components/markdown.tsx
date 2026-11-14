"use client";

import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { type ComponentProps, useState } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { copyText } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

interface HastLike {
  type: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastLike[];
}

function textOf(node: HastLike | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className={clsx("inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:text-white", className)}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? t("copied") : t("copy")}
    </button>
  );
}

function CodeBlock({ node, children }: ComponentProps<"pre"> & ExtraProps) {
  const code = (node as unknown as HastLike | undefined)?.children?.[0];
  const classes = code?.properties?.className;
  const lang = Array.isArray(classes)
    ? classes
        .map(String)
        .find((c) => c.startsWith("language-"))
        ?.slice("language-".length)
    : undefined;
  return (
    <div className="my-3 overflow-hidden rounded-xl bg-[#0d1117] text-left">
      <div className="flex items-center justify-between bg-[#161b22] px-3 py-1.5 text-xs text-zinc-400">
        <span className="font-mono">{lang ?? "code"}</span>
        <CopyButton text={textOf(code)} />
      </div>
      <pre className="overflow-x-auto">{children}</pre>
    </div>
  );
}

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={clsx("md", streaming && "streaming")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: CodeBlock,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
