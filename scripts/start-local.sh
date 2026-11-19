#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000/api/health}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000/index.html}"
BACKEND_PID=""

cleanup() {
    trap - EXIT INT TERM
    if [[ -n "$BACKEND_PID" ]]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

for command in node npm docker curl; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Missing required command: $command" >&2
        exit 1
    fi
done

if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "Created .env from .env.example."
fi

if [[ ! -d node_modules ]]; then
    echo "Installing npm dependencies..."
    npm ci
fi

echo "Starting PostgreSQL..."
RUNNING_DB="$(docker ps --filter "publish=5432" --filter "status=running" --format '{{.Names}}' | head -n 1)"
if [[ -n "$RUNNING_DB" ]]; then
    echo "Reusing existing PostgreSQL container: $RUNNING_DB"
else
    docker compose up -d --wait db
fi

echo "Running database migrations..."
npm run db:migrate

echo "Starting backend..."
node --env-file=.env server.js &
BACKEND_PID=$!

for attempt in $(seq 1 30); do
    if curl --fail --silent "$BACKEND_URL" >/dev/null 2>&1 && curl --fail --silent "$FRONTEND_URL" >/dev/null 2>&1; then
        break
    fi
    if [[ "$attempt" -eq 30 ]]; then
        echo "Services did not become ready. Check backend output above and Docker status." >&2
        exit 1
    fi
    sleep 1
done

echo
echo "CareerConnect is running."
echo "Frontend: $FRONTEND_URL"
echo "Backend:  http://127.0.0.1:3000/api/health"
echo
echo "Press Ctrl+C to stop the backend and frontend."

if [[ "${1:-}" != "--no-browser" ]]; then
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$FRONTEND_URL" >/dev/null 2>&1 &
    elif command -v gio >/dev/null 2>&1; then
        gio open "$FRONTEND_URL" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "$FRONTEND_URL" >/dev/null 2>&1 &
    else
        echo "Could not detect a browser opener; open the URL above manually."
    fi
fi

wait "$BACKEND_PID"
