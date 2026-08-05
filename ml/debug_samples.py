#!/usr/bin/env python3
import json
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from serve import PROMPT, parse_jobs_json


def main() -> None:
    rows = []
    with open("/data/val.jsonl", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= 5:
                break
            rows.append(json.loads(line))

    tok = AutoTokenizer.from_pretrained("/model")
    model = AutoModelForSeq2SeqLM.from_pretrained("/model")
    model.eval()

    for r in rows:
        prompt = PROMPT.format(text=r.get("text") or "")
        inputs = tok(prompt, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            out = model.generate(**inputs, max_new_tokens=256, num_beams=4)
        raw = tok.decode(out[0], skip_special_tokens=True)
        print("GOLD", json.dumps(r.get("jobs"), ensure_ascii=False)[:220])
        print("RAW ", raw[:300])
        print("PRED", parse_jobs_json(raw))
        print("---")


if __name__ == "__main__":
    main()
