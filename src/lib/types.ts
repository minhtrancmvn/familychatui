export type Theme = "system" | "light" | "dark";

export type Lang = "en" | "vi";

export type ModelTag = "Auto" | "Fast" | "Reasoning" | "Vision" | "Long context" | "Image";

export interface ModelInfo {
  /** The model id exactly as 9router's /v1/models returns it. */
  id: string;
  /** Friendly name shown to the family. */
  name: string;
  description: Record<Lang, string>;
  /** Provider logo in /public, shown on a white tile. Without one, the tile shows `initials`. */
  logo?: string;
  /** The 9router combo: drawn with a sparkle instead of a provider logo. */
  auto?: boolean;
  /** 9router reports `capabilities.search` for this model; web search is then always on. */
  search: boolean;
  /** 9router reports `capabilities.vision`: the model can look at attached images. */
  vision: boolean;
  /** Makes pictures (9router's /v1/images/generations) instead of writing text. Attached photos are edited. */
  image?: boolean;
  /** Short text drawn on the avatar tile when there is no logo. */
  initials: string;
  color: string;
  tags: ModelTag[];
  /** Where 9router gets this model from (shown on Explore). */
  via: string;
}

export interface Profile {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** Locked with a 4-digit PIN. The PIN itself never leaves the server. */
  hasPin: boolean;
  /** The family admin: the only profile that can change models, the family password, and other people's profiles. */
  isAdmin: boolean;
  /** Language of the app's own text for this person. */
  language: Lang;
}

/** Profile fields sent to the server. `pin`: a 4-digit string sets it, null removes it, undefined keeps it. */
export interface ProfileInput {
  name: string;
  emoji: string;
  color: string;
  language: Lang;
  pin?: string | null;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  kind: "image" | "file";
}

/** An attachment on its way to the server: an image as a (downscaled) data: URL, a text file as its text. */
export interface OutgoingAttachment extends Attachment {
  mime: string;
  data: string;
}

export type MessageStatus = "streaming" | "done" | "stopped" | "error";

export interface Source {
  title: string;
  url: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Model the user picked for this turn, or the model that wrote the reply. */
  modelId: string;
  createdAt: number;
  status: MessageStatus;
  attachments?: Attachment[];
  /** Set when the model searched the web for this reply. */
  sources?: Source[];
  /** Short reason shown under a failed reply. */
  error?: string;
}

export interface Chat {
  id: string;
  profileId: string;
  title: string;
  /** Model used for the latest turn; new turns start with it. */
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  /** Pinned: listed at the top (by `pinOrder`, lowest first) and never deleted automatically or by a cleanup. */
  pinned?: boolean;
  pinOrder?: number;
  /** Client only: messages have been fetched from the server. */
  loaded?: boolean;
}

/** Shared by the whole family; stored on the server. */
export interface FamilySettings {
  /** Model preselected for every new chat. */
  defaultModelId: string;
  /** Models hidden from the family's pickers. */
  hiddenModelIds: string[];
}

/** This device only; stored in localStorage. */
export interface DeviceSettings {
  theme: Theme;
  enterToSend: boolean;
  /** Desktop only: the sidebar is put away to give the chat the whole width. */
  sidebarHidden: boolean;
}

export type Settings = FamilySettings & DeviceSettings;

/** What the server streams while a reply is written (one JSON object per SSE `data:` line). */
export type ReplyEvent =
  /** Sent first on every (re)connection: the reply so far. */
  | { type: "snapshot"; content: string; sources: Source[]; searching: boolean }
  | { type: "searching" }
  | { type: "delta"; text: string }
  | { type: "sources"; sources: Source[] }
  /** `attachments`: the pictures an image model made, once they are saved. */
  | { type: "done"; status: Exclude<MessageStatus, "streaming">; error?: string; attachments?: Attachment[] }
  /** After the first reply: the chat's new automatic title. */
  | { type: "title"; title: string }
  /** Nothing more is coming on this stream. */
  | { type: "end" };

/** Family usage for the admin's Settings, counted from the chats on the server. */
export interface UsageReport {
  days: number;
  totals: {
    /** Messages people sent. */
    messages: number;
    newChats: number;
    /** Finished replies (done, stopped or failed); a regenerated reply counts once. */
    replies: number;
    failed: number;
    pictures: number;
    /** Profiles that sent at least one message. */
    activeProfiles: number;
    profiles: number;
  };
  /** Messages per local day, oldest first, every day of the period. `day` is YYYY-MM-DD. */
  daily: Array<{ day: string; messages: number }>;
  /** Most replies first. */
  models: Array<{ modelId: string; replies: number; failed: number; pictures: number }>;
  /** The five most common error messages. */
  errors: Array<{ error: string; count: number }>;
}
