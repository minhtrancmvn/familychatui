"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ModelAvatar, ProfileAvatar } from "@/components/avatars";
import { Composer } from "@/components/composer";
import { PageHeader } from "@/components/shell";
import { type MsgKey, tagKey, useT } from "@/lib/i18n";
import { getModel, hasModel } from "@/lib/models";
import { sendMessage } from "@/lib/runner";
import { useActiveProfile, useAppStore, useVisibleModels } from "@/lib/store";
import type { OutgoingAttachment } from "@/lib/types";
import { titleFrom } from "@/lib/util";

const SUGGESTIONS: Array<{ emoji: string; key: MsgKey }> = [
  { emoji: "✈️", key: "home.s1" },
  { emoji: "🍳", key: "home.s2" },
  { emoji: "🌈", key: "home.s3" },
  { emoji: "💌", key: "home.s4" },
];

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

/** `/?model=<id>` (from Explore) preselects a model; otherwise the family default. */
function Home() {
  const params = useSearchParams();
  const defaultModelId = useAppStore((s) => s.settings.defaultModelId);
  const requested = params.get("model");
  const initial = requested && hasModel(requested) ? requested : defaultModelId;
  return <NewChat key={initial} initialModelId={initial} />;
}

function NewChat({ initialModelId }: { initialModelId: string }) {
  const t = useT();
  const profile = useActiveProfile();
  const models = useVisibleModels();
  const defaultModelId = useAppStore((s) => s.settings.defaultModelId);
  const createChat = useAppStore((s) => s.createChat);
  const router = useRouter();
  const [modelId, setModelId] = useState(initialModelId);

  if (!profile) return null;

  const start = (text: string, attachments: OutgoingAttachment[]) => {
    const chatId = createChat(profile.id, modelId, titleFrom(text, attachments[0]?.name));
    sendMessage({ chatId, text, modelId, attachments });
    router.push(`/chat/${chatId}`);
  };

  return (
    <>
      <PageHeader bordered={false} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 pb-10 md:pb-16">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-xs font-medium text-muted">
              <ProfileAvatar profile={profile} size={22} />
              {t("home.chattingAs", { name: profile.name })}
            </span>
            <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">{t("home.title")}</h1>
            <p className="mt-2 text-balance text-sm text-muted">{t("home.subtitle")}</p>
          </div>

          <Composer
            modelId={modelId}
            onModelChange={setModelId}
            onSend={start}
            autoFocus
            placeholder={t("composer.placeholder", { model: getModel(modelId).name })}
          />

          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => start(t(s.key), [])}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm transition-[background-color,transform] duration-150 hover:-translate-y-0.5 hover:bg-surface-2 active:scale-[0.98]"
                >
                  <span className="text-lg" aria-hidden>
                    {s.emoji}
                  </span>
                  {t(s.key)}
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-10" aria-labelledby="home-models">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="home-models" className="text-sm font-semibold">
                {t("home.models")}
              </h2>
              <Link href="/models" className="inline-flex min-h-11 items-center text-xs font-medium text-accent-text hover:underline">
                {t("home.exploreAll")}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {models.map((m) => {
                const selected = m.id === modelId;
                const note = m.id === defaultModelId ? t("home.default") : m.tags[0] ? t(tagKey(m.tags[0])) : m.via;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setModelId(m.id)}
                    className={clsx(
                      "flex min-h-14 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150 hover:-translate-y-0.5 active:scale-[0.98]",
                      selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2",
                    )}
                  >
                    <ModelAvatar model={m} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="block truncate text-xs text-muted">{note}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
