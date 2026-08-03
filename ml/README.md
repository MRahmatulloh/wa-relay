# Job extract model (Flan-T5-small)

Local seq2seq model: WhatsApp transfer text → `[{from,to,price,currency}]`.

## 1. Export silver dataset

```bash
cd backend
npm run dataset:export -- --in ../../messages.json --out ../ml/data
```

## 2. Train

```bash
cd ml
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
python train.py --train data/train.jsonl --val data/val.jsonl --out artifacts/model
python eval.py --model artifacts/model --val data/val.jsonl
```

## 3. Serve

```bash
set MODEL_DIR=artifacts/model
uvicorn serve:app --host 0.0.0.0 --port 8000
```

`POST /extract` body: `{"text":"..."}` → `{"jobs":[...],"parseSource":"own_model"}`.

## Docker

Mount a trained checkpoint:

```bash
docker compose up -d --build job-extract
```
