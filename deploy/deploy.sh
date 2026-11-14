#!/usr/bin/env bash

# Build the standalone app, upload it as a new release, activate it (rolls back if unhealthy).
# Used by CI on every push to main, and by hand from the Mac. The server never runs npm; node:sqlite is
# built into Node, so the bundle has no native modules.
# Env: DEPLOY_HOST (user@host), DEPLOY_KEY (SSH key path). By hand, see docs/private-host.md.

set -euo pipefail

cd "$(dirname "$0")/.."
HOST="${DEPLOY_HOST:?set DEPLOY_HOST, e.g. ubuntu@<server-ip> (see docs/private-host.md)}"
KEY="${DEPLOY_KEY:?set DEPLOY_KEY to an SSH key the server accepts (see docs/private-host.md)}"
GATE=/opt/familychatui/deploy/deploy-gate
# IdentitiesOnly: use exactly this key, not whatever the ssh-agent offers first.
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o ConnectTimeout=15 -o BatchMode=yes)

SHA="$(git rev-parse --short=12 HEAD)"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then SHA="$SHA-dirty"; fi
RELEASE_ID="$SHA-$(date -u +%Y%m%d%H%M%S)"
OUT="$(mktemp -d)/$RELEASE_ID"

npm run build
mkdir -p "$OUT"
# Whitelist: only what `node server.js` needs, plus the static files standalone doesn't copy itself.
for item in server.js package.json .next node_modules; do
    rsync -a ".next/standalone/$item" "$OUT/"
done
rsync -a .next/static/ "$OUT/.next/static/"
rsync -a public/ "$OUT/public/"
# Next's server trace always pulls in sharp; its macOS binary can't run on Linux, and the app never
# optimizes images (avatars are unoptimized SVGs), so drop it.
rm -rf "$OUT/node_modules/sharp" "$OUT/node_modules/@img"
test -f "$OUT/server.js"
# Belt and braces: local data, env files, private docs and native binaries must never ship.
if find "$OUT" \( -name '.env*' -o -name 'private-host.md' -o -name 'session-secret' -o -name '*.sqlite*' -o -name '*.node' \) | grep .; then
    printf 'Refusing to ship the files listed above\n' >&2
    exit 1
fi

tar -C "$OUT" -czf - . | "${SSH[@]}" "$HOST" "$GATE upload $RELEASE_ID"
"${SSH[@]}" "$HOST" "$GATE activate $RELEASE_ID"
rm -rf "$(dirname "$OUT")"
