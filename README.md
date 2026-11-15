# familychatui

A private, Poe-style chat app for a family, self-hosted on one small server. All models come from a self-hosted [9router](https://github.com/decolua/9router) (an OpenAI-compatible LLM router); the browser never talks to it directly.

Built mobile-first, in English and Vietnamese.

What changed in each version: [RELEASES.md](RELEASES.md).

## Features

- **One family password, Netflix-style profiles.** Everyone shares one password per device, then picks their profile. Each profile can have a 4-digit PIN.
- **A family admin.** The first profile is the admin: the only one who can change which models the family sees, the default model, the family password, and add or delete profiles. Everyone else edits only their own profile.
- **Streaming that survives a sleeping phone.** Replies are written on the server, detached from the request. If the connection drops mid-reply, the app re-attaches and picks up the rest. Only Stop ends a reply early.
- **Models.** Friendly names over 9router model ids, a model picker, `@` to switch models mid-message, and "Retry with…" another model.
- **Web search with sources** for models that support it (Codex models through `/v1/responses` with structured citations).
- **Attachments.** Photos (downscaled in the browser, for vision models), text files, and PDF / Word / Excel / PowerPoint files (old and new formats, plus OpenDocument and iWork), which the server turns into text. Drag and drop files anywhere on the page.
- **Pictures.** GPT Image draws what you describe, changes a photo you attach, and in the same chat changes the picture it just made ("now make it blue"). Pictures stay with the chat and can be downloaded.
- **Chats name themselves** after the first reply, with a short title in the chat's language.
- **Pinned chats** stay at the top of the list, in the order you drag them to, and are never deleted.
- **Chat history that cleans itself up.** Chats with no new message for 90 days are deleted automatically unless pinned. Each person can also clear their own old chats in Settings.
- **Replies follow the language of the question**, whatever the app's language is.
- **Add to Home Screen.** A web app manifest and icons for browser tabs, iPhone and Android, so the app opens full screen like an installed one.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, zustand. SQLite through Node's built-in `node:sqlite`, so there are no native modules.

## Requirements

- Node.js 22 or newer.
- A 9router instance and an API key for it.
- Optional, for document attachments: `pdftotext` (poppler-utils) and LibreOffice (`soffice`) on the machine that runs the server. Without them, photos and text files still work and documents show a clear error.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

`.env.local`:

| Variable | Required | What it is |
| --- | --- | --- |
| `NINEROUTER_API_KEY` | yes | Your 9router API key. Stays on the server. |
| `FAMILY_PASSWORD` | first run | The starting family password. Once it's changed in Settings, the database copy wins. |
| `NINEROUTER_BASE_URL` | no | Defaults to `http://127.0.0.1:20128/v1`. |
| `DATA_DIR` | no | Where the SQLite database lives. Defaults to `./data`. |
| `NEXT_PUBLIC_GTM_ID` | no | A Google Tag Manager container for production builds. Unset means no tracking. |

The first profile you create becomes the admin. The model catalog (names, descriptions, logos, which models start hidden) lives in `src/lib/models.ts`; the ids must match your 9router's `/v1/models`.

Other commands: `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run e2e` (a browser walkthrough against a running server; it creates data, so point it at a throwaway `DATA_DIR`). `bash scripts/app-icon/build.sh` redraws every app icon from `scripts/app-icon/draw.mjs` (needs Python 3 and the installed Playwright).

## Deploy

The `deploy/` folder targets a single Ubuntu server with nginx, certbot and systemd:

1. Point a DNS record at the server, copy `deploy/` over, and run `DOMAIN=chat.example.com bash setup-host.sh`. It installs the document converters, creates an unprivileged `familychat` user, the systemd unit, the nginx site and the certificate. Put `NINEROUTER_API_KEY` and `FAMILY_PASSWORD` in `/etc/familychatui/env`.
2. Build and ship a release with `DEPLOY_HOST=user@host DEPLOY_KEY=~/.ssh/key deploy/deploy.sh`, or let GitHub Actions do it: on every push to `main`, `.github/workflows/ci.yml` builds the standalone bundle and deploys it. It needs the secrets `DEPLOY_HOST`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` and the variable `DEPLOY_DOMAIN` (plus `GTM_ID` if you want Tag Manager).

The server never runs npm. Releases are uploaded through `deploy-gate`, the only command the CI key may run, and `activate-release.sh` rolls back if the new release doesn't answer its health check. After a good release, `prune-releases.sh` keeps the 5 newest releases plus any from the last 7 days (never the live one).

## Security notes

- The 9router API key never reaches the browser; every model call is made by the server.
- Sessions are a signed, httpOnly cookie whose key is derived from the family password, so changing the password signs out every other device.
- PINs and the family password are scrypt-hashed. Wrong guesses are rate-limited per visitor IP and per profile.
- The CI deploy key can only upload or activate a release, and the app runs as its own user without sudo or access to `/home`.

## Credits

Provider logos are from [SVG Logos](https://github.com/gilbarbara/logos) by Gil Barbara (CC0). The logos are trademarks of their owners. The font is Be Vietnam Pro (SIL Open Font License).

## License

[MIT](LICENSE)
