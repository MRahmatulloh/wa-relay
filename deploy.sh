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

echo "==> health"
if curl -fsS --max-time 10 "http://127.0.0.1:4500/health"; then
  echo
  echo "Deploy OK"
else
  echo
  echo "WARN: health check failed — check logs: docker compose logs -f backend" >&2
  exit 1
fi