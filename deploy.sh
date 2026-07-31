#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.example and configure it first." >&2
  exit 1
fi

echo "==> docker compose up -d --build"
docker compose up -d --build

echo "==> status"
docker compose ps

echo "==> waiting for health"
ok=0
for i in $(seq 1 36); do
  if curl -fsS --max-time 3 "http://127.0.0.1:4500/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -eq 1 ]]; then
  curl -fsS --max-time 5 "http://127.0.0.1:4500/health"
  echo
  echo "Deploy OK"
else
  echo "ERROR: health check failed after ~72s" >&2
  echo "==> backend logs"
  docker compose logs --tail 80 backend >&2 || true
  exit 1
fi
