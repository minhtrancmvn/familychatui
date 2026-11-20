# familychatui

Private, Poe-style chat app for the owner's family. Its only model provider is a self-hosted 9router (an OpenAI-compatible LLM router).

## Status

- In production (domain and host in `docs/private-host.md`). Every push to `main` deploys through GitHub Actions (`.github/workflows/ci.yml`); work on branches and merge. Backend: SQLite (`node:sqlite`), API routes, real 9router streaming, server-side auth, PDF/Office attachments.
- Phases, decisions and errors are tracked in `task_plan.md` (local only, gitignored). Update it as work progresses.
- Every PR merged to `main` adds an entry at the top of `RELEASES.md` and bumps the version with `npm version <x.y.z> --no-git-tag-version` (features: minor, fixes: patch). Write entries for the family and the owner: what changed for them, not file names.
- 9router runs on the server (Docker, `127.0.0.1:20128`). Local development reaches it through the SSH tunnel (local port 20129); see `.env.local`. Read the decisions below before any backend or deploy work.

## 9router context (read first)

@docs/9router-decisions.md

`docs/9router-decisions.md` and the server specifics below are gitignored, so they may be missing on other machines:

@docs/private-host.md

## Stack and commands

- Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript, zustand, react-markdown + remark-gfm + rehype-highlight + remark-math/rehype-katex, lucide-react, clsx. `katex` is pinned to 0.19.1 and forced on the plugins through `overrides` (0.16, which they ask for, has GHSA-238p-pmpm-9mq7).
- `npm run dev`, `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run e2e` (browser flow against `BASE_URL`; creates data, so use a throwaway `DATA_DIR`).
- Env (`.env.local` for dev, `/etc/familychatui/env` on the server): `NINEROUTER_API_KEY`, `FAMILY_PASSWORD`, optional `NINEROUTER_BASE_URL`, `DATA_DIR` (default `./data`, gitignored), `NEXT_PUBLIC_GTM_ID` (build time; CI passes the `GTM_ID` repository variable) and `RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET_KEY` (runtime, v3 keys; the check is off unless both are set, so dev and e2e run without them). `FAMILY_PASSWORD` is only the starting password: once someone changes it in Settings, its scrypt hash in the database wins.
- One **admin** profile (settings key `admin_profile_id`, defaulting to the oldest profile) is the only one that changes the default model, visible models and the family password, and adds or deletes profiles. Everyone else edits only their own profile. In "Manage profiles", a profile's own PIN gives edit rights, the admin's PIN gives edit + delete (`src/server/pin.ts`). The admin profile can't be deleted.
- Chats with no new message for `CHAT_RETENTION_DAYS` (90, `src/lib/config.ts`) are deleted by `src/server/cleanup.ts`, started from `src/instrumentation.ts` (at startup, then hourly). Pinned chats (`pinned`) are never deleted, also not by Settings → Chat history → "Delete chats" (own chats only). They sit at the top of the sidebar ordered by `pin_order` (lowest first; new pins get `min - 1`), reordered by drag with @dnd-kit (`PUT /api/chats/pinned` with the full id list, 409 if stale).
- The chat site only serves Vietnam, Singapore and the US: nginx `geo $familychat_allowed` (`/etc/nginx/conf.d/familychatui-geo.conf` + an allowlist built by `deploy/update-geo-allowlist.py` from DB-IP **plus Apple's iCloud Private Relay egress list by Apple's own country label**, daily `familychatui-geo.timer`) and `/etc/nginx/snippets/familychatui-geo.conf` (`deploy/nginx-familychatui-geo.conf`: `return 403` plus a bilingual page via a named location) included in the HTTPS server block only (port 80 keeps serving ACME). 0.3.1 used DB-IP alone and blocked Private Relay users (DB-IP agreed with Apple on only 26% of VN and 16% of SG relay ranges), so 0.4.3 lifted it; don't drop the Apple list. The list (~330k networks, IPv4 + IPv6) costs nginx about 150 MB in total, measured on the host: the master keeps roughly two copies after a reload, and it stayed flat over repeated reloads. Dropping IPv6 or using `geo ranges` for IPv4 would shrink it if memory gets tight. CI's site check accepts 403.
- reCAPTCHA v3 guards only `POST /api/login` (`src/server/recaptcha.ts`, action `login`, score >= 0.3): a missing/bad/low token is a 403 `captcha` and counts as a wrong guess; Google unreachable or rejecting our own keys lets the password decide (logged to the journal, as is every score). The login page gets the site key from `GET /api/login`, hides Google's badge (globals.css) and shows Google's notice instead. Every page sends `X-Robots-Tag: noindex, nofollow` (`next.config.ts`) and `src/app/robots.ts` disallows everything.
- The guess limiter keys on `X-Real-IP` only. nginx sets it from `$remote_addr`, which the realip snippet (`deploy/setup-host.sh`) takes from `CF-Connecting-IP` only for Cloudflare's IP ranges. Never trust `CF-Connecting-IP` in the app.
- `next build` and `next dev` share `.next`; after a build, a running dev server can loop on "HMR hash mismatch" page reloads. Stop it, `rm -rf .next`, start again.
- Deploy: push to `main` (CI), or by hand `DEPLOY_HOST=... DEPLOY_KEY=... deploy/deploy.sh` (values in `docs/private-host.md`). It builds the standalone bundle, ships a whitelist through `deploy-gate` (upload/activate only), and `activate-release.sh` rolls back on a failed health check. Host setup (idempotent, re-run after changing `deploy/`): `deploy/setup-host.sh`.
- PDF/Office attachments need `pdftotext` and LibreOffice (`soffice`) where the server runs; without them, documents fail with a clear message (images and text files still work).
- `@playwright/test` is pinned to 1.63.0 so it reuses the browsers already in `~/Library/Caches/ms-playwright`.
- npm 11 on this Mac rejects create-next-app's `--allow-scripts` flag (`EALLOWSCRIPTS`). Run `npm install` directly instead. The global `~/.npmrc` has `allow-scripts=9router`; leave it alone.

