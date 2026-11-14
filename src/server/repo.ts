import "server-only";

import { DEFAULT_HIDDEN_MODEL_IDS, DEFAULT_MODEL_ID, hasModel, MODELS } from "@/lib/models";
import type {
  Attachment,
  Chat,
  FamilySettings,
  Lang,
  Message,
  MessageStatus,
  OutgoingAttachment,
  Profile,
  ProfileInput,
  Source,
} from "@/lib/types";

import { db, tx } from "./db";

// ---------- profiles ----------

interface ProfileRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  language: Lang;
  pin_hash: string | null;
}

function toProfile(r: ProfileRow, adminId: string | null): Profile {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    language: r.language,
    hasPin: r.pin_hash !== null,
    isAdmin: r.id === adminId,
  };
}

const ADMIN_SETTING = "admin_profile_id";

/** The family admin: the saved one, else the oldest profile (whoever set the app up). Null with no profiles. */
export function adminProfileId(): string | null {
  const saved = getSetting(ADMIN_SETTING);
  if (saved && db().prepare("SELECT 1 FROM profiles WHERE id = ?").get(saved)) return saved;
  const first = db().prepare("SELECT id FROM profiles ORDER BY created_at, rowid LIMIT 1").get() as { id: string } | undefined;
  if (!first) return null;
  setSetting(ADMIN_SETTING, first.id);
  return first.id;
}

export function listProfiles(): Profile[] {
  const rows = db().prepare("SELECT * FROM profiles ORDER BY created_at, rowid").all() as unknown as ProfileRow[];
  const adminId = adminProfileId();
  return rows.map((r) => toProfile(r, adminId));
}

export function getProfile(id: string): Profile | null {
  const row = db().prepare("SELECT * FROM profiles WHERE id = ?").get(id) as ProfileRow | undefined;
  return row ? toProfile(row, adminProfileId()) : null;
}

/** undefined: no such profile. null: the profile has no PIN. */
export function getPinHash(id: string): string | null | undefined {
  const row = db().prepare("SELECT pin_hash FROM profiles WHERE id = ?").get(id) as { pin_hash: string | null } | undefined;
  return row ? row.pin_hash : undefined;
}

export function countProfiles(): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number }).n;
}

