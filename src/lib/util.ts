/** crypto.randomUUID only exists in secure contexts (https or localhost), so fall back on plain http. */
export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function titleFrom(text: string, fallback = "New chat"): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return fallback;
  return oneLine.length > 48 ? `${oneLine.slice(0, 47).trimEnd()}…` : oneLine;
}

const DAY = 24 * 60 * 60 * 1000;

export type GroupKey = "group.today" | "group.yesterday" | "group.week" | "group.month" | "group.older";

export interface ChatGroup<T> {
  key: GroupKey;
  items: T[];
}

/** Groups items (newest first) into Today / Yesterday / Previous 7 days / Previous 30 days / Older. */
export function groupByRecency<T extends { updatedAt: number }>(items: T[], now: number): ChatGroup<T>[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const buckets: ChatGroup<T>[] = [
    { key: "group.today", items: [] },
    { key: "group.yesterday", items: [] },
    { key: "group.week", items: [] },
    { key: "group.month", items: [] },
    { key: "group.older", items: [] },
  ];
  for (const item of items) {
    const t = item.updatedAt;
    if (t >= today) buckets[0].items.push(item);
    else if (t >= today - DAY) buckets[1].items.push(item);
    else if (t >= today - 7 * DAY) buckets[2].items.push(item);
    else if (t >= today - 30 * DAY) buckets[3].items.push(item);
    else buckets[4].items.push(item);
  }
  return buckets.filter((b) => b.items.length > 0);
}
