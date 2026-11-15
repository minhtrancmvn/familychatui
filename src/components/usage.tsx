"use client";

import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useState } from "react";

import { ModelAvatar } from "@/components/avatars";
import { Segmented } from "@/components/ui";
import { api } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { getModel, hasModel } from "@/lib/models";
import type { UsageReport } from "@/lib/types";

type Period = "7" | "30" | "90";

/** A clean top for the y-axis: 4, 5, 10, 20, 25, 50, 100, … */
function niceTop(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5]) if (m * step >= max) return m * step;
  return 10 * step;
}

function Stat({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-2xl font-semibold">
        {warn && <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />}
        {value}
      </div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

/** Messages per day: one column per day. Hover, tap or the arrow keys read a day; the table has them all. */
function DailyChart({ daily, locale }: { daily: UsageReport["daily"]; locale: string }) {
  const t = useT();
  const [highlighted, setActive] = useState<number | null>(null);
  const last = daily.length - 1;
  const active = highlighted !== null && highlighted <= last ? highlighted : null;
  const top = niceTop(Math.max(0, ...daily.map((d) => d.messages)));
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }), [locale]);
  const dateOf = (i: number) => formatter.format(new Date(`${daily[i].day}T00:00:00Z`));
  const number = (n: number) => n.toLocaleString(locale);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setActive(Math.max(0, Math.min(last, Math.floor(((e.clientX - box.left) / box.width) * daily.length))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, (i: number) => number> = {
      ArrowLeft: (i) => Math.max(0, i - 1),
      ArrowRight: (i) => Math.min(last, i + 1),
      Home: () => 0,
      End: () => last,
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setActive((i) => move(i ?? last));
  };

  return (
    <div>
      {/* The readout row: the value leads, the day follows. Reserved space, so nothing jumps. */}
      <div className="relative h-11" aria-hidden>
        {active !== null && (
          <div
            className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-sm"
            style={{ left: `clamp(2.5rem, ${((active + 0.5) / daily.length) * 100}%, calc(100% - 2.5rem))` }}
          >
            <span className="text-sm font-semibold">{number(daily[active].messages)}</span>
            <span className="ml-1.5 text-muted">{dateOf(active)}</span>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative h-36 flex-1 border-b border-border">
          <div className="absolute inset-x-0 top-0 border-t border-border" />
          <div
            role="img"
            tabIndex={0}
            aria-label={t("usage.chartLabel", { from: dateOf(0), to: dateOf(last) })}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive((i) => i ?? last)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
            className="absolute inset-0 flex touch-pan-y items-end gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {daily.map((d, i) => (
              <div key={d.day} className="flex h-full min-w-0 flex-1 items-end justify-center">
                <div
                  className={clsx(
                    "w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity",
                    active !== null && active !== i && "opacity-50",
                  )}
                  style={{ height: d.messages ? `max(2px, ${(d.messages / top) * 100}%)` : 0 }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="-my-2 flex flex-col justify-between text-right text-xs tabular-nums text-muted" aria-hidden>
          <span>{number(top)}</span>
          <span>0</span>
        </div>
      </div>
      <div className="mt-1.5 flex justify-between pr-6 text-xs text-muted" aria-hidden>
        <span>{dateOf(0)}</span>
        <span>{dateOf(last)}</span>
      </div>
      <div className="sr-only" aria-live="polite">
        {active !== null && t("usage.dayValue", { date: dateOf(active), n: number(daily[active].messages) })}
      </div>
      <details className="mt-2 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted hover:text-text md:min-h-8">
          {t("usage.showTable")}
        </summary>
        <table className="mt-1 w-full max-w-xs text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">{t("usage.day")}</th>
              <th className="py-1 text-right font-medium">{t("usage.messages")}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {daily.map((d, i) => (
              <tr key={d.day} className="border-t border-border">
                <td className="py-1">{dateOf(i)}</td>
                <td className="py-1 text-right">{number(d.messages)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** One row per model: name, a bar for its share of replies, the count; failures and pictures under the name. */
function ModelRows({ models, locale }: { models: UsageReport["models"]; locale: string }) {
  const t = useT();
  const most = Math.max(1, ...models.map((m) => m.replies));
  return (
    <ul className="space-y-3">
      {models.map((m) => {
        const known = hasModel(m.modelId);
        const model = getModel(m.modelId);
        const extras = [
          m.failed > 0 && (
            <span key="failed" className="text-danger">
              {t("usage.failedCount", { n: m.failed.toLocaleString(locale) })}
            </span>
          ),
          m.pictures > 0 && (
            <span key="pictures">{t(m.pictures === 1 ? "usage.pictureOne" : "usage.pictures", { n: m.pictures.toLocaleString(locale) })}</span>
          ),
        ].filter(Boolean);
        return (
          <li key={m.modelId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[13rem_1fr_auto]">
            <div className="flex min-w-0 items-center gap-2">
              {known ? (
                <ModelAvatar model={model} size={28} />
              ) : (
                <span className="size-7 shrink-0 rounded-lg bg-surface-2" aria-hidden />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{known ? model.name : m.modelId}</div>
                {extras.length > 0 && (
                  <div className="flex flex-wrap gap-x-1.5 text-xs text-muted">
                    {extras.map((node, i) => (
                      <span key={i}>
                        {i > 0 && "· "}
                        {node}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-2 row-start-2 h-2 overflow-hidden rounded-full bg-surface-2 sm:col-span-1 sm:row-start-auto">
              <div className="h-full rounded-full bg-chart" style={{ width: `${(m.replies / most) * 100}%` }} />
            </div>
            <div className="text-right text-sm">
              <span className="font-semibold tabular-nums">{m.replies.toLocaleString(locale)}</span>
              <span className="ml-1 text-xs text-muted">{t(m.replies === 1 ? "usage.replyOne" : "usage.replies")}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The admin's view of how the family uses the app. Counts come from the server; nothing per person. */
export function UsagePanel() {
  const t = useT();
  const lang = useLang();
  const locale = lang === "vi" ? "vi-VN" : "en-US";
  const [period, setPeriod] = useState<Period>("30");
  // The last answer and the period it is for: while it's for another period, the new one is loading.
  const [result, setResult] = useState<{ period: Period; report: UsageReport | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const tz = -new Date().getTimezoneOffset();
    api<UsageReport>(`/api/usage?days=${period}&tz=${tz}`, { signal: controller.signal })
      .then((report) => setResult({ period, report }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ period, report: null });
      });
    return () => controller.abort();
  }, [period]);

  const loading = result?.period !== period;
  const report = result?.report ?? null;
  const failed = !loading && !report;

  const periods = (["7", "30", "90"] as const).map((value) => ({ value, label: t("usage.days", { n: value }) }));
  const number = (n: number) => n.toLocaleString(locale);
  const totals = report?.totals;
  const failShare = totals && totals.replies ? totals.failed / totals.replies : 0;
  const percent = failShare > 0 && failShare < 0.01 ? "<1%" : `${Math.round(failShare * 100)}%`;

  return (
    <div className="space-y-5">
      <Segmented label={t("usage.period")} value={period} options={periods} onChange={setPeriod} />
      {failed && <p className="text-sm text-danger">{t("usage.loadFailed")}</p>}
      {!report && loading && <p className="text-sm text-muted">{t("loading")}</p>}
      {report && totals && (
        // A new period keeps the old numbers on screen, dimmed, until the new ones arrive.
        <div className={clsx("space-y-6 transition-opacity", loading && "opacity-50")} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label={t("usage.messages")} value={number(totals.messages)} note={t(totals.newChats === 1 ? "usage.newChatOne" : "usage.newChats", { n: number(totals.newChats) })} />
            <Stat
              label={t("usage.failed")}
              value={number(totals.failed)}
              note={t(totals.replies === 1 ? "usage.failedShareOne" : "usage.failedShare", { pct: percent, n: number(totals.replies) })}
              warn={failShare >= 0.05}
            />
            <Stat label={t("usage.picturesMade")} value={number(totals.pictures)} />
            <Stat label={t("usage.active")} value={number(totals.activeProfiles)} note={t("usage.ofProfiles", { n: number(totals.profiles) })} />
          </div>

          <div>
            <h3 className="text-sm font-semibold">{t("usage.perDay")}</h3>
            {totals.messages === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("usage.none")}</p>
            ) : (
              // A new period is a new chart: the highlighted day must not outlive the old one.
              <DailyChart key={report.days} daily={report.daily} locale={locale} />
            )}
          </div>

          {report.models.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">{t("usage.byModel")}</h3>
              <ModelRows models={report.models} locale={locale} />
            </div>
          )}

          {report.errors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">{t("usage.errors")}</h3>
              <ul className="mt-1 divide-y divide-border">
                {report.errors.map((e) => (
                  <li key={e.error} className="flex gap-3 py-2 text-sm">
                    <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{number(e.count)}×</span>
                    <span className="min-w-0 break-words text-muted">{e.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
