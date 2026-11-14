import "server-only";

import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { dataDir } from "./env";

// Node's built-in SQLite (no native module, so a build made on the Mac runs on the Linux server).
// Loaded at runtime so the bundler leaves the `node:sqlite` builtin alone.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

export type Db = DatabaseSyncType;

/** Each entry upgrades the schema by one version (PRAGMA user_version). Never edit a shipped entry; add a new one. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    color TEXT NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('en', 'vi')),
    pin_hash TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    model_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX chats_by_profile ON chats(profile_id, updated_at DESC);
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('streaming', 'done', 'stopped', 'error')),
    sources TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX messages_by_chat ON messages(chat_id, created_at);
  CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'file')),
    mime TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX attachments_by_message ON attachments(message_id, position);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: "Keep forever" chats are never deleted automatically (or by "Clean up chats").
  `
  ALTER TABLE chats ADD COLUMN keep_forever INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX chats_by_activity ON chats(keep_forever, updated_at);
  `,
  // 3: A model names each new chat after its first reply ('initial' -> 'generated'), unless someone
  // renamed it first ('user'). Chats that already exist keep their titles.
  `
  ALTER TABLE chats ADD COLUMN title_state TEXT NOT NULL DEFAULT 'initial';
  UPDATE chats SET title_state = 'generated';
  `,
  // 4: "Keep forever" became "Pin": pinned chats sit at the top of the list in the order people drag them
  // to (pin_order, lowest first) and are still never deleted. Kept chats become pinned, newest first.
  `
  ALTER TABLE chats RENAME COLUMN keep_forever TO pinned;
  ALTER TABLE chats ADD COLUMN pin_order REAL;
  UPDATE chats SET pin_order = -updated_at WHERE pinned = 1;
  `,
];

function open(): Db {
  const db = new DatabaseSync(path.join(dataDir(), "familychatui.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  // Replies are written by this process only, so after a restart none can still be running.
  db.prepare("UPDATE messages SET status = 'stopped' WHERE status = 'streaming'").run();
  return db;
}

// One connection per process; kept on globalThis so dev-mode hot reloads don't reopen it.
const holder = globalThis as unknown as { __familychatDb?: Db };

export function db(): Db {
  holder.__familychatDb ??= open();
  return holder.__familychatDb;
}

/** Runs fn inside a transaction (node:sqlite has no helper for it). */
export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}
