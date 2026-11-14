"use client";

import clsx from "clsx";
import { ChevronDown, FileText, Globe, ImageIcon, RefreshCw } from "lucide-react";
import { useState } from "react";

import { ModelAvatar } from "@/components/avatars";
import { CopyButton, Markdown } from "@/components/markdown";
import { ModelMenu } from "@/components/model-menu";
import { Popover } from "@/components/popover";
import { getModel } from "@/lib/models";
import { useT } from "@/lib/i18n";
import { regenerate } from "@/lib/runner";
import type { Message } from "@/lib/types";
import { formatBytes } from "@/lib/util";

function TypingDots() {
  const t = useT();
  return (
    <span className="inline-flex h-6 items-center gap-1" role="status" aria-label={t("msg.thinking")}>
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="typing-dot size-1.5 rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

function Searching() {
  const t = useT();
  return (
    <span role="status" className="inline-flex h-6 items-center gap-2 text-sm text-muted">
      <Globe className="size-4 animate-pulse" />
      {t("search.searching")}…
    </span>
  );
}

function SourceList({ message }: { message: Message }) {
  const t = useT();
  if (!message.sources?.length) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-xs font-medium text-muted">{t("search.sources")}</div>
      <ul className="flex flex-wrap gap-1.5">
        {message.sources.map((s, i) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-9 max-w-64 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs hover:bg-surface-2"
            >
              <span className="font-medium text-muted">{i + 1}</span>
              <span className="truncate">{s.title}</span>
              <span className="shrink-0 text-muted">{new URL(s.url).hostname}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttachmentChips({ message }: { message: Message }) {
  if (!message.attachments?.length) return null;
  return (
    <ul className="flex flex-wrap justify-end gap-1.5">
      {message.attachments.map((a) => (
        <li key={a.id} className="flex max-w-56 items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs">
          {a.kind === "image" ? <ImageIcon className="size-4 shrink-0 text-muted" /> : <FileText className="size-4 shrink-0 text-muted" />}
          <span className="truncate font-medium">{a.name}</span>
          <span className="shrink-0 text-muted">{formatBytes(a.size)}</span>
        </li>
      ))}
    </ul>
  );
}

const actionClass =
  "inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted transition-[color,background-color,transform] hover:bg-surface-2 hover:text-text active:scale-[0.97] md:h-8 md:px-2";

export function ChatMessage({ chatId, message, isLatest }: { chatId: string; message: Message; isLatest: boolean }) {
  const t = useT();
  const [retryOpen, setRetryOpen] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <AttachmentChips message={message} />
        {message.content && (
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[22px] rounded-br-md bg-bubble-user px-4 py-2.5 text-[15px] leading-6 text-bubble-user-fg">
            {message.content}
          </div>
        )}
      </div>
    );
  }

  const model = getModel(message.modelId);
  const streaming = message.status === "streaming";

  return (
    <div className="group flex gap-3">
      <ModelAvatar model={model} size={32} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{model.name}</span>
          {message.sources?.length && message.content ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              <Globe className="size-3" />
              {t("search.searched")}
            </span>
          ) : null}
        </div>
        <div className="inline-block max-w-full rounded-[22px] rounded-tl-md bg-bubble-bot px-4 py-3 text-[15px]">
          {message.content ? (
            <Markdown text={message.content} streaming={streaming} />
          ) : streaming ? (
            message.sources ? <Searching /> : <TypingDots />
          ) : (
            <span className="text-muted">{t("msg.empty")}</span>
          )}
        </div>
        {message.content && <SourceList message={message} />}
        {message.status === "stopped" && <div className="mt-1 text-xs text-muted">{t("msg.stopped")}</div>}
        {message.status === "error" && (
          <div className="mt-1 text-xs text-danger">
            {t("msg.error")}
            {message.error && <span className="mt-0.5 block break-words text-muted">{message.error}</span>}
          </div>
        )}

        {!streaming && (
          <div
            className={clsx(
              "mt-1 flex flex-wrap items-center gap-0.5",
              // Older replies show actions on hover (desktop); the latest always shows them.
              !isLatest && "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100",
            )}
          >
            <CopyButton text={message.content} className={actionClass} />
            {isLatest && (
              <>
                <button type="button" className={actionClass} onClick={() => regenerate(chatId, message.id)}>
                  <RefreshCw className="size-3.5" />
                  {t("msg.regenerate")}
                </button>
                <Popover
                  open={retryOpen}
                  onOpenChange={setRetryOpen}
                  className="bottom-full left-0 mb-1"
                  trigger={
                    <button
                      type="button"
                      className={actionClass}
                      aria-haspopup="menu"
                      aria-expanded={retryOpen}
                      onClick={() => setRetryOpen((v) => !v)}
                    >
                      {t("msg.retryWith")}
                      <ChevronDown className="size-3.5" />
                    </button>
                  }
                >
                  <ModelMenu
                    title={t("msg.retryTitle")}
                    selectedId={message.modelId}
                    onSelect={(id) => {
                      setRetryOpen(false);
                      regenerate(chatId, message.id, id);
                    }}
                  />
                </Popover>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
