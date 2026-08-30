# Model Training & Deployment Pipeline

Complete pipeline for fine-tuning medical QA and scene understanding models, then deploying them on GPU cloud.

---

## 📁 Directory Structure

```
training/
├── README.md                    # This file
├── medqa/                       # Medical QA fine-tuning
│   ├── README.md
│   ├── train.py                 # QLoRA training script
│   ├── requirements.txt
│   └── scripts/
│       ├── prepare_from_seed.py # Convert seed.json to training format
│       ├── merge_lora.py        # Merge adapters into base model
│       └── test_model.py        # Quick inference test
├── scene/                       # BLIP image captioning fine-tuning
│   ├── README.md
│   ├── train_blip.py
│   └── requirements.txt
└── scripts/
    └── deploy-to-vastai.sh      # Deploy merged model to Vast.ai
```

---

## 🎯 Training Workflow

### Phase 1: MedQA Fine-Tuning

```bash
cd training/medqa

# 1. Install
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Prepare data (from your 120 seed questions)
python scripts/prepare_from_seed.py \
  --input ../../backend/data/medqa-seed.json \
  --output ./data/medqa-formatted.jsonl

# 3. (Optional) Download more MedQA data
# Visit https://github.com/jind11/MedQA and add to ./data/

# 4. Train on Vast.ai RTX 3090
# SSH into your Vast.ai instance first, then:
python train.py \
  --model_name Qwen/Qwen2.5-7B-Instruct \
  --dataset ./data/medqa-formatted.jsonl \
  --output_dir ./checkpoints/qwen-7b-medqa \
  --num_epochs 3 \
  --batch_size 4

# 5. Merge adapters
python scripts/merge_lora.py \
  --base_model Qwen/Qwen2.5-7B-Instruct \
  --adapter ./checkpoints/qwen-7b-medqa \
  --output ./models/qwen-7b-medqa-merged

# 6. Test
python scripts/test_model.py \
  --model ./models/qwen-7b-medqa-merged \
  --question "A 45-year-old man has chest pain. First line treatment?" \
  --options "Aspirin,Morphine,Nitroglycerin,Oxygen"
```

**Expected:** ~55–60% accuracy on MedQA (up from ~45% baseline).
**Cost:** ~$0.36 on Vast.ai RTX 3090 (2 hours).

---

### Phase 2: BLIP Fine-Tuning (Optional)

Only if you have domain-specific images (factory, medical, etc.):

```bash
cd training/scene

# 1. Install
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Prepare data
# Put images in ./data/images/
# Create ./data/captions.json with image-caption pairs

# 3. Train
python train_blip.py \
  --image_dir ./data/images \
  --captions_file ./data/captions.json \
  --output_dir ./checkpoints/blip-finetuned \
  --num_epochs 5
```

---

### Phase 3: Deploy on Vast.ai

#### Option A: Deploy MedQA Model with vLLM

On your Vast.ai instance:

```bash
# Install vLLM
pip install vllm

# Start server
vllm serve /path/to/qwen-7b-medqa-merged \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype half \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.9
```

Test:
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-7b-medqa-merged",
    "messages": [{"role": "user", "content": "What is first line treatment for chest pain?"}]
  }'
```

#### Option B: Deploy BLIP Model

Update `scene-api/main.py` to load your fine-tuned checkpoint:

```python
MODEL_NAME = os.getenv("MODEL_NAME", "/path/to/blip-finetuned")
```

Then run:
```bash
cd scene-api
DEVICE=cuda python main.py
```

---

### Phase 4: Connect Portfolio to Fine-Tuned Models

#### Update Render Environment Variables

Go to Render Dashboard → `soham-portfolio` → Environment:

| Variable | Old Value | New Value |
|---|---|---|
| `LLM_API_BASE` | `https://openrouter.ai/api/v1` | `http://<VAST_AI_IP>:8000/v1` |
| `LLM_MODEL` | `meta-llama/llama-3.1-8b-instruct` | `qwen-7b-medqa-merged` |
| `SCENE_API_BASE` | (empty) | `http://<VAST_AI_IP>:8000` (if BLIP fine-tuned) |

