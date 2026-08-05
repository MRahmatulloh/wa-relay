#!/usr/bin/env python3
"""Download only the files needed for Flan-T5-small fine-tuning."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

FILES = [
    "config.json",
    "generation_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "spiece.model",
    "model.safetensors",
]


def main() -> None:
    out = Path(os.environ.get("OUT_DIR", "artifacts/base/flan-t5-small"))
    out.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    endpoint = os.environ.get("HF_ENDPOINT") or None
    kwargs = {"repo_id": "google/flan-t5-small", "local_dir": str(out), "token": token}
    if endpoint:
        kwargs["endpoint"] = endpoint

    for name in FILES:
        print(f"GET {name}", flush=True)
        path = hf_hub_download(filename=name, **kwargs)
        size = Path(path).stat().st_size
        print(f"OK {name} ({size} bytes)", flush=True)

    weights = out / "model.safetensors"
    if not weights.exists() or weights.stat().st_size < 100_000_000:
        raise SystemExit(f"model.safetensors missing or too small: {weights}")
    print(f"DOWNLOAD_OK {out}", flush=True)


if __name__ == "__main__":
    main()
