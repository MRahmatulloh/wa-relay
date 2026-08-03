#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from serve import PROMPT, parse_jobs_json


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def norm(s):
    if s is None:
        return None
    return str(s).upper().replace(" ", "")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--val", type=Path, required=True)
    ap.add_argument("--limit", type=int, default=200)
    args = ap.parse_args()

    rows = load_jsonl(args.val)[: args.limit]
    tok = AutoTokenizer.from_pretrained(str(args.model))
    model = AutoModelForSeq2SeqLM.from_pretrained(str(args.model))
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device).eval()

    route_hit = 0
    price_hit = 0
    n = 0
    for r in rows:
        gold = r.get("jobs") or []
        if not gold:
            continue
        n += 1
        prompt = PROMPT.format(text=r.get("text") or "")
        inputs = tok(prompt, return_tensors="pt", truncation=True, max_length=512)
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with torch.no_grad():
            out = model.generate(**inputs, max_new_tokens=256, num_beams=4)
        pred = parse_jobs_json(tok.decode(out[0], skip_special_tokens=True))
        g0, p0 = gold[0], (pred[0] if pred else {})
        if norm(g0.get("from")) == norm(p0.get("from")) and norm(g0.get("to")) == norm(p0.get("to")):
            route_hit += 1
        if g0.get("price") is not None and p0.get("price") is not None and float(g0["price"]) == float(p0["price"]):
            price_hit += 1

    print(
        json.dumps(
            {
                "n": n,
                "routeExact": round(route_hit / n, 3) if n else 0,
                "priceExact": round(price_hit / n, 3) if n else 0,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
