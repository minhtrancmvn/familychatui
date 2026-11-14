import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { requireAdminRights } from "@/server/pin";
import { countProfiles, createProfile } from "@/server/repo";
import { hashPin, json, requireUnlocked } from "@/server/session";
import { parseProfileInput, readJson } from "@/server/validate";

const MAX_PROFILES = 8;

export async function POST(req: NextRequest) {
  const session = requireUnlocked(req);
  if (session instanceof Response) return session;
  const body = await readJson(req);
  // Only the admin adds people (signed in, or with the admin's PIN in the picker). The very first
  // profile needs nothing and becomes the admin.
  const denied = requireAdminRights(session, body.currentPin);
  if (denied) return denied;
  const input = parseProfileInput(body);
  if (typeof input === "string") return json({ error: input }, 400);
  if (countProfiles() >= MAX_PROFILES) return json({ error: "too-many-profiles" }, 409);
  const profile = createProfile(randomUUID(), input, input.pin ? hashPin(input.pin) : null);
  return json({ profile }, 201);
}