#### Architecture After Deployment

```
Visitor Browser
    ├──→ Portfolio (Render) ──→ MedQA RAG ──→ Fine-tuned Qwen (Vast.ai)
    │                           └──→ Seed data + Embeddings (local)
    ├──→ SceneLab ──→ Browser YOLO ──→ Keyframes ──→ Fine-tuned BLIP (Vast.ai)
    │                                               └──→ VLM fallback (OpenRouter)
    └──→ Chat ──→ Fine-tuned Qwen (Vast.ai)
```

---

## 💰 Cost Breakdown (Training + Deployment)

| Activity | GPU | Time | Cost |
|---|---|---|---|
| MedQA QLoRA training | RTX 3090 | 2 hrs | **~$0.36** |
| BLIP fine-tuning | RTX 3090 | 0.5 hrs | **~$0.09** |
| Inference server (always-on) | RTX 3090 | 24/7 | **~$130/mo** |
| Inference server (6 hrs/day) | RTX 3090 | 6 hrs/day | **~$32/mo** |

**Pro tip:** Train once ($0.45), then run inference only when actively job searching ($32/mo for 6 hrs/day).

---

## 📊 Expected Performance

| Component | Before | After Fine-Tuning |
|---|---|---|
| MedQA Accuracy | ~45% (RAG only) | ~55–60% (RAG + fine-tuned LLM) |
| Caption Quality | Generic | Domain-specific |
| Inference Speed | ~500ms (OpenRouter) | ~100ms (self-hosted vLLM) |
| Cost per Request | $0.001–0.005 | ~$0 (after training) |

---

## 🚀 Quick Start (Copy-Paste)

Already have a Vast.ai GPU rented? Run this entire pipeline:

```bash
# SSH into Vast.ai instance
ssh -p <PORT> root@<IP>

# 1. Clone repo
git clone https://github.com/soham10i/portfolio.git
cd portfolio

# 2. Train MedQA
cd training/medqa
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/prepare_from_seed.py
python train.py --model_name Qwen/Qwen2.5-7B-Instruct \
  --dataset ./data/medqa-formatted.jsonl \
  --output_dir ./checkpoints/qwen-7b-medqa \
  --num_epochs 3
python scripts/merge_lora.py \
  --base_model Qwen/Qwen2.5-7B-Instruct \
  --adapter ./checkpoints/qwen-7b-medqa \
  --output ./models/qwen-7b-medqa-merged

# 3. Deploy with vLLM
pip install vllm
vllm serve ./models/qwen-7b-medqa-merged \
  --host 0.0.0.0 --port 8000 --dtype half

# 4. Copy the public IP from Vast.ai dashboard
# 5. Set LLM_API_BASE=http://<IP>:8000/v1 in Render
```

---

## 🔧 Troubleshooting

### "CUDA out of memory"
- Reduce `--batch_size` to 2 or 1
- Use `--gradient_accumulation_steps 8`
- Try a smaller model (7B instead of 14B)

### "Model download slow"
- Set `HF_HUB_ENABLE_HF_TRANSFER=1` for faster downloads
- Or pre-download: `huggingface-cli download Qwen/Qwen2.5-7B-Instruct`

### "vLLM won't start"
- Check GPU memory: `nvidia-smi`
- Reduce `--max-model-len` to 2048
- Use `--dtype half` instead of `bfloat16`

### "Caption quality poor after BLIP fine-tuning"
- Need more data (aim for 500+ image-caption pairs)
- Captions may be too generic — make them more specific

---

## 📚 Resources

- [QLoRA Paper](https://arxiv.org/abs/2305.14314)
- [PEFT Documentation](https://huggingface.co/docs/peft)
- [vLLM Documentation](https://docs.vllm.ai)
- [MedQA Dataset](https://github.com/jind11/MedQA)
- [BLIP Paper](https://arxiv.org/abs/2201.12086)