## Layout

- `src/app/login`: shared family password (`FAMILY_PASSWORD`; `family` in local dev).
- `src/app/profiles`: "Who's chatting?" picker, profile management and PIN entry. A fresh database has no profiles.
- `src/app/api/`: route handlers (session, login/logout, profiles, settings, chats, messages with SSE streaming, regenerate, stop, re-attach stream).
- `src/server/`: server-only code: `db.ts` (SQLite + migrations), `session.ts` (signed cookie, guards), `repo.ts` (queries), `ninerouter.ts` (9router client), `replies.ts` (detached reply runner), `pin.ts`, `rate-limit.ts`, `validate.ts`, `env.ts`.
- `src/app/(app)/`: signed-in shell (sidebar + main). Contains `page.tsx` (new chat), `chat/[id]`, `models` (Explore) and `settings`.
- `src/lib/`:
  - `models.ts`: model catalog using real 9router ids with friendly names.
  - `store.ts`: zustand store mirroring the server; only device preferences persist in localStorage.
  - `runner.ts`: sends messages and follows the SSE reply outside React, re-attaching after dropped connections.
  - `api.ts` (fetch helpers), `attachments.ts` (image downscale, text and code files), `notebook.ts` (.ipynb to Markdown in the browser), `config.ts`, `types.ts`.
- `src/components/`: composer, messages, markdown, sidebar, shell, model menu, popover, avatars, PIN pad, profile editor, ui primitives.

## Conventions

