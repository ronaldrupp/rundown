#!/bin/sh
set -e
# Bind mounts and fresh volumes are often root-owned (Docker creates a missing ./media as root),
# so fix ownership once, then drop to the unprivileged node user for the server itself.
if [ "$(id -u)" = 0 ]; then
  chown node:node /app/media "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
