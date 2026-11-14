"use client";

import clsx from "clsx";
import { Globe, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ModelAvatar } from "@/components/avatars";
import { PageHeader } from "@/components/shell";
import { tagKey, useLang, useT } from "@/lib/i18n";
import { MODELS } from "@/lib/models";
import { useActiveProfile, useAppStore, useVisibleModels } from "@/lib/store";
import type { ModelTag } from "@/lib/types";

const TAGS: ModelTag[] = ["Auto", "Fast", "Reasoning", "Vision", "Long context"];

export default function ModelsPage() {
  const t = useT();
  const lang = useLang();
  const models = useVisibleModels();
  const defaultModelId = useAppStore((s) => s.settings.defaultModelId);
  // Only the admin can turn hidden models on, so only the admin gets the hint.
  const isAdmin = useActiveProfile()?.isAdmin ?? false;
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<ModelTag | null>(null);

  const q = query.trim().toLowerCase();
  const list = models.filter(
    (m) => (!tag || m.tags.includes(tag)) && (!q || `${m.name} ${m.description[lang]} ${m.via}`.toLowerCase().includes(q)),
  );
  const tags = TAGS.filter((tg) => models.some((m) => m.tags.includes(tg)));

  return (
    <>
      <PageHeader title={<h1 className="text-base font-semibold">{t("explore.title")}</h1>} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-6">
          <p className="text-sm text-muted">{t("explore.intro")}</p>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
            <Globe className="mt-0.5 size-4 shrink-0" />
            {t("explore.searchNote")}
          </p>

          <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
            <Search className="size-4 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("models.search")}
              aria-label={t("models.search")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>

          <div data-scroll-x className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            {[null, ...tags].map((tg) => (
              <button
                key={tg ?? "all"}
                type="button"
                aria-pressed={tag === tg}
                onClick={() => setTag(tg)}
                className={clsx(
                  "h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors md:h-9",
                  tag === tg ? "border-accent bg-accent-soft text-accent-text" : "border-border hover:bg-surface-2",
                )}
              >
                {tg ? t(tagKey(tg)) : t("explore.all")}
              </button>
            ))}
          </div>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {list.map((m) => (
              <li key={m.id} className="flex flex-col rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <ModelAvatar model={m} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{m.name}</span>
                      {m.id === defaultModelId && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-text">
                          {t("home.default")}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted">{t("explore.via", { source: m.via })}</div>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm">{m.description[lang]}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {m.search && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent-text">
                        <Globe className="size-3" />
                        {t("search.badge")}
                      </span>
                    )}
                    {m.tags.map((tg) => (
                      <span key={tg} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
                        {t(tagKey(tg))}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/?model=${encodeURIComponent(m.id)}`}
                    className="inline-flex h-11 shrink-0 items-center rounded-xl bg-accent-strong px-4 text-sm font-medium text-accent-fg transition-[background-color,transform] hover:bg-accent-strong-hover active:scale-[0.97] md:h-9"
                  >
                    {t("explore.start")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {list.length === 0 && <p className="py-10 text-center text-sm text-muted">{t("models.noMatch")}</p>}
          {isAdmin && models.length < MODELS.length && (
            <p className="mt-6 text-center text-xs text-muted">
              <Link href="/settings" className="underline-offset-2 hover:underline">
                {t("explore.hiddenNote")}
              </Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
