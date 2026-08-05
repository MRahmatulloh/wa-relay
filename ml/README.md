# Job extract model (Flan-T5-small)

Local seq2seq model: WhatsApp transfer text → `[{from,to,price,currency}]`.

## 1. Export silver dataset

```bash
cd backend
npm run dataset:export -- --in ../../messages.json --out ../ml/data
```

## 2. Download base model (only safetensors + tokenizer)

Hugging Face to‘g‘ridan-to‘g‘ri sekin/uzilishi mumkin. Faqat kerakli fayllar (~300MB):

```bash
# Windows PowerShell
$env:HF_TOKEN="hf_..."
$env:OUT_DIR="ml/.cache/manual/flan-t5-small"
$env:HF_HUB_DISABLE_XET=1
pip install -U huggingface_hub
python ml/download_base.py
```

Yoki brauzerdan saqlang:
`https://huggingface.co/google/flan-t5-small/resolve/main/model.safetensors`
→ `ml/.cache/manual/flan-t5-small/model.safetensors` (~294 MB).

Tezroq multi-connection (aria2):

```bash
aria2c -x 16 -s 16 -k 1M --continue=true \
  --header="Authorization: Bearer $HF_TOKEN" \
  -d ml/.cache/manual/flan-t5-small -o model.safetensors \
  https://huggingface.co/google/flan-t5-small/resolve/main/model.safetensors
```

## 3. Train

```bash
cd ml
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
python train.py --train data/train.jsonl --val data/val.jsonl \
  --base .cache/manual/flan-t5-small --out artifacts/model --epochs 1 --batch 2
python eval.py --model artifacts/model --val data/val.jsonl
```

## 4. Serve

```bash
set MODEL_DIR=artifacts/model
uvicorn serve:app --host 0.0.0.0 --port 8000
# Docker host port: http://localhost:8282/health
```

`POST /extract` body: `{"text":"..."}` → `{"jobs":[...],"parseSource":"own_model"}`.

## Docker

Mount a trained checkpoint:

```bash
docker compose up -d --build job-extract
```

Train with local base (no re-download from Hub):

```bash
docker run --rm -e PYTHONUNBUFFERED=1 \
  -v "$PWD/ml/data:/data:ro" \
  -v "$PWD/ml/.cache/manual/flan-t5-small:/base:ro" \
  -v "$PWD/ml/artifacts:/artifacts" \
  wa-relay-job-extract \
  python -u train.py --train /data/train.jsonl --val /data/val.jsonl \
    --base /base --out /artifacts/model --epochs 1 --batch 2
```
