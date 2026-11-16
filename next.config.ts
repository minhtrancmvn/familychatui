import { readFileSync } from "node:fs";

import type { NextConfig } from "next";

// Shown in Settings; baked in at build time from package.json.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// cacheComponents / partialPrefetching (create-next-app defaults) are off: every screen renders in the
// browser from the local store, and their dev-time "instant navigation" check dropped those segments.
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Self-contained server bundle (deploy/deploy.sh ships it; the host never runs npm).
  output: "standalone",
  // Never ship local data, private docs or env files (deploy/deploy.sh also checks the bundle).
  outputFileTracingExcludes: {
    "/*": ["data/**", "docs/**", "deploy/**", "scripts/**", ".env*"],
  },
  // The dev-tools button sits on top of the sidebar profile avatar.
  devIndicators: false,
  turbopack: {
    // A stray package-lock.json in the home folder otherwise makes Next guess the wrong workspace root.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
