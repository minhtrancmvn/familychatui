"use client";

import clsx from "clsx";
import { Compass, InfinityIcon, MoreHorizontal, Pencil, Plus, Search, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ModelAvatar, ProfileAvatar } from "@/components/avatars";
import { Logo } from "@/components/logo";
import { MenuItem } from "@/components/popover";
import { ConfirmDialog, PRESS } from "@/components/ui";
import { APP_NAME } from "@/lib/config";
import { useDismiss, useNow } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { getModel } from "@/lib/models";
import { useActiveProfile, useAppStore } from "@/lib/store";
import type { Chat } from "@/lib/types";
import { groupByRecency } from "@/lib/util";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const profile = useActiveProfile();
  const chats = useAppStore((s) => s.chats);
  const leaveProfile = useAppStore((s) => s.leaveProfile);
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    if (!profile) return [];
    const q = query.trim().toLowerCase();
    const mine = chats
      .filter((c) => c.profileId === profile.id && (!q || c.title.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return groupByRecency(mine, now);
  }, [chats, profile, query, now]);

  if (!profile) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Logo size={30} />
        <span className="font-semibold tracking-tight">{APP_NAME}</span>
      </div>

      <div className="space-y-1 px-3">
        <Link
          href="/"
          onClick={onNavigate}
          className={clsx("flex h-11 items-center gap-2 rounded-xl bg-accent-strong px-3 text-sm font-medium text-accent-fg hover:bg-accent-strong-hover md:h-10", PRESS)}
        >
          <Plus className="size-4" />
          {t("nav.newChat")}
        </Link>
        <Link
          href="/models"
          onClick={onNavigate}
          className={clsx(
            "flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors md:h-10",
            pathname === "/models" ? "bg-surface-3" : "hover:bg-surface-2",
          )}
        >
          <Compass className="size-4" />
          {t("nav.explore")}
        </Link>
      </div>

      <div className="px-3 pt-3">
        <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 focus-within:border-accent md:h-9">
          <Search className="size-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("nav.search")}
            aria-label={t("nav.search")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </label>
      </div>

      <nav aria-label={t("nav.chats")} className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => (
          <section key={group.key} className="mt-3">
            <h3 className="px-2 pb-1 text-xs font-medium text-muted">{t(group.key)}</h3>
            <ul>
              {group.items.map((chat) => (
                <ChatItem key={chat.id} chat={chat} active={pathname === `/chat/${chat.id}`} onNavigate={onNavigate} />
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted">{query ? t("nav.noMatch") : t("nav.empty")}</p>
        )}
      </nav>

      <div className="flex items-center gap-1 border-t border-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            router.push("/profiles");
            leaveProfile();
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2"
        >
          <ProfileAvatar profile={profile} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{profile.name}</span>
            <span className="block text-xs text-muted">{t("nav.switchProfile")}</span>
          </span>
        </button>
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-label={t("nav.settings")}
          title={t("nav.settings")}
          className={clsx(
            "inline-flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text md:size-10",
            pathname === "/settings" && "bg-surface-3 text-text",
          )}
        >
          <Settings className="size-5" />
        </Link>
      </div>
    </div>
  );
}

function ChatItem({ chat, active, onNavigate }: { chat: Chat; active: boolean; onNavigate?: () => void }) {
  const t = useT();
  const renameChat = useAppStore((s) => s.renameChat);
  const deleteChat = useAppStore((s) => s.deleteChat);
  const setKeepForever = useAppStore((s) => s.setKeepForever);
  const router = useRouter();
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const refs = useMemo(() => [menuRef, triggerRef], []);
  const closeMenu = useCallback(() => setMenuAt(null), []);
  useDismiss(refs, closeMenu, menuAt !== null);
  const model = getModel(chat.modelId);

  if (editing) {
    const save = (value: string) => {
      const title = value.trim();
      if (title) renameChat(chat.id, title);
      setEditing(false);
    };
    return (
      <li>
        <input
          autoFocus
          defaultValue={chat.title}
          aria-label={t("chat.titleLabel")}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-11 w-full rounded-lg border border-accent bg-surface px-2 text-sm outline-none md:h-9"
        />
      </li>
    );
  }

  return (
    <li className="group relative">
      <Link
        href={`/chat/${chat.id}`}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={clsx(
          "flex items-center gap-2.5 rounded-lg py-3 pl-2 pr-12 text-sm transition-colors md:py-2 md:pr-9",
          active ? "bg-surface-3 font-medium" : "hover:bg-surface-2",
        )}
      >
        <ModelAvatar model={model} size={20} />
        <span className="truncate">{chat.title}</span>
        {chat.keepForever && (
          <InfinityIcon className="size-3.5 shrink-0 text-muted" role="img" aria-label={t("chat.kept")} />
        )}
      </Link>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("chat.options", { title: chat.title })}
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        onClick={(e) => {
          if (menuAt) return setMenuAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setMenuAt({ top: r.bottom + 4, left: Math.max(8, r.right - 224) });
        }}
        className={clsx(
          "absolute right-0.5 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-text md:right-1 md:size-7",
          menuAt || active ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>

      {menuAt &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuAt.top, left: menuAt.left }}
            className="fixed z-50 w-56 rounded-xl border border-border bg-surface p-1 shadow-lg"
          >
            <MenuItem
              icon={<Pencil className="size-4" />}
              onClick={() => {
                setMenuAt(null);
                setEditing(true);
              }}
            >
              {t("chat.rename")}
            </MenuItem>
            <MenuItem
              icon={<InfinityIcon className="size-4" />}
              onClick={() => {
                setMenuAt(null);
                setKeepForever(chat.id, !chat.keepForever);
              }}
            >
              {chat.keepForever ? t("chat.unkeep") : t("chat.keep")}
            </MenuItem>
            <MenuItem
              danger
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                setMenuAt(null);
                setConfirmDelete(true);
              }}
            >
              {t("chat.delete")}
            </MenuItem>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("chat.deleteTitle")}
        body={t("chat.deleteBody", { title: chat.title })}
        confirmLabel={t("chat.deleteConfirm")}
        onConfirm={() => {
          deleteChat(chat.id);
          if (active) router.push("/");
        }}
      />
    </li>
  );
}
