#!/usr/bin/env bash

# On the server (via deploy-gate): switch `current` to an uploaded release, restart, roll back if unhealthy.
# Usage: activate-release.sh <release-id>

set -euo pipefail

RELEASE_ID="${1:?release ID required}"
ROOT=/opt/familychatui
RELEASE_DIR="$ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$ROOT/current"
SERVICE="familychatui"
HEALTH_URL="http://127.0.0.1:3200/api/session"

if [[ ! "$RELEASE_ID" =~ ^[0-9a-f]{7,40}(-dirty)?-[0-9]{14}$ ]]; then
    printf 'Invalid release ID: %s\n' "$RELEASE_ID" >&2
    exit 2
fi
if [[ ! -f "$RELEASE_DIR/server.js" || ! -d "$RELEASE_DIR/.next/static" ]]; then
    printf 'Release bundle is incomplete: %s\n' "$RELEASE_DIR" >&2
    exit 1
fi

PREVIOUS_DIR="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

switch_to() {
    ln -sfn "$1" "$ROOT/current.next"
    mv -Tf "$ROOT/current.next" "$CURRENT_LINK"
    sudo systemctl restart "$SERVICE"
}

healthy() {
    local _
    for _ in $(seq 1 30); do
        if curl -fs -o /dev/null --max-time 5 "$HEALTH_URL"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

switch_to "$RELEASE_DIR"
if ! healthy; then
    printf 'Release %s failed health check\n' "$RELEASE_ID" >&2
    sudo journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
    if [[ -n "$PREVIOUS_DIR" && -d "$PREVIOUS_DIR" && "$PREVIOUS_DIR" != "$RELEASE_DIR" ]]; then
        switch_to "$PREVIOUS_DIR"
        printf 'Rolled back to %s\n' "$PREVIOUS_DIR" >&2
    fi
    exit 1
fi

# Keep the 5 newest releases, plus everything from the last 7 days; never the active one.
bash "$ROOT/deploy/prune-releases.sh" "$ROOT/releases" "$RELEASE_DIR" | sed 's:^:Removed old release :' ||
    printf 'Old release cleanup failed (the new release is live)\n' >&2

printf 'Activated release %s\n' "$RELEASE_ID"
