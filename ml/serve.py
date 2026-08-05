#!/usr/bin/env python3
"""FastAPI inference for transfer job extraction."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import torch

PROMPT = """Extract transfer jobs as JSON array with from,to,price,currency.
Message:
<<<
{text}
>>>
"""

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "artifacts/model"))

app = FastAPI(title="wa-relay job-extract", version="1.0.0")

_tokenizer = None
_model = None
_device = "cpu"


def load_model() -> None:
    global _tokenizer, _model, _device
    if _model is not None:
        return
    if not model_ready():
        raise RuntimeError(f"Model not found at {MODEL_DIR}. Train first or mount artifacts.")
    _device = "cuda" if torch.cuda.is_available() else "cpu"
    _tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
    _model = AutoModelForSeq2SeqLM.from_pretrained(str(MODEL_DIR))
    _model.to(_device)
    _model.eval()


def model_ready() -> bool:
    return (MODEL_DIR / "config.json").exists()


@app.on_event("startup")
def _startup() -> None:
    # Allow health without model; /extract loads lazily and errors clearly.
    if model_ready():
        try:
            load_model()
        except Exception as exc:  # noqa: BLE001
            print(f"model load skipped: {exc}")


class ExtractIn(BaseModel):
    text: str = Field(..., min_length=1)


class JobOut(BaseModel):
    from_: str | None = Field(None, alias="from")
    to: str | None = None
    price: float | None = None
    currency: str = "GBP"

    class Config:
        populate_by_name = True


class ExtractOut(BaseModel):
    jobs: list[dict[str, Any]]
    parseSource: str = "own_model"


def _coerce_job(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    price = item.get("price")
    try:
        price_n = float(price) if price is not None else None
    except (TypeError, ValueError):
        price_n = None
    job = {
        "from": item.get("from"),
        "to": item.get("to"),
        "price": price_n,
        "currency": item.get("currency") or "GBP",
    }
    if job.get("from") or job.get("to") or job.get("price") is not None:
        return job
    return None


def _repair_json_text(s: str) -> str:
    """Fix common Flan-T5 slips like ["from":"LHR",...] → [{"from":"LHR",...}]."""
    t = s.strip()
    # Single job object written with array brackets
    if re.match(r'^\[\s*"(?:from|to|price|currency)"\s*:', t):
        t = "[{" + t[1:]
        if t.endswith("]") and not t.endswith("}]"):
            t = t[:-1] + "}]"
    # Bare object
    if t.startswith("{") and '"jobs"' not in t and re.search(r'"(?:from|to)"\s*:', t):
        t = f"[{t}]"
    return t


def parse_jobs_json(raw: str) -> list[dict[str, Any]]:
    s = raw.strip()
    # Model may wrap in markdown fences
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)

    candidates = [s, _repair_json_text(s)]
    m = re.search(r"[\[{].*[\]}]", s, re.S)
    if m:
        candidates.append(m.group(0))
        candidates.append(_repair_json_text(m.group(0)))

    data = None
    for cand in candidates:
        try:
            data = json.loads(cand)
            break
        except json.JSONDecodeError:
            continue
    if data is None:
        return []

    if isinstance(data, dict):
        if isinstance(data.get("jobs"), list):
            items = data["jobs"]
        elif any(k in data for k in ("from", "to", "price")):
            items = [data]
        else:
            return []
    elif isinstance(data, list):
        items = data
    else:
        return []

    jobs: list[dict[str, Any]] = []
    for item in items:
        job = _coerce_job(item)
        if job:
            jobs.append(job)
    return jobs


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "modelDir": str(MODEL_DIR),
        "modelReady": model_ready(),
        "modelLoaded": _model is not None,
        "device": _device,
    }


@app.post("/extract", response_model=ExtractOut)
def extract(body: ExtractIn) -> ExtractOut:
    load_model()
    assert _tokenizer is not None and _model is not None
    prompt = PROMPT.format(text=body.text)
    inputs = _tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512)
    inputs = {k: v.to(_device) for k, v in inputs.items()}
    with torch.no_grad():
        out = _model.generate(
            **inputs,
            max_new_tokens=256,
            num_beams=4,
            early_stopping=True,
        )
    text = _tokenizer.decode(out[0], skip_special_tokens=True)
    return ExtractOut(jobs=parse_jobs_json(text), parseSource="own_model")
