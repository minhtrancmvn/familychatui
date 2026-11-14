"use client";

import { Check, Compass, Globe, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ModelAvatar } from "@/components/avatars";
import { useLang, useT } from "@/lib/i18n";
import { useVisibleModels } from "@/lib/store";

/** Searchable list of the models the family can see. */
export function ModelMenu({
  selectedId,
  onSelect,
  title,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
  title?: string;
}) {
  const t = useT();
  const lang = useLang();
  const models = useVisibleModels();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = q ? models.filter((m) => `${m.name} ${m.description[lang]}`.toLowerCase().includes(q)) : models;
  const heading = title ?? t("models.choose");

  return (
    <div role="menu" aria-label={heading} className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-1.5 shadow-xl">
      <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted">{heading}</div>
      {models.length > 6 && (
        <label className="mb-1 flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-2.5">
          <Search className="size-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("models.search")}
            aria-label={t("models.search")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </label>
      )}
      <ul className="max-h-72 overflow-y-auto">
        {list.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={m.id === selectedId}
              onClick={() => onSelect(m.id)}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <ModelAvatar model={m} size={30} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  {m.search && <Globe className="size-3 shrink-0 text-muted" aria-label={t("search.badge")} />}
                </span>
                <span className="block truncate text-xs text-muted">{m.description[lang]}</span>
              </span>
              {m.id === selectedId && <Check className="size-4 shrink-0 text-accent-text" />}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-2 py-3 text-sm text-muted">{t("models.noMatch")}</li>}
      </ul>
      <Link
        href="/models"
        className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-accent-text transition-colors hover:bg-surface-2"
      >
        <Compass className="size-3.5" />
        {t("models.exploreAll")}
      </Link>
    </div>
  );
}
