import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api, ApiError, type GuessResult, guessResult, onAuthError } from "./api";
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from "./config";
import { DEFAULT_HIDDEN_MODEL_IDS, DEFAULT_MODEL_ID, MODELS } from "./models";
import type { Chat, DeviceSettings, FamilySettings, Lang, Message, Profile, ProfileInput, Settings, Theme } from "./types";
import { uid } from "./util";

/**
 * App state. Profiles, chats and family settings live on the server (SQLite) and are mirrored here;
 * changes update this store first, then the server. Only device preferences persist in localStorage.
 */
interface AppState {
  /** The session has been loaded from the server. */
  ready: boolean;
  /** This device has entered the family password. */
  unlocked: boolean;
  activeProfileId: string | null;
  /** Language for screens before a profile is chosen (login, profile picker). Follows the last profile used. */
  deviceLanguage: Lang;
  profiles: Profile[];
  /** The active profile's chats. Messages are fetched when a chat is opened (`loaded`). */
  chats: Chat[];
  settings: Settings;

  loadSession: () => Promise<void>;
  /** `captcha`: a reCAPTCHA token when the server asks for one (see /api/login GET). */
  unlock: (password: string, captcha?: string) => Promise<GuessResult>;
  lockDevice: () => void;
  setDeviceLanguage: (lang: Lang) => void;
  selectProfile: (id: string, pin?: string) => Promise<GuessResult>;
  /** Checks a PIN typed for a profile in "Manage profiles": its own PIN gives "self", the admin's gives "admin". */
  verifyPin: (id: string, pin: string) => Promise<"self" | "admin" | Exclude<GuessResult, "ok">>;
  leaveProfile: () => void;
  /** `adminPin`: needed in the picker when the admin has a PIN (only the admin adds people). */
  addProfile: (data: ProfileInput, adminPin?: string) => Promise<void>;
  /** `currentPin`: the PIN typed in the picker (the profile's own, or the admin's). Not needed inside your own profile. */
  updateProfile: (id: string, patch: Partial<ProfileInput>, currentPin?: string) => Promise<void>;
  deleteProfile: (id: string, currentPin?: string) => Promise<void>;

  /** A new chat exists only here until its first message is sent. */
  createChat: (profileId: string, modelId: string, title: string) => string;
  loadChat: (id: string) => Promise<"ok" | "not-found">;
  renameChat: (id: string, title: string) => void;
  /** A title the server already saved (automatic naming); no request. */
  applyChatTitle: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  /** Pin (on top of the pinned list) or unpin a chat. Pinned chats are never deleted. */
  setPinned: (id: string, pinned: boolean) => void;
  /** New order of the pinned chats after a drag, top first. */
  reorderPinned: (ids: string[]) => void;
  /** Deletes this profile's chats older than `olderThanDays` (null = all), except those kept forever. Returns how many. */
  cleanupChats: (olderThanDays: number | null) => Promise<number>;
  setChatModel: (id: string, modelId: string) => void;
  addMessage: (chatId: string, message: Message) => void;
  patchMessage: (chatId: string, messageId: string, patch: Partial<Omit<Message, "id">>) => void;

  setDefaultModel: (modelId: string) => void;
  setModelHidden: (modelId: string, hidden: boolean) => void;
  setTheme: (theme: Theme) => void;
  setEnterToSend: (value: boolean) => void;
  setSidebarHidden: (hidden: boolean) => void;
}

interface SessionResponse {
  unlocked: boolean;
  profileId?: string | null;
  profiles?: Profile[];
  settings?: FamilySettings;
  chats?: Chat[];
}

/** First visit: Vietnamese if the browser prefers it, else English. Runs once when the store is created. */
function detectLanguage(): Lang {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
}

