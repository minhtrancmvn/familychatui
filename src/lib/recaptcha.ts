/**
 * Google reCAPTCHA v3 for the family-password screen: loads Google's script once and asks it for a token
 * at submit time. Nothing to click; Google's badge is hidden in globals.css and the login screen shows
 * the notice Google asks for instead.
 */

interface Grecaptcha {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

const TIMEOUT_MS = 15_000;
let loading: Promise<Grecaptcha> | null = null;

/** Loads the script (once). Called as soon as the login screen knows the site key, so Google sees the visit. */
export function loadRecaptcha(siteKey: string): Promise<Grecaptcha> {
  loading ??= new Promise<Grecaptcha>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => {
      const g = window.grecaptcha;
      if (g) g.ready(() => resolve(g));
      else reject(new Error("reCAPTCHA script loaded without grecaptcha"));
    };
    script.onerror = () => reject(new Error("reCAPTCHA script failed to load"));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    loading = null; // let the next try load it again
    throw err;
  });
  return loading;
}

/** A fresh token (valid for 2 minutes, single use) for `action`. Throws if Google's script can't run. */
export async function recaptchaToken(siteKey: string, action: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("reCAPTCHA timed out")), TIMEOUT_MS);
  });
  try {
    return await Promise.race([loadRecaptcha(siteKey).then((g) => g.execute(siteKey, { action })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
