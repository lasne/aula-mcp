#!/bin/sh
# Home Assistant add-on entry. Translates HA-style options (read from
# /data/options.json, populated by Supervisor) into the env vars aula-mcp's
# server entry expects, then exec's into the long-running MCP server.
set -eu

# Copy a session left at a legacy path into the persistent store.
#
# Supervisor deletes the container on every stop (remove_container defaults
# to true), so anything written on the container's own filesystem is gone
# after a restart, an update, or a watchdog start. `/config/aula-mcp` is
# such a path: `homeassistant_config` is mounted at `/homeassistant`, not
# `/config`. `/data` is the add-on's private volume and is the one path
# that survives those recreations.
#
# A bundle somebody already placed in the HA config share
# (`/config/aula-mcp` on the host, `/homeassistant/aula-mcp` in here) is
# imported when this store has no tokens.json. The same legacy file is not
# imported again after a logout — logout deletes tokens.json on purpose,
# and copying the old bundle back would sign the user in again. Touching
# or replacing that bundle changes its fingerprint and imports it once more.
migrate_aula_tokens() {
  dest=$1
  shift
  mkdir -p "$dest"
  if [ -f "$dest/tokens.json" ]; then
    return 0
  fi
  marker=$dest/.legacy-import
  for src in "$@"; do
    if [ ! -f "$src/tokens.json" ]; then
      continue
    fi
    # mtime + size identifies the bundle we last copied. GNU stat is
    # available in the add-on image (Debian) and on the dev machines that
    # run the migration test.
    fp=$(stat -c '%Y:%s' "$src/tokens.json")
    id="$src $fp"
    if [ -f "$marker" ] && [ "$(cat "$marker")" = "$id" ]; then
      echo "aula-mcp: legacy tokens at $src already imported; not signing back in"
      continue
    fi
    echo "aula-mcp: migrating tokens from $src to $dest"
    # `.` so dotfiles (.key) are included. Overwrites a leftover .key from
    # a previous logout; that key belongs to the deleted tokens.json and
    # cannot decrypt this bundle.
    cp -a "$src"/. "$dest"/
    # cp may have carried a marker out of the source. Record this source
    # after the copy so a later logout stays logged out.
    printf '%s\n' "$id" > "$marker"
    return 0
  done
}

if [ "${1:-}" = "--migrate-only" ]; then
  shift
  migrate_aula_tokens "$@"
  exit 0
fi

OPTIONS_FILE=/data/options.json

if [ -f "$OPTIONS_FILE" ]; then
  AULA_MCP_KEY="$(jq -r '.aula_mcp_key // empty' "$OPTIONS_FILE")"
  LOG="$(jq -r '.log // false' "$OPTIONS_FILE")"
  ALLOW_REMOTE="$(jq -r '.allow_remote // true' "$OPTIONS_FILE")"
else
  # Running outside Supervisor (e.g. local docker test). Fall back to env.
  AULA_MCP_KEY="${AULA_MCP_KEY:-}"
  LOG="${LOG:-false}"
  ALLOW_REMOTE="${ALLOW_REMOTE:-true}"
fi

# Private add-on volume. Holds tokens.json, the .key encryption key,
# cookies.json, and login transcripts. Do not point this at /config:
# that directory is not a mounted volume with the current map.
TOKEN_DIR=/data/aula-mcp
migrate_aula_tokens "$TOKEN_DIR" /config/aula-mcp /homeassistant/aula-mcp
export AULA_MCP_DIR="$TOKEN_DIR"
echo "aula-mcp: token store at ${AULA_MCP_DIR}"

# The MCP server refuses non-loopback binds by default; HA's whole point is
# serving the LAN, so the default `allow_remote: true` opens it up. Setting
# `allow_remote: false` keeps the MCP traffic loopback-only inside the
# container — useful if you front it with HA Ingress / a reverse proxy, but
# in that case the LAN can't reach :7878 directly so HA's MCP client
# integration won't either. Don't flip unless you know what you're doing.
if [ "$ALLOW_REMOTE" = "true" ]; then
  export AULA_MCP_HOST="0.0.0.0"
  export AULA_MCP_ALLOW_REMOTE=1
else
  export AULA_MCP_HOST="127.0.0.1"
fi

# Boot the in-addon setup/login UI on the port HA Ingress proxies to.
# config.yaml's `ingress_port` MUST stay in sync with this value.
export AULA_MCP_INGRESS_PORT=8099

if [ "$LOG" = "true" ]; then
  export AULA_MCP_LOG=1
fi

if [ -n "$AULA_MCP_KEY" ]; then
  export AULA_MCP_KEY
fi

# Read-only Aula access. Write tools stay off unless a future option sets
# AULA_MCP_WRITE=1; nothing in this add-on does.

cd /app
exec bun packages/mcp-server/src/server.ts
