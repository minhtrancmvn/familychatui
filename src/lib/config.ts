/** Display name of the app. Change freely. */
export const APP_NAME = "familychatui";

/**
 * Google Tag Manager container from NEXT_PUBLIC_GTM_ID at build time (CI sets it from the GTM_ID
 * repository variable). Empty = no Tag Manager. Loaded in production builds only. Whatever tags the
 * container runs can see these pages, so don't add session-replay or "capture page text" tags: they
 * would send family chats to third parties.
 */
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "";

/** Chats with no new message for this many days are deleted, unless kept forever. */
export const CHAT_RETENTION_DAYS = 90;

/** localStorage key for this device's preferences (theme, Enter-to-send, last language). */
export const STORAGE_KEY = "familychatui-device";

/** Older localStorage keys, removed on load. */
export const LEGACY_STORAGE_KEYS = ["familychatui-prototype-v1"];