- Model ids are the exact 9router ids. Display names, descriptions and default visibility live in `src/lib/models.ts`.
- Never call 9router from the browser. The backend calls `http://127.0.0.1:20128/v1` server-side, and the API key stays on the server.
- Replies run detached from the request (`src/server/replies.ts`): a dropped connection doesn't stop them; only Stop does. Codex models (`cx/*`) go through `/v1/responses` with `web_search` for structured sources; others through `/v1/chat/completions`.
- Server-side code that touches the filesystem must not let Next's file tracing copy the whole project into the standalone build (see the `turbopackIgnore` comments in `src/server/env.ts`).
- Every 9router call sends `x-9router-token-saver: off`: 9router's global caveman/RTK token savers (meant for coding tools) would otherwise make family replies terse fragments.
- Use the theme tokens from `src/app/globals.css` (`bg-surface`, `bg-surface-2`, `text-muted`, `border-border`, `bg-accent`, ...). Dark mode comes from `data-theme` on `<html>` (`system`/`light`/`dark`).
- Zustand selectors must return stable references. Select raw state and derive with `useMemo`; a selector that returns a new array or object every time causes an infinite render loop.
- `md:` is redefined in `src/app/globals.css` as width ≥ 48rem **and** height ≥ 32rem, so a phone on its side keeps the phone layout (drawer, 44px targets, no hover-only actions); `short:` is the height < 32rem side. Scripts use `DESKTOP_MEDIA` (`src/lib/config.ts`), the same rule; change both together. Don't use `max-md:` (it is still width-only). On the desktop layout the sidebar can be put away (`settings.sidebarHidden`, a device preference); pages read it through `useShell()`.
- Design mobile first, because the family uses phones. The font is Be Vietnam Pro (Vietnamese subset), so diacritics render in one font. Check IME (`isComposing`) before treating Enter as send. `enterToSend` defaults to off on touch-first screens (`pointer: coarse`: phones, tablets) and on elsewhere; the persist `migrate` (v3) moved old phones' saved default to off. Shift+Enter is always a new line. Settings shows `APP_VERSION` (package.json, baked in by `next.config.ts`).
- Model avatars are real provider logos from `public/icons/models` (SVG Logos, CC0, fetched with the taste skill's `icons.mjs`). Auto gets a sparkle tile; a model without a logo (GLM) gets an initials tile.
- The app icon is a white house-shaped speech bubble with three orange dots on an orange `#ff5500` tile (home + chat), chosen by the owner. No letters: a lone "f" on a tile read as Facebook. `scripts/app-icon/draw.mjs` holds the shape and `build.sh` regenerates `src/app/{icon.svg,apple-icon.png,favicon.ico}` and `public/icons/app/*.png` (used by `src/app/manifest.ts`). `src/components/logo.tsx` inlines the same shape; change both together.
- All UI text goes through `src/lib/i18n.ts` (`useT()`), in both `en` and `vi`. Language is per profile; the login and profile screens use the device's last language. Chat replies follow the language of the prompt, not the UI language.
- Accent is `#ff5500` (`bg-accent`) only for icon-only fills, rings and highlights. Text on orange uses `bg-accent-strong` (`#d04400`, 4.66:1 with white). Never put normal-size white text on `bg-accent`.
- Image models (`image: true` in `src/lib/models.ts`, now `cx/gpt-image-2.6-flare`) aren't in 9router's `/v1/models`; replies call `/v1/images/generations` with the latest message as the prompt and, as references, that message's photos or else the picture in the reply right before. Pictures are attachment rows on the reply (data URLs, deleted with the chat or on Regenerate), served by `GET /api/attachments/[id]` (owner only, PNG/JPEG/WebP/GIF, CSP sandbox). Text models see a picture reply as a note naming the image model, and their system prompt says they can't draw. `E2E_IMAGE=1 npm run e2e` makes and edits two real pictures.
- Analytics: `track()` in `src/lib/analytics.ts` pushes gtag-style commands that the GA4 Google tag in the Tag Manager container sends as-is (no extra GTM tags). Event params are labels and numbers only, never text, titles, file/profile names or ids (the e2e checks this). `gtag('set', {content_group})` is ignored by the container, so chat page views stay `/chat/<id>`. New params need a GA4 custom definition to show in reports.
- Family usage (admin Settings): `GET /api/usage?days=7|30|90&tz=<minutes>` from SQLite (`usageReport` in `src/server/repo.ts`); active profiles are a count only, by design. Chart bars use `bg-chart` (`--chart`, accent in light, `#f55200` in dark, checked with the dataviz validator).
- Math: `prepareMath` (`src/lib/math.ts`) rewrites `\[…\]`, `\(…\)`, `$$…$$` and Pandoc-style `$…$` into `$$` for remark-math (`singleDollarTextMath: false`) and escapes every other `$`, so prices stay text. Inside math it turns bare `$`/`%` into signs (GPT writes `\frac{$1.89}{…}` and `18.71%`). rehype-katex runs before rehype-highlight. Wide formulas scroll inside `.katex-display`.
- Photos a person sent show as thumbnails linking to `GET /api/attachments/[id]`; right after sending, the thumbnail uses the client-only `preview` data URL until the server has the upload. A plain tap opens `src/components/lightbox.tsx` (solid black, arrows/keys/swipe between a message's photos, focus trapped and returned); a modified click keeps the link's new tab.
- Web search is always on for models with `search: true` (mirrors 9router's `capabilities.search`). The model decides per question whether to search; replies that searched carry `sources`.
- The taste skill's design rules were applied (tap targets of at least 44px on phones, press feedback, no violet, verb-plus-object buttons). Its marketing-page gate doesn't fit an app and is not run.

## Agent Orchestration

### Agent Worktree Lifecycle

- Clean up agent-created worktrees only after the agent's task is complete and its changes are committed and pushed.
- Then remove that agent-created worktree immediately, run `git worktree prune`, and verify `git worktree list` has no stale agent-created worktrees.
- Never remove active or user-created worktrees.

### Background Work

- Always tell the user when they must wait for a subagent or background task to finish before sending the next message.
- Name what is still running and what completion signal to expect. When nothing is pending, no notice is needed.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **familychatui** (1081 symbols, 3051 relationships, 89 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/familychatui/context` | Codebase overview, check index freshness |
| `gitnexus://repo/familychatui/clusters` | All functional areas |
| `gitnexus://repo/familychatui/processes` | All execution flows |
| `gitnexus://repo/familychatui/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
