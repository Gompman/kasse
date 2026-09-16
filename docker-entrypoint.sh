#!/bin/sh
set -e

# Unraid: nobody:users = 99:100. Ohne Angabe bleibt 1000:1000 (node).
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"
UMASK="${UMASK:-022}"

umask "$UMASK"
mkdir -p "$DATA_DIR/packs"

if [ "$(id -u)" -eq 0 ]; then
  if ! chown -R "$PUID:$PGID" "$DATA_DIR"; then
    echo "Konnte $DATA_DIR nicht auf PUID=$PUID PGID=$PGID setzen." >&2
    exit 1
  fi
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