const DEFAULT_FAMILY: FamilySettings = { defaultModelId: DEFAULT_MODEL_ID, hiddenModelIds: DEFAULT_HIDDEN_MODEL_IDS };
/** Phones and tablets: Return adds a new line there by default, and the Send button sends. */
function touchFirst(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

const DEFAULT_DEVICE: DeviceSettings = { theme: "system", enterToSend: !touchFirst(), sidebarHidden: false };

function mapChat(chats: Chat[], id: string, fn: (c: Chat) => Chat): Chat[] {
  return chats.map((c) => (c.id === id ? fn(c) : c));
}

/** Keeps messages of chats already open here (a reply may be streaming into them). */
function mergeChats(current: Chat[], incoming: Chat[]): Chat[] {
  const known = new Map(current.map((c) => [c.id, c]));
  const merged = incoming.map((c) => {
    const mine = known.get(c.id);
    return mine?.loaded ? { ...c, messages: mine.messages, loaded: true } : c;
  });
  // Brand-new chats that haven't reached the server yet.
  const unsent = current.filter((c) => !c.loaded && c.messages.length > 0 && !incoming.some((i) => i.id === c.id));
  return [...unsent, ...merged];
}

/** Logs failed background saves; the next session load brings the store back in line with the server. */
function background(promise: Promise<unknown>) {
  promise.catch((err: unknown) => {
    if (!(err instanceof ApiError && (err.status === 401 || err.code === "no-profile"))) {
      console.warn("Save failed:", err);
      void useAppStore.getState().loadSession();
    }
  });
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ready: false,
      unlocked: false,
      activeProfileId: null,
      deviceLanguage: detectLanguage(),
      profiles: [],
      chats: [],
      settings: { ...DEFAULT_FAMILY, ...DEFAULT_DEVICE },

      loadSession: async () => {
        const data = await api<SessionResponse>("/api/session");
        if (!data.unlocked) {
          set({ ready: true, unlocked: false, activeProfileId: null, profiles: [], chats: [] });
          return;
        }
        const profile = data.profiles?.find((p) => p.id === data.profileId);
        set((s) => ({
          ready: true,
          unlocked: true,
          activeProfileId: profile?.id ?? null,
          profiles: data.profiles ?? [],
          chats: profile && profile.id === s.activeProfileId ? mergeChats(s.chats, data.chats ?? []) : (data.chats ?? []),
          settings: { ...s.settings, ...data.settings },
          deviceLanguage: profile?.language ?? s.deviceLanguage,
        }));
      },

      unlock: async (password, captcha) => {
        try {
          await api("/api/login", { body: { password, captcha } });
        } catch (err) {
          return guessResult(err);
        }
        await get().loadSession();
        return "ok";
      },
      lockDevice: () => {
        set({ unlocked: false, activeProfileId: null, profiles: [], chats: [] });
        background(api("/api/logout", { body: {} }));
      },
      setDeviceLanguage: (lang) => set({ deviceLanguage: lang }),

      selectProfile: async (id, pin) => {
        let result: { profile: Profile; chats: Chat[] };
        try {
          result = await api("/api/session/profile", { body: { profileId: id, pin } });
        } catch (err) {
          return guessResult(err);
        }
        set((s) => ({
          activeProfileId: id,
          chats: result.chats,
          profiles: s.profiles.map((p) => (p.id === id ? result.profile : p)),
          deviceLanguage: result.profile.language,
        }));
        return "ok";
      },
      verifyPin: async (id, pin) => {
        try {
          const { rights } = await api<{ rights: "self" | "admin" }>(`/api/profiles/${id}/pin`, { body: { pin } });
          return rights;
        } catch (err) {
          return guessResult(err) as Exclude<GuessResult, "ok">;
        }
      },
      leaveProfile: () => {
        set({ activeProfileId: null, chats: [] });
        background(api("/api/session/profile", { body: { profileId: null } }));
      },

      addProfile: async (data, adminPin) => {
        const { profile } = await api<{ profile: Profile }>("/api/profiles", { body: { ...data, currentPin: adminPin } });
        set((s) => ({ profiles: [...s.profiles, profile] }));
      },
      updateProfile: async (id, patch, currentPin) => {
        const existing = get().profiles.find((p) => p.id === id);
        if (!existing) return;
        // Language alone is sent on its own so it never needs a PIN.
        const onlyLanguage = Object.keys(patch).length === 1 && patch.language !== undefined;
        const body = onlyLanguage
          ? { language: patch.language }
          : {
              name: patch.name ?? existing.name,
              emoji: patch.emoji ?? existing.emoji,
              color: patch.color ?? existing.color,
              language: patch.language ?? existing.language,
              pin: patch.pin,
              currentPin,
            };
        if (onlyLanguage) {
          // Instant feedback for the language switch.
          set((s) => ({
            profiles: s.profiles.map((p) => (p.id === id ? { ...p, language: patch.language! } : p)),
            deviceLanguage: s.activeProfileId === id ? patch.language! : s.deviceLanguage,
          }));
        }
        const { profile } = await api<{ profile: Profile }>(`/api/profiles/${id}`, { method: "PATCH", body });
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === id ? profile : p)),
          // Changing your own language also changes what the login screen shows on this device.
          deviceLanguage: s.activeProfileId === id ? profile.language : s.deviceLanguage,
        }));
      },
      deleteProfile: async (id, currentPin) => {
        await api(`/api/profiles/${id}`, { method: "DELETE", body: { currentPin } });
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== id),
          chats: s.activeProfileId === id ? [] : s.chats,
          activeProfileId: s.activeProfileId === id ? null : s.activeProfileId,
        }));
      },

      createChat: (profileId, modelId, title) => {
        const id = uid();
        const now = Date.now();
        const chat: Chat = { id, profileId, title, modelId, createdAt: now, updatedAt: now, messages: [], loaded: true };
        set((s) => ({ chats: [chat, ...s.chats] }));
        return id;
      },
      loadChat: async (id) => {
        let chat: Chat;
        try {
          ({ chat } = await api<{ chat: Chat }>(`/api/chats/${id}`));
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) return "not-found";
          throw err;
        }
        set((s) => {
          const mine = s.chats.find((c) => c.id === id);
          // A reply streaming in here is newer than the server's copy.
          if (mine?.loaded) return {};
          const loaded = { ...chat, loaded: true };
          return { chats: mine ? mapChat(s.chats, id, () => loaded) : [loaded, ...s.chats] };
        });
        return "ok";
      },
      applyChatTitle: (id, title) => set((s) => ({ chats: mapChat(s.chats, id, (c) => ({ ...c, title })) })),
      renameChat: (id, title) => {
        set((s) => ({ chats: mapChat(s.chats, id, (c) => ({ ...c, title })) }));
        background(api(`/api/chats/${id}`, { method: "PATCH", body: { title } }));
      },
      deleteChat: (id) => {
        set((s) => ({ chats: s.chats.filter((c) => c.id !== id) }));
        background(api(`/api/chats/${id}`, { method: "DELETE" }));
      },
      setPinned: (id, pinned) => {
        set((s) => {
          const top = Math.min(0, ...s.chats.filter((c) => c.pinned).map((c) => c.pinOrder ?? 0));
          return { chats: mapChat(s.chats, id, (c) => ({ ...c, pinned, pinOrder: pinned ? top - 1 : undefined })) };
        });
        background(api(`/api/chats/${id}`, { method: "PATCH", body: { pinned } }));
      },
      reorderPinned: (ids) => {
        const order = new Map(ids.map((id, i) => [id, i]));
        set((s) => ({ chats: s.chats.map((c) => (order.has(c.id) ? { ...c, pinOrder: order.get(c.id) } : c)) }));
        background(api("/api/chats/pinned", { method: "PUT", body: { ids } }));
      },
      cleanupChats: async (olderThanDays) => {
        const { deleted } = await api<{ deleted: string[] }>("/api/chats/cleanup", { body: { olderThanDays } });
        const gone = new Set(deleted);
        set((s) => ({ chats: s.chats.filter((c) => !gone.has(c.id)) }));
        return deleted.length;
      },
      setChatModel: (id, modelId) => set((s) => ({ chats: mapChat(s.chats, id, (c) => ({ ...c, modelId })) })),
      addMessage: (chatId, message) =>
        set((s) => ({
          chats: mapChat(s.chats, chatId, (c) => ({
            ...c,
            modelId: message.modelId,
            updatedAt: message.createdAt,
            messages: [...c.messages, message],
          })),
        })),
      patchMessage: (chatId, messageId, patch) =>
        set((s) => ({
          chats: mapChat(s.chats, chatId, (c) => ({
            ...c,
            messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
          })),
        })),

      setDefaultModel: (modelId) => {
        const { settings } = get();
        const next = {
          defaultModelId: modelId,
          // The default must always be visible.
          hiddenModelIds: settings.hiddenModelIds.filter((id) => id !== modelId),
        };
        set({ settings: { ...settings, ...next } });
        background(api("/api/settings", { method: "PUT", body: next }));
      },
      setModelHidden: (modelId, hidden) => {
        const { settings } = get();
        let hiddenModelIds: string[];
        if (hidden) {
          const visibleCount = MODELS.length - settings.hiddenModelIds.length;
          if (modelId === settings.defaultModelId || visibleCount <= 1) return;
          if (settings.hiddenModelIds.includes(modelId)) return;
          hiddenModelIds = [...settings.hiddenModelIds, modelId];
        } else {
          hiddenModelIds = settings.hiddenModelIds.filter((id) => id !== modelId);
        }
        set({ settings: { ...settings, hiddenModelIds } });
        background(api("/api/settings", { method: "PUT", body: { hiddenModelIds } }));
      },
      setTheme: (theme) => set((s) => ({ settings: { ...s.settings, theme } })),
      setEnterToSend: (value) => set((s) => ({ settings: { ...s.settings, enterToSend: value } })),
      setSidebarHidden: (hidden) => set((s) => ({ settings: { ...s.settings, sidebarHidden: hidden } })),
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      // v3: Enter adds a new line on phones and tablets. "On" was the default everywhere before, so a saved
      // "on" there was nobody's choice and becomes "off"; a saved "off" was a choice and stays. Older
      // than v2 is dropped, as before.
      migrate: (persisted, version) => {
        if (version < 2) return {} as never;
        const state = (persisted ?? {}) as { settings?: Partial<DeviceSettings> };
        if (version < 3 && touchFirst() && state.settings?.enterToSend === true) {
          state.settings = { ...state.settings, enterToSend: false };
        }
        return state as never;
      },
      // Only this device's preferences; the layout's theme script reads state.settings.theme before paint.
      partialize: (s) => ({
        deviceLanguage: s.deviceLanguage,
        settings: { theme: s.settings.theme, enterToSend: s.settings.enterToSend, sidebarHidden: s.settings.sidebarHidden },
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as { deviceLanguage?: Lang; settings?: Partial<DeviceSettings> };
        return {
          ...current,
          deviceLanguage: saved.deviceLanguage ?? current.deviceLanguage,
          settings: {
            ...current.settings,
            theme: saved.settings?.theme ?? current.settings.theme,
            enterToSend: saved.settings?.enterToSend ?? current.settings.enterToSend,
            sidebarHidden: saved.settings?.sidebarHidden ?? current.settings.sidebarHidden,
          },
        };
      },
    },
  ),
);

