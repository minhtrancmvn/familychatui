"use client";

import clsx from "clsx";
import { ArrowDown, MoreHorizontal, Pencil, Pin, PinOff, SquarePen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ModelAvatar } from "@/components/avatars";
import { Composer } from "@/components/composer";
import { ChatMessage } from "@/components/message";
import { MenuItem, Popover } from "@/components/popover";
import { PageHeader, useShell } from "@/components/shell";
import { Button, ConfirmDialog, IconButton, Modal } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { getModel, hasModel } from "@/lib/models";
import { resumeStreaming, sendMessage, stopReply } from "@/lib/runner";
import { useActiveProfile, useAppStore } from "@/lib/store";
import type { Message } from "@/lib/types";

const NO_MESSAGES: Message[] = [];

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatView key={id} chatId={id} />;
}

/** Fetches the chat's messages the first time it's opened on this page load. */
function useLoadedChat(chatId: string) {
  const chat = useAppStore((s) => s.chats.find((c) => c.id === chatId));
  const loadChat = useAppStore((s) => s.loadChat);
  const [state, setState] = useState<"loading" | "ok" | "not-found">(chat?.loaded ? "ok" : "loading");
  const needsLoad = !chat?.loaded;

  useEffect(() => {
    if (!needsLoad) return;
    let cancelled = false;
    const load = () =>
      loadChat(chatId).then(
        (result) => {
          if (cancelled) return;
          setState(result);
          if (result === "ok") resumeStreaming(chatId);
        },
        () => {
          if (!cancelled) setTimeout(load, 3000); // offline: try again
        },
      );
    void load();
    return () => {
      cancelled = true;
    };
  }, [chatId, needsLoad, loadChat]);

  return { chat, state: chat?.loaded ? "ok" : state };
}

function ChatView({ chatId }: { chatId: string }) {
  const t = useT();
  const { sidebarHidden } = useShell();
  const { chat, state } = useLoadedChat(chatId);
  const renameChat = useAppStore((s) => s.renameChat);
  const deleteChat = useAppStore((s) => s.deleteChat);
  const setPinned = useAppStore((s) => s.setPinned);
  const defaultModelId = useAppStore((s) => s.settings.defaultModelId);
  const profile = useActiveProfile();
  const router = useRouter();

  // A model that left the catalog (e.g. Gemini) continues with the family default.
  const [modelId, setModelId] = useState(chat && hasModel(chat.modelId) ? chat.modelId : defaultModelId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const messages = chat?.messages ?? NO_MESSAGES;
  const streaming = messages.find((m) => m.status === "streaming");
  const last = messages[messages.length - 1];
  const followKey = `${messages.length}:${last?.content.length ?? 0}:${last?.status ?? ""}`;

  // Open at the latest message.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state]);

  // Follow a streaming reply, unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [followKey]);

  if (state === "loading") {
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 items-center justify-center" aria-busy="true" aria-label={t("loading")}>
          <div className="size-7 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
        </div>
      </>
    );
  }
  if (!chat || !profile || chat.profileId !== profile.id) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-muted">{t("chat.notFound")}</p>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-xl bg-accent-strong px-4 text-sm font-medium text-accent-fg hover:bg-accent-strong-hover"
          >
            {t("home.title")}
          </Link>
        </div>
      </>
    );
  }

  const chatModel = getModel(chat.modelId);

  return (
    <>
      <PageHeader
        title={
          <div className="flex min-w-0 items-center gap-2.5">
            <ModelAvatar model={chatModel} size={30} />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">{chat.title}</h1>
              <div className="truncate text-xs text-muted">
                {chatModel.name}
                {chat.pinned && ` · ${t("chat.pinned")}`}
              </div>
            </div>
          </div>
        }
      >
        <Link
          href="/"
          aria-label={t("nav.newChat")}
          title={t("nav.newChat")}
          // The sidebar has its own New chat button; put away on a desktop, this one stands in.
          className={clsx(
            "inline-flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text",
            !sidebarHidden && "md:hidden",
          )}
        >
          <SquarePen className="size-5" />
        </Link>
        <Popover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className="right-0 top-full mt-1"
          trigger={
            <IconButton label={t("chat.menu")} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              <MoreHorizontal className="size-5" />
            </IconButton>
          }
        >
          <div role="menu" className="w-56 rounded-xl border border-border bg-surface p-1 shadow-lg">
            <MenuItem
              icon={<Pencil className="size-4" />}
              onClick={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
            >
              {t("chat.rename")}
            </MenuItem>
            <MenuItem
              icon={chat.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              onClick={() => {
                setMenuOpen(false);
                setPinned(chat.id, !chat.pinned);
              }}
            >
              {chat.pinned ? t("chat.unpin") : t("chat.pin")}
            </MenuItem>
            <MenuItem
              danger
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
            >
              {t("chat.delete")}
            </MenuItem>
          </div>
        </Popover>
      </PageHeader>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            stickToBottom.current = atBottom;
            setShowJump(!atBottom);
          }}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-muted">
                <ModelAvatar model={getModel(modelId)} size={48} />
                {t("chat.empty", { model: getModel(modelId).name })}
              </div>
            )}
            {messages.map((m, i) => (
              <ChatMessage key={m.id} chatId={chat.id} message={m} isLatest={m.role === "assistant" && i === messages.length - 1} />
            ))}
          </div>
        </div>

        {showJump && (
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            aria-label={t("chat.jump")}
            className="absolute bottom-32 left-1/2 inline-flex size-11 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-md hover:text-text"
          >
            <ArrowDown className="size-5" />
          </button>
        )}

        <div className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:px-4">
          <Composer
            modelId={modelId}
            onModelChange={setModelId}
            onSend={(text, attachments) => {
              stickToBottom.current = true;
              sendMessage({ chatId: chat.id, text, modelId, attachments });
            }}
            streaming={streaming !== undefined}
            onStop={() => streaming && stopReply(chat.id, streaming.id)}
            autoFocus
            placeholder={t("composer.placeholder", { model: getModel(modelId).name })}
          />
        </div>
      </div>

      {renaming && (
        <Modal open onClose={() => setRenaming(false)} title={t("chat.renameTitle")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("title") ?? "").trim();
              if (value) renameChat(chat.id, value);
              setRenaming(false);
            }}
          >
            <input
              name="title"
              autoFocus
              defaultValue={chat.title}
              aria-label={t("chat.titleLabel")}
              className="h-12 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-accent"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setRenaming(false)}>{t("cancel")}</Button>
              <Button type="submit" variant="primary">
                {t("chat.saveName")}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("chat.deleteTitle")}
        body={t("chat.deleteBody", { title: chat.title })}
        confirmLabel={t("chat.deleteConfirm")}
        onConfirm={() => {
          deleteChat(chat.id);
          router.push("/");
        }}
      />
    </>
  );
}
