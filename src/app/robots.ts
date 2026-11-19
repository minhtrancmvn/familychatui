import type { MetadataRoute } from "next";

/** A private family app: ask every crawler to stay out (next.config.ts also sends X-Robots-Tag: noindex). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