if (typeof window !== "undefined") {
  // The prototype kept fake chats here; they're not needed any more.
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // storage blocked
  }
  onAuthError((err) => {
    if (err.status === 401) useAppStore.setState({ unlocked: false, activeProfileId: null, profiles: [], chats: [] });
    else useAppStore.setState({ activeProfileId: null, chats: [] });
  });
}

let sessionLoad: Promise<void> | null = null;

/** Loads the session once per page load, retrying every few seconds while the server is unreachable. */
function ensureSession(): Promise<void> {
  sessionLoad ??= useAppStore
    .getState()
    .loadSession()
    .catch(async (err: unknown) => {
      console.warn("Session load failed, retrying:", err);
      await new Promise((r) => setTimeout(r, 3000));
      sessionLoad = null;
      return ensureSession();
    });
  return sessionLoad;
}

/** False on the server and until the session has been loaded. */
export function useHydrated(): boolean {
  const ready = useAppStore((s) => s.ready);
  useEffect(() => {
    void ensureSession();
  }, []);
  return ready;
}

export function useActiveProfile(): Profile | null {
  const profiles = useAppStore((s) => s.profiles);
  const activeId = useAppStore((s) => s.activeProfileId);
  return useMemo(() => profiles.find((p) => p.id === activeId) ?? null, [profiles, activeId]);
}

export function useVisibleModels() {
  const hidden = useAppStore((s) => s.settings.hiddenModelIds);
  return useMemo(() => MODELS.filter((m) => !hidden.includes(m.id)), [hidden]);
}
