#!/bin/sh
# Applies Prisma migrations and then every seed/*.sql file, in filename order.
# Runs inside the "migrate" service on every `docker compose up`.
set -eu

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA="$APP_DIR/prisma/schema.prisma"
PRISMA="npx --yes prisma@6.16.2"

# Run from a directory outside the mounted project so npx does not pick up
# the host's node_modules (which may be built for another OS).
cd /tmp

echo "Applying database migrations..."
attempt=0
until $PRISMA migrate deploy --schema "$SCHEMA"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 10 ]; then
    echo "Database is not reachable after $attempt attempts, giving up." >&2
    exit 1
  fi
  echo "Database not ready yet, retrying in 3s (attempt $attempt/10)..."
  sleep 3
done

echo "Applying seed files..."
for file in "$APP_DIR"/seed/*.sql; do
  [ -e "$file" ] || continue
  echo "  -> $file"
  $PRISMA db execute --schema "$SCHEMA" --file "$file"
done

echo "Database is up to date."