export function createProfile(id: string, input: ProfileInput, pinHash: string | null): Profile {
  db()
    .prepare("INSERT INTO profiles (id, name, emoji, color, language, pin_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.name, input.emoji, input.color, input.language, pinHash, Date.now());
  return getProfile(id)!;
}

/** pinHash: a hash sets the PIN, null removes it, undefined keeps it. */
export function updateProfile(id: string, input: ProfileInput, pinHash: string | null | undefined): Profile | null {
  const conn = db();
  const result = conn
    .prepare("UPDATE profiles SET name = ?, emoji = ?, color = ?, language = ? WHERE id = ?")
    .run(input.name, input.emoji, input.color, input.language, id);
  if (result.changes === 0) return null;
  if (pinHash !== undefined) conn.prepare("UPDATE profiles SET pin_hash = ? WHERE id = ?").run(pinHash, id);
  return getProfile(id);
}

export function setProfileLanguage(id: string, language: Lang): Profile | null {
  db().prepare("UPDATE profiles SET language = ? WHERE id = ?").run(language, id);
  return getProfile(id);
}

/** Deletes the profile with its chats (ON DELETE CASCADE). */
export function deleteProfile(id: string): boolean {
  return db().prepare("DELETE FROM profiles WHERE id = ?").run(id).changes > 0;
}

// ---------- key/value settings ----------

export function getSetting(key: string): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

// ---------- family settings ----------

/** Keeps settings valid against the current catalog: a known default that is always visible, one visible model at least. */
export function normalizeSettings(input: Partial<FamilySettings>): FamilySettings {
  const defaultModelId = input.defaultModelId && hasModel(input.defaultModelId) ? input.defaultModelId : DEFAULT_MODEL_ID;
  const hidden = Array.from(new Set(input.hiddenModelIds ?? DEFAULT_HIDDEN_MODEL_IDS)).filter(
    (id) => hasModel(id) && id !== defaultModelId,
  );
  return { defaultModelId, hiddenModelIds: hidden.length >= MODELS.length ? [] : hidden };
}

export function getFamilySettings(): FamilySettings {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'family'").get() as { value: string } | undefined;
  let saved: Partial<FamilySettings> = {};
  try {
    if (row) saved = JSON.parse(row.value) as Partial<FamilySettings>;
  } catch {
    saved = {};
  }
  return normalizeSettings(saved);
}

export function saveFamilySettings(settings: FamilySettings): FamilySettings {
  const clean = normalizeSettings(settings);
  db()
    .prepare("INSERT INTO settings (key, value) VALUES ('family', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(clean));
  return clean;
}

// ---------- chats and messages ----------

interface ChatRow {
  id: string;
  profile_id: string;
  title: string;
  model_id: string;
  created_at: number;
  updated_at: number;
  keep_forever: number;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  model_id: string;
  status: MessageStatus;
  sources: string | null;
  error: string | null;
  created_at: number;
}

interface AttachmentRow {
  id: string;
  message_id: string;
  name: string;
  size: number;
  kind: "image" | "file";
  mime: string;
  data: string;
}

function toChat(r: ChatRow, messages: Message[] = [], loaded = false): Chat {
  return {
    id: r.id,
    profileId: r.profile_id,
    title: r.title,
    modelId: r.model_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    keepForever: r.keep_forever === 1,
    messages,
    loaded,
  };
}

function parseSources(raw: string | null): Source[] | undefined {
  if (!raw) return undefined;
  try {
    const list = JSON.parse(raw) as Source[];
    return list.length ? list : undefined;
  } catch {
    return undefined;
  }
}

function toMessage(r: MessageRow, attachments: Attachment[]): Message {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    modelId: r.model_id,
    createdAt: r.created_at,
    status: r.status,
    attachments: attachments.length ? attachments : undefined,
    sources: parseSources(r.sources),
    error: r.error ?? undefined,
  };
}

export function listChats(profileId: string): Chat[] {
  const rows = db()
    .prepare("SELECT * FROM chats WHERE profile_id = ? ORDER BY updated_at DESC")
    .all(profileId) as unknown as ChatRow[];
  return rows.map((r) => toChat(r));
}

export function chatOwner(chatId: string): string | null {
  const row = db().prepare("SELECT profile_id FROM chats WHERE id = ?").get(chatId) as { profile_id: string } | undefined;
  return row?.profile_id ?? null;
}

function messageRows(chatId: string): MessageRow[] {
  return db()
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, rowid")
    .all(chatId) as unknown as MessageRow[];
}

function attachmentRows(chatId: string, withData: boolean): AttachmentRow[] {
  const cols = withData ? "a.*" : "a.id, a.message_id, a.name, a.size, a.kind, a.mime, '' AS data";
  return db()
    .prepare(
      `SELECT ${cols} FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.chat_id = ? ORDER BY a.message_id, a.position`,
    )
    .all(chatId) as unknown as AttachmentRow[];
}

/** The chat with its messages, if it belongs to the profile. Attachment contents stay on the server. */
export function getChat(profileId: string, chatId: string): Chat | null {
  const row = db().prepare("SELECT * FROM chats WHERE id = ? AND profile_id = ?").get(chatId, profileId) as
    | ChatRow
    | undefined;
  if (!row) return null;
  const byMessage = new Map<string, Attachment[]>();
  for (const a of attachmentRows(chatId, false)) {
    const list = byMessage.get(a.message_id) ?? [];
    list.push({ id: a.id, name: a.name, size: a.size, kind: a.kind });
    byMessage.set(a.message_id, list);
  }
  const messages = messageRows(chatId).map((m) => toMessage(m, byMessage.get(m.id) ?? []));
  return toChat(row, messages, true);
}

export function renameChat(profileId: string, chatId: string, title: string): boolean {
  return db().prepare("UPDATE chats SET title = ? WHERE id = ? AND profile_id = ?").run(title, chatId, profileId).changes > 0;
}

export function setKeepForever(profileId: string, chatId: string, keep: boolean): boolean {
  return (
    db().prepare("UPDATE chats SET keep_forever = ? WHERE id = ? AND profile_id = ?").run(keep ? 1 : 0, chatId, profileId)
      .changes > 0
  );
}

/**
 * Deletes chats whose last message is older than `cutoff` (ms), except those kept forever. Only one
 * profile's chats when `profileId` is given. Returns the deleted chat ids.
 */
export function deleteChatsInactiveSince(cutoff: number, profileId?: string): string[] {
  return tx(() => {
    const where = `keep_forever = 0 AND updated_at < ?${profileId ? " AND profile_id = ?" : ""}`;
    const args = profileId ? [cutoff, profileId] : [cutoff];
    const ids = (db().prepare(`SELECT id FROM chats WHERE ${where}`).all(...args) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length) db().prepare(`DELETE FROM chats WHERE ${where}`).run(...args);
    return ids;
  });
}

export function deleteChat(profileId: string, chatId: string): boolean {
  return db().prepare("DELETE FROM chats WHERE id = ? AND profile_id = ?").run(chatId, profileId).changes > 0;
}

export function getMessage(messageId: string): MessageRow | null {
  return (db().prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined) ?? null;
}

export function messageExists(id: string): boolean {
  return db().prepare("SELECT 1 FROM messages WHERE id = ?").get(id) !== undefined;
}

/** Saves a new turn: creates the chat on its first message, then the user message and an empty streaming reply. */
export function saveTurn(opts: {
  profileId: string;
  chatId: string;
  title: string;
  modelId: string;
  userMessageId: string;
  replyId: string;
  text: string;
  attachments: OutgoingAttachment[];
}): void {
  const now = Date.now();
  tx(() => {
    const conn = db();
    if (chatOwner(opts.chatId) === null) {
      conn
        .prepare("INSERT INTO chats (id, profile_id, title, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(opts.chatId, opts.profileId, opts.title, opts.modelId, now, now);
    } else {
      conn.prepare("UPDATE chats SET model_id = ?, updated_at = ? WHERE id = ?").run(opts.modelId, now, opts.chatId);
    }
    const insertMessage = conn.prepare(
      "INSERT INTO messages (id, chat_id, role, content, model_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insertMessage.run(opts.userMessageId, opts.chatId, "user", opts.text, opts.modelId, "done", now);
    insertMessage.run(opts.replyId, opts.chatId, "assistant", "", opts.modelId, "streaming", now + 1);
    const insertAttachment = conn.prepare(
      "INSERT INTO attachments (id, message_id, position, name, size, kind, mime, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    opts.attachments.forEach((a, i) =>
      insertAttachment.run(a.id, opts.userMessageId, i, a.name, a.size, a.kind, a.mime, a.data),
    );
  });
}

/** Clears a reply so it can be written again, possibly by another model. */
export function resetReply(chatId: string, replyId: string, modelId: string): void {
  tx(() => {
    const conn = db();
    conn
      .prepare("UPDATE messages SET content = '', status = 'streaming', model_id = ?, sources = NULL, error = NULL WHERE id = ?")
      .run(modelId, replyId);
    conn.prepare("UPDATE chats SET model_id = ?, updated_at = ? WHERE id = ?").run(modelId, Date.now(), chatId);
  });
}

export function saveReplyProgress(replyId: string, content: string): void {
  db().prepare("UPDATE messages SET content = ? WHERE id = ? AND status = 'streaming'").run(content, replyId);
}

export function finishReply(
  replyId: string,
  result: { content: string; status: Exclude<MessageStatus, "streaming">; sources: Source[]; error?: string },
): void {
  db()
    .prepare("UPDATE messages SET content = ?, status = ?, sources = ?, error = ? WHERE id = ?")
    .run(
      result.content,
      result.status,
      result.sources.length ? JSON.stringify(result.sources) : null,
      result.error ?? null,
      replyId,
    );
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  attachments: Array<{ name: string; kind: "image" | "file"; mime: string; data: string }>;
}

/** The conversation that leads up to (not including) the given reply, with attachment contents, for the model. */
export function historyBefore(chatId: string, replyId: string): HistoryMessage[] {
  const rows = messageRows(chatId);
  const end = rows.findIndex((m) => m.id === replyId);
  const byMessage = new Map<string, HistoryMessage["attachments"]>();
  for (const a of attachmentRows(chatId, true)) {
    const list = byMessage.get(a.message_id) ?? [];
    list.push({ name: a.name, kind: a.kind, mime: a.mime, data: a.data });
    byMessage.set(a.message_id, list);
  }
  return rows
    .slice(0, end < 0 ? rows.length : end)
    .filter((m) => m.role === "user" || m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content, attachments: byMessage.get(m.id) ?? [] }));
}
