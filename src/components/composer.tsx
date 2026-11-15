"use client";

import clsx from "clsx";
import { ArrowUp, ChevronDown, FileText, LoaderCircle, Paperclip, Square, X } from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, useEffect, useEffectEvent, useRef, useState } from "react";

import { ModelAvatar } from "@/components/avatars";
import { ModelMenu } from "@/components/model-menu";
import { Popover } from "@/components/popover";
import { IconButton, PRESS } from "@/components/ui";
import { ACCEPT, checkFile, encodeAttachment, isDocument, readDocument } from "@/lib/attachments";
import { useT } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import { getModel } from "@/lib/models";
import { useAppStore, useVisibleModels } from "@/lib/store";
import type { Attachment, OutgoingAttachment } from "@/lib/types";
import { formatBytes, uid } from "@/lib/util";

interface Draft {
  attachment: Attachment;
  file: File;
  previewUrl?: string;
  /** PDFs/Office files are read on the server as soon as they're attached. */
  reading?: boolean;
  documentText?: string;
}

const MAX_ATTACHMENTS = 5;
const MENTION = /(^|\s)@([^\s@]*)$/;

export function Composer({
  modelId,
  onModelChange,
  onSend,
  streaming = false,
  onStop,
  placeholder,
  autoFocus = false,
}: {
  modelId: string;
  onModelChange: (id: string) => void;
  onSend: (text: string, attachments: OutgoingAttachment[]) => void;
  streaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const t = useT();
  const enterToSend = useAppStore((s) => s.settings.enterToSend);
  const models = useVisibleModels();
  const model = getModel(modelId);

  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(false);
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());

  // Focus on desktop only; on phones it would pop the keyboard over the conversation.
  useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 768px)").matches) textareaRef.current?.focus();
  }, [autoFocus]);

  // Drop files anywhere on the page to attach them (desktop). The overlay shows while files hover.
  const onDropFiles = useEffectEvent((files: FileList) => addFiles(files));
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // otherwise the browser opens the file instead of dropping it here
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) onDropFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Free image previews when the composer goes away.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const mentionMatch = MENTION.exec(text.slice(0, caret));
  const mentionQuery = mentionMatch && !mentionDismissed ? mentionMatch[2].toLowerCase() : null;
  const mentionOptions =
    mentionQuery === null
      ? []
      : models
          .filter((m) => m.name.toLowerCase().replace(/\s+/g, "").includes(mentionQuery) || m.id.includes(mentionQuery))
          .slice(0, 6);
  const mentionOpen = mentionOptions.length > 0;
  const activeMention = Math.min(mentionIndex, Math.max(0, mentionOptions.length - 1));
  const blindToImages = !model.vision && drafts.some((d) => d.attachment.kind === "image");
  const reading = drafts.some((d) => d.reading);
  const canSend = !streaming && !encoding && !reading && !blindToImages && (text.trim().length > 0 || drafts.length > 0);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }

  function pickMention(id: string) {
    if (!mentionMatch) return;
    const start = caret - mentionMatch[2].length - 1;
    const next = text.slice(0, start) + text.slice(caret);
    setText(next);
    setCaret(start);
    setMentionIndex(0);
    track("model_switch", { model: id, via: "mention" });
    onModelChange(id);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(start, start);
      resize();
    });
  }

  function removeDraft(id: string) {
    setDrafts((list) => {
      const found = list.find((d) => d.attachment.id === id);
      if (found?.previewUrl) {
        URL.revokeObjectURL(found.previewUrl);
        objectUrls.current.delete(found.previewUrl);
      }
      return list.filter((d) => d.attachment.id !== id);
    });
  }

  function readInBackground(draft: Draft) {
    void readDocument(draft.file).then((result) => {
      const id = draft.attachment.id;
      if ("text" in result) {
        setDrafts((list) => list.map((d) => (d.attachment.id === id ? { ...d, reading: false, documentText: result.text } : d)));
        return;
      }
      setDrafts((list) => list.filter((d) => d.attachment.id !== id));
      const name = draft.attachment.name;
      const reasons = { "too-big": "too_big", empty: "no_text", unsupported: "unsupported", failed: "read_failed" } as const;
      track("attachment_rejected", { reason: reasons[result.error] });
      setNotice(
        result.error === "too-big"
          ? t("composer.tooBig", { name })
          : result.error === "empty"
            ? t("composer.noText", { name })
            : result.error === "unsupported"
              ? t("composer.unsupported")
              : t("composer.readFailed", { name }),
      );
    });
  }

  function addFiles(files: FileList | File[]) {
    setNotice(null);
    const next: Draft[] = [];
    for (const file of Array.from(files).slice(0, Math.max(0, MAX_ATTACHMENTS - drafts.length))) {
      const name = file.name || "pasted-image.png";
      const check = checkFile(file);
      if (check !== "ok") {
        track("attachment_rejected", { reason: check === "too-big" ? "too_big" : "unsupported" });
        setNotice(check === "too-big" ? t("composer.tooBig", { name }) : t("composer.unsupported"));
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
      if (previewUrl) objectUrls.current.add(previewUrl);
      next.push({
        attachment: { id: uid(), name, size: file.size, kind: isImage ? "image" : "file" },
        file,
        previewUrl,
        reading: !isImage && isDocument(file),
      });
    }
    setDrafts((list) => [...list, ...next].slice(0, MAX_ATTACHMENTS));
    next.filter((d) => d.reading).forEach(readInBackground);
  }

  async function submit() {
    if (!canSend) return;
    let attachments: OutgoingAttachment[] = [];
    if (drafts.length > 0) {
      setEncoding(true);
      try {
        attachments = await Promise.all(drafts.map((d) => encodeAttachment(d.file, d.attachment, d.documentText)));
      } catch {
        setNotice(t("composer.unsupported"));
        return;
      } finally {
        setEncoding(false);
      }
    }
    onSend(text.trim(), attachments);
    // The browser keeps only name/size of sent attachments, so previews can go.
    drafts.forEach((d) => {
      if (d.previewUrl) {
        URL.revokeObjectURL(d.previewUrl);
        objectUrls.current.delete(d.previewUrl);
      }
    });
    setDrafts([]);
    setNotice(null);
    setText("");
    setCaret(0);
    requestAnimationFrame(resize);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return; // Vietnamese/IME input: Enter confirms the word, not the message.
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((activeMention + 1) % mentionOptions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((activeMention - 1 + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mentionOptions[activeMention].id);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (enterToSend && !e.shiftKey))) {
      e.preventDefault();
      void submit();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  return (
    <div className="relative">
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-3xl border-4 border-dashed border-accent bg-bg/85 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <Paperclip className="size-8 text-accent-text" />
            <p className="text-lg font-semibold">{t("composer.drop")}</p>
            <p className="text-sm text-muted">{t("composer.dropHint")}</p>
          </div>
        </div>
      )}
      {mentionOpen && (
        <div
          role="listbox"
          aria-label={t("composer.switchFor")}
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,100%)] rounded-2xl border border-border bg-surface p-1.5 shadow-xl"
        >
          <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted">{t("composer.switchFor")}</div>
          {mentionOptions.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === activeMention}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pickMention(m.id)}
              className={clsx(
                "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm md:min-h-0",
                i === activeMention ? "bg-surface-2" : "hover:bg-surface-2",
              )}
            >
              <ModelAvatar model={m} size={24} />
              <span className="font-medium">{m.name}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={clsx(
          "rounded-[26px] border border-border bg-surface shadow-sm transition",
          "focus-within:border-accent/50 focus-within:shadow-[0_0_0_4px_var(--accent-soft)]",
        )}
      >
        {(notice || blindToImages) && (
          <p role="alert" className="px-4 pt-3 text-xs text-danger">
            {blindToImages ? t("composer.noVision", { model: model.name }) : notice}
          </p>
        )}
        {drafts.length > 0 && (
          <ul data-scroll-x className="flex gap-2 overflow-x-auto px-3 pt-3" aria-label={t("composer.attachments")}>
            {drafts.map(({ attachment, previewUrl, reading: isReading }) => (
              <li key={attachment.id} className="relative shrink-0">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview, next/image can't optimize it
                  <img src={previewUrl} alt={attachment.name} className="size-16 rounded-xl border border-border object-cover" />
                ) : (
                  <div className="flex h-16 w-44 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3">
                    {isReading ? (
                      <LoaderCircle className="size-5 shrink-0 animate-spin text-muted" aria-hidden />
                    ) : (
                      <FileText className="size-5 shrink-0 text-muted" />
                    )}
                    <div className="min-w-0" aria-busy={isReading || undefined}>
                      <div className="truncate text-xs font-medium">{attachment.name}</div>
                      <div className="text-xs text-muted">{isReading ? t("composer.reading") : formatBytes(attachment.size)}</div>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={t("composer.remove", { name: attachment.name })}
                  onClick={() => removeDraft(attachment.id)}
                  className="absolute -right-2 -top-2 inline-flex size-7 items-center justify-center rounded-full border-2 border-surface bg-text text-bg shadow md:size-6"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder={model.image ? t("composer.describePicture") : (placeholder ?? t("composer.message"))}
          aria-label={t("composer.message")}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setMentionIndex(0);
            setMentionDismissed(false);
            resize();
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="block max-h-[220px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-muted"
        />

        <div className="flex items-center gap-1 px-2 pb-2">
          <IconButton label={t("composer.attach")} onClick={() => fileRef.current?.click()} disabled={drafts.length >= MAX_ATTACHMENTS}>
            <Paperclip className="size-[18px]" />
          </IconButton>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Popover
            open={menuOpen}
            onOpenChange={setMenuOpen}
            className="bottom-full left-0 mb-2"
            trigger={
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className={clsx("inline-flex h-11 max-w-[14rem] items-center gap-2 rounded-full pl-1.5 pr-2.5 text-sm font-medium hover:bg-surface-2 md:h-9", PRESS)}
              >
                <ModelAvatar model={model} size={24} />
                <span className="truncate">{model.name}</span>
                <ChevronDown className="size-4 shrink-0 text-muted" />
              </button>
            }
          >
            <ModelMenu
              selectedId={modelId}
              onSelect={(id) => {
                track("model_switch", { model: id, via: "menu" });
                onModelChange(id);
                setMenuOpen(false);
                textareaRef.current?.focus();
              }}
            />
          </Popover>
          <div className="flex-1" />
          {streaming ? (
            <button
              type="button"
              aria-label={t("composer.stop")}
              title={t("composer.stop")}
              onClick={onStop}
              className={clsx("inline-flex size-11 items-center justify-center rounded-full bg-text text-bg hover:opacity-85 md:size-9", PRESS)}
            >
              <Square className="size-3.5" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={t("composer.send")}
              title={t("composer.send")}
              disabled={!canSend}
              onClick={() => void submit()}
              className={clsx("inline-flex size-11 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-surface-3 disabled:text-muted disabled:active:scale-100 md:size-9", PRESS)}
            >
              <ArrowUp className="size-5" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 hidden text-center text-xs text-muted md:block">
        {t("composer.hintAt")} · {enterToSend ? t("composer.hintShift") : t("composer.hintCmd")}
      </p>
    </div>
  );
}
