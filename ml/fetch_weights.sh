#!/usr/bin/env bash
set -euo pipefail
OUT_DIR="${OUT_DIR:-/out}"
TOKEN="${HF_TOKEN:-${HUGGING_FACE_HUB_TOKEN:-}}"
URL="https://huggingface.co/google/flan-t5-small/resolve/main/model.safetensors"

if [[ -z "$TOKEN" ]]; then
  echo "HF_TOKEN missing" >&2
  exit 1
fi

apt-get update -qq
apt-get install -y -qq aria2 ca-certificates >/dev/null

# Drop truncated file if clearly too small
if [[ -f "$OUT_DIR/model.safetensors" ]]; then
  size=$(stat -c%s "$OUT_DIR/model.safetensors" || echo 0)
  if [[ "$size" -lt 100000000 ]]; then
    echo "Removing truncated model.safetensors ($size bytes)"
    rm -f "$OUT_DIR/model.safetensors" "$OUT_DIR/model.safetensors.aria2"
  fi
fi

echo "Downloading model.safetensors via aria2 (-x 16)..."
aria2c -x 16 -s 16 -k 1M \
  --continue=true \
  --max-tries=0 \
  --retry-wait=5 \
  --timeout=60 \
  --connect-timeout=30 \
  --dir="$OUT_DIR" \
  --out=model.safetensors \
  --header="Authorization: Bearer ${TOKEN}" \
  "$URL"

size=$(stat -c%s "$OUT_DIR/model.safetensors")
echo "DONE size=$size"
if [[ "$size" -lt 250000000 ]]; then
  echo "File still too small" >&2
  exit 2
fi
