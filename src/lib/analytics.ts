/**
 * Google Analytics events. The Tag Manager container (production only) holds the GA4 Google tag, and
 * gtag-style commands pushed onto the dataLayer reach GA4 without any other Tag Manager setup (checked on
 * the live container on 2026-11-15). Without Tag Manager (local dev) the pushes just sit in the array.
 *
 * Send only labels and numbers: never message text, chat titles, file or profile names, or ids.
 */

type Value = string | number | boolean;
export type TrackParams = Record<string, Value | undefined>;

// gtag.js only takes real `arguments` objects as commands, so this can't be an array push.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]): void {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer ??= [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

export function track(event: string, params: TrackParams = {}): void {
  if (typeof window === "undefined") return;
  const clean: Record<string, Value> = {};
  for (const [key, value] of Object.entries(params)) if (value !== undefined) clean[key] = value;
  gtag("event", event, clean);
}

/** Describes who is using the app without naming them. */
export function setUserProperties(properties: Record<string, string>): void {
  if (typeof window === "undefined") return;
  gtag("set", "user_properties", properties);
}

/** "installed" when opened from the home screen, else "browser". */
export function displayMode(): "installed" | "browser" {
  if (typeof window === "undefined") return "browser";
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true ? "installed" : "browser";
}

/** A reply's error message as a short, stable label for reports. */
export function errorKind(error: string | undefined): string | undefined {
  if (!error) return undefined;
  if (/reach 9router/i.test(error)) return "unreachable";
  if (/took too long/i.test(error)) return "timeout";
  if (/empty reply|no picture/i.test(error)) return "empty";
  if (/lost the connection/i.test(error)) return "connection";
  if (/still being written|busy/i.test(error)) return "busy";
  if (/describe the picture/i.test(error)) return "no_prompt";
  const status = /9router HTTP (\d{3})/.exec(error)?.[1];
  return status ? `upstream_${status}` : "other";
}
