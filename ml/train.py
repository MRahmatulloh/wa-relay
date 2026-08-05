#!/usr/bin/env python3
"""Fine-tune Flan-T5-small for transfer job JSON extraction."""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import torch
from datasets import Dataset
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
)

PROMPT = """Extract transfer jobs as JSON array with from,to,price,currency.
Message:
<<<
{text}
>>>
"""


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def jobs_target(jobs: list[dict]) -> str:
    compact = []
    for j in jobs:
        compact.append(
            {
                "from": j.get("from"),
                "to": j.get("to"),
                "price": j.get("price"),
                "currency": j.get("currency") or "GBP",
            }
        )
    return json.dumps(compact, ensure_ascii=False, separators=(",", ":"))


def to_hf(rows: list[dict]) -> Dataset:
    return Dataset.from_list(
        [
            {
                "input_text": PROMPT.format(text=r.get("text") or ""),
                "target_text": jobs_target(r.get("jobs") or []),
            }
            for r in rows
            if (r.get("text") or "").strip()
        ]
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=Path, required=True)
    ap.add_argument("--val", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("artifacts/model"))
    ap.add_argument("--base", default="google/flan-t5-small")
    ap.add_argument("--epochs", type=float, default=3.0)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--max-source", type=int, default=512)
    ap.add_argument("--max-target", type=int, default=256)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)

    train_rows = load_jsonl(args.train)
    val_rows = load_jsonl(args.val)
    if not train_rows:
        raise SystemExit("Train set is empty")

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.base)

    def tokenize(batch):
        model_inputs = tokenizer(
            batch["input_text"],
            max_length=args.max_source,
            truncation=True,
            padding=False,
        )
        labels = tokenizer(
            text_target=batch["target_text"],
            max_length=args.max_target,
            truncation=True,
            padding=False,
        )
        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    train_ds = to_hf(train_rows).map(tokenize, batched=True, remove_columns=["input_text", "target_text"])
    val_ds = to_hf(val_rows).map(tokenize, batched=True, remove_columns=["input_text", "target_text"]) if val_rows else None

    args.out.mkdir(parents=True, exist_ok=True)
    use_fp16 = torch.cuda.is_available()

    # transformers 4.4x+: eval_strategy; older: evaluation_strategy
    ta_kwargs = dict(
        output_dir=str(args.out / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        learning_rate=args.lr,
        save_strategy="epoch",
        logging_steps=50,
        predict_with_generate=True,
        fp16=use_fp16,
        report_to=[],
        load_best_model_at_end=bool(val_ds),
        metric_for_best_model="eval_loss" if val_ds is not None else None,
        greater_is_better=False,
        save_total_limit=2,
    )
    try:
        training_args = Seq2SeqTrainingArguments(
            **ta_kwargs,
            eval_strategy="epoch" if val_ds is not None else "no",
        )
    except TypeError:
        training_args = Seq2SeqTrainingArguments(
            **ta_kwargs,
            evaluation_strategy="epoch" if val_ds is not None else "no",
        )

    collator = DataCollatorForSeq2Seq(tokenizer=tokenizer, model=model)
    trainer_kwargs = dict(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=collator,
    )
    try:
        trainer = Seq2SeqTrainer(**trainer_kwargs, processing_class=tokenizer)
    except TypeError:
        trainer = Seq2SeqTrainer(**trainer_kwargs, tokenizer=tokenizer)
    trainer.train()
    trainer.save_model(str(args.out))
    tokenizer.save_pretrained(str(args.out))
    print(f"Saved model to {args.out}")


if __name__ == "__main__":
    main()
