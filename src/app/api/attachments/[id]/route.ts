import type { NextRequest } from "next/server";

import { getImageAttachment } from "@/server/repo";
import { json, requireProfile } from "@/server/session";
import { isId } from "@/server/validate";

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

/**
 * A picture from one of your own chats: one an image model made, or a photo you attached. Ids never get
 * reused (a regenerated picture gets a new one), so browsers may keep it for good.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/attachments/[id]">) {
  const auth = requireProfile(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const picture = isId(id) ? getImageAttachment(auth.profile.id, id) : null;
  const match = picture ? IMAGE_DATA_URL.exec(picture.data) : null;
  if (!picture || !match) return json({ error: "not-found" }, 404);

  const bytes = Buffer.from(match[2], "base64");
  const asciiName = picture.name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": match[1],
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(picture.name)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      // Only listed image types are served, and never as anything a browser would run.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
