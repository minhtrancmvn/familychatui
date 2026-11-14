import "server-only";

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Server configuration from the environment. Read lazily so `next build` works without secrets. */

export function dataDir(): string {
  // turbopackIgnore: a runtime-only path. Without it, file tracing copies the whole project (local
  // database, docs, secrets) into the standalone build.
  const dir = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "data");
  if (!existsSync(/*turbopackIgnore: true*/ dir)) mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function ninerouterBaseUrl(): string {
  return (process.env.NINEROUTER_BASE_URL || "http://127.0.0.1:20128/v1").replace(/\/+$/, "");
}

export function ninerouterApiKey(): string {
  const key = process.env.NINEROUTER_API_KEY;
  if (!key) throw new Error("NINEROUTER_API_KEY is not set");
  return key;
}

export function familyPassword(): string {
  const value = process.env.FAMILY_PASSWORD;
  if (!value) throw new Error("FAMILY_PASSWORD is not set");
  return value;
}

let secret: Buffer | null = null;

/** Random per-install secret, kept in DATA_DIR/session-secret (created on first use). */
export function sessionSecret(): Buffer {
  if (secret) return secret;
  const file = path.join(dataDir(), "session-secret");
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
  }
  chmodSync(file, 0o600);
  secret = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  return secret;
}
