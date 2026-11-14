#!/usr/bin/env bash

# The only thing the CI deploy key may run (installed as /opt/familychatui/deploy/deploy-gate and
# pinned with `command=` in authorized_keys). Two actions:
#   upload <release-id>    tar.gz of the standalone bundle on stdin -> /opt/familychatui/releases/<id>
#   activate <release-id>  switch `current`, restart, roll back if unhealthy
# The admin key can call it the same way: ssh host /opt/familychatui/deploy/deploy-gate upload <id>

set -euo pipefail

ROOT=/opt/familychatui
read -r -a ARGS <<<"${SSH_ORIGINAL_COMMAND:-$*}"
if [[ "${ARGS[0]:-}" == */deploy-gate ]]; then ARGS=("${ARGS[@]:1}"); fi
ACTION="${ARGS[0]:-}"
RELEASE_ID="${ARGS[1]:-}"

if [[ ! "$RELEASE_ID" =~ ^[0-9a-f]{7,40}(-dirty)?-[0-9]{14}$ ]]; then
    printf 'Invalid release ID\n' >&2
    exit 2
fi

case "$ACTION" in
upload)
    dir="$ROOT/releases/$RELEASE_ID"
    rm -rf "$dir"
    mkdir -p "$dir"
    tar -xzf - -C "$dir" --no-same-owner --no-same-permissions
    chmod -R a+rX "$dir"
    touch "$dir" # its age for prune-releases.sh is the upload time
    printf 'Uploaded %s\n' "$RELEASE_ID"
    ;;
activate)
    exec bash "$ROOT/deploy/activate-release.sh" "$RELEASE_ID"
    ;;
*)
    printf 'Unknown action\n' >&2
    exit 2
    ;;
esac
