# Cost-Optimized Training & Deployment Strategy

**Goal:** Train models for cheap, deploy for cheap, use free tiers everywhere possible.

**Student Budget:** Under $20 total for training + deployment setup.

---

## 💰 The Smart Money Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              TRAINING PHASE (One-Time)                      │
│                                                                             │
│  Google Colab Pro ($10/month) ──► Fine-tune MedQA + BLIP                   │
│  ├─ 100 compute units/month                                                │
│  ├─ T4 GPU (16 GB) or occasional A100                                      │
│  ├─ Train MedQA QLoRA: ~3-4 hours                                          │
│  ├─ Train BLIP: ~1-2 hours                                                 │
│  └─ Total: ~$10 one-time                                                   │
│                                                                             │
│  Output: LoRA adapters + merged models                                     │
│  Upload to: HuggingFace Hub (FREE)                                         │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           INFERENCE PHASE (Ongoing)                         │
│                                                                             │
│  Option A: RunPod Serverless (CHEAPEST)                                    │
│  ├─ Load model from HuggingFace Hub                                        │
│  ├─ Pay: ~$0.001/request                                                   │
│  ├─ Scales to zero: $0 when idle                                           │
│  └─ Best for: Portfolio with sporadic traffic                              │
│                                                                             │
│  Option B: Vast.ai On-Demand                                               │
│  ├─ Rent GPU only when demoing                                             │
│  ├─ Pay: ~$0.18/hr while running                                          │
│  ├─ Destroy when done: $0                                                 │
│  └─ Best for: Interview days, demo calls                                   │
│                                                                             │
│  Option C: OpenRouter Free Tier (FALLBACK)                                 │
│  ├─ 200 requests/day on free models                                        │
│  ├─ Cost: $0                                                               │
│  └─ Best for: Always-on fallback when self-hosted is down                  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Recommended Strategy

### Phase 1: Training on Colab Pro ($10 one-time)

#### Why Colab Pro?

| Factor | Colab Pro | Vast.ai | Lambda Labs |
|---|---|---|---|
| **Cost** | **$10/month** | $0.18/hr | $0.60/hr |
| **MedQA Training** | ~3 hrs = $1.25 | $0.54 | $1.80 |
| **BLIP Training** | ~1 hr = $0.42 | $0.18 | $0.60 |
| **Convenience** | ⭐ Notebook UI | SSH + CLI | SSH + CLI |
| **Preemptible?** | ⚠️ Yes (rare) | No | No |
| **Save models?** | Drive/HF Hub | Disk | Disk |

**Verdict:** Colab Pro is cheaper AND easier for training. You get a Jupyter notebook with everything pre-installed.

#### Colab Pro Notebook Setup

1. **Subscribe:** [colab.research.google.com/signup](https://colab.research.google.com/signup) → $10/month
2. **Connect to GPU:** Runtime → Change runtime type → GPU T4 (or A100 if available)
3. **Mount Drive:** `from google.colab import drive; drive.mount('/content/drive')`
4. **Clone repo:** `!git clone https://github.com/soham10i/portfolio.git`
5. **Run training:** Execute cells in the notebook

#### Ready-to-Use Colab Notebook

Create `training/colab/MedQA_Training.ipynb`:

```python
# Cell 1: Setup
!pip install -q transformers peft bitsandbytes trl datasets accelerate
!git clone https://github.com/soham10i/portfolio.git

# Cell 2: Mount Drive (to save models)
from google.colab import drive
drive.mount('/content/drive')

# Cell 3: Prepare Data
import json
with open('/content/portfolio/backend/data/medqa-seed.json') as f:
    data = json.load(f)

# Convert to training format
records = []
for item in data['records'] if 'records' in data else data:
    records.append({
        "question": item["question"],
        "options": item["options"],
        "answer": item["answer"],
        "explanation": item.get("explanation", "")
    })

with open('/content/medqa-train.jsonl', 'w') as f:
    for r in records:
        f.write(json.dumps(r) + '\n')

print(f"Prepared {len(records)} training examples")

# Cell 4: Download MedQA (optional - for more data)
!wget -q https://raw.githubusercontent.com/jind11/MedQA/master/data_clean/questions/US/4_options/phrases_no_exclude_train.jsonl

# Cell 5: Train
%cd /content/portfolio/training/medqa
!python train.py \
  --model_name Qwen/Qwen2.5-7B-Instruct \
  --dataset /content/medqa-train.jsonl \
  --output_dir /content/drive/MyDrive/medqa-checkpoints/qwen-7b-medqa \
  --num_epochs 3 \
  --batch_size 4 \
  --learning_rate 2e-4

# Cell 6: Merge & Save
!python scripts/merge_lora.py \
  --base_model Qwen/Qwen2.5-7B-Instruct \
  --adapter /content/drive/MyDrive/medqa-checkpoints/qwen-7b-medqa \
  --output /content/drive/MyDrive/medqa-models/qwen-7b-medqa-merged

# Cell 7: Upload to HuggingFace Hub
from huggingface_hub import HfApi
api = HfApi()
api.create_repo("your-username/qwen-7b-medqa", exist_ok=True)
api.upload_folder(
    folder_path="/content/drive/MyDrive/medqa-models/qwen-7b-medqa-merged",
    repo_id="your-username/qwen-7b-medqa"
)
print("Uploaded to HuggingFace Hub!")
```

### Phase 2: Deploy for Inference

#### Option A: RunPod Serverless (Recommended)

**Why:** Cheapest for sporadic portfolio traffic. Scales to zero.

**Steps:**
1. Build Docker image with your fine-tuned model
2. Push to Docker Hub
3. Create RunPod Serverless endpoint
4. Set `SCENE_API_BASE` and `LLM_API_BASE` in Render

**Cost:** ~$0.001/request → **~$0–2/month** for portfolio traffic

#### Option B: Vast.ai On-Demand

**Why:** Full control. Turn on for demos, off otherwise.

**Steps:**
1. Rent RTX 3090 when needed (~$0.18/hr)
2. Load model from HuggingFace Hub
3. Run vLLM
4. Set URLs in Render
5. **Destroy instance when done**

**Cost:** $0 when off, ~$0.18/hr when on

#### Option C: OpenRouter Free Tier (Fallback)

**Why:** Always works. Zero setup. 200 req/day free.

**Setup:**
- Keep `LLM_API_BASE=https://openrouter.ai/api/v1`
- Use for general chat and MedQA
- Fine-tuned model only for demo-specific showcases

**Cost:** $0 (free tier)

---

## 📊 Cost Comparison: 3 Strategies

### Strategy 1: All Vast.ai (Original Plan)

| Phase | GPU | Time | Cost |
|---|---|---|---|
| Training MedQA | RTX 3090 | 2 hrs | $0.36 |
| Training BLIP | RTX 3090 | 0.5 hrs | $0.09 |
| Inference (always-on) | RTX 3090 | 24/7 | **$130/month** |
| **Total First Month** | | | **~$130.45** |

### Strategy 2: Colab Pro + RunPod Serverless (OPTIMAL)

| Phase | Service | Time | Cost |
|---|---|---|---|
| Training MedQA | Colab Pro T4 | 3 hrs | ~$1.25* |
| Training BLIP | Colab Pro T4 | 1 hr | ~$0.42* |
| Upload to HF Hub | HuggingFace | — | **$0** |
| Inference | RunPod Serverless | ~500 requests | ~$0.50 |
| **Total First Month** | | | **~$12.17** |

*Included in $10 Colab Pro subscription

### Strategy 3: Colab Pro + Vast.ai On-Demand (FLEXIBLE)

| Phase | Service | Time | Cost |
|---|---|---|---|
| Training MedQA | Colab Pro T4 | 3 hrs | ~$1.25* |
| Training BLIP | Colab Pro T4 | 1 hr | ~$0.42* |
| Inference (demo days only) | Vast.ai RTX 3090 | 20 hrs/month | **$3.60** |
| **Total First Month** | | | **~$15.27** |

*Included in $10 Colab Pro subscription

---

## 🏆 My Recommendation: Strategy 2 (Colab Pro + RunPod Serverless)

### Week 1: Train Everything

1. **Subscribe to Colab Pro** ($10)
2. **Run MedQA training** (~3 hrs)
3. **Run BLIP training** (~1 hr)
4. **Upload models to HuggingFace Hub**
5. **Cancel Colab Pro** (if only needed for one month)

**Total: $10**

### Week 2+: Deploy & Run

1. **Create RunPod Serverless endpoint** for MedQA model
2. **Create RunPod Serverless endpoint** for BLIP model
3. **Set URLs in Render dashboard**
4. **Use OpenRouter as fallback**

**Ongoing: ~$0–2/month**

---

## 🔧 Implementation Steps

### Step 1: Train on Colab Pro

```bash
# In Colab notebook
!git clone https://github.com/soham10i/portfolio.git
%cd portfolio/training/medqa
!pip install -r requirements.txt
!python train.py --model_name Qwen/Qwen2.5-7B-Instruct --dataset ./data/medqa-formatted.jsonl --output_dir /content/drive/MyDrive/medqa-checkpoints --num_epochs 3
```

### Step 2: Upload to HuggingFace Hub

```python
from huggingface_hub import HfApi
api = HfApi()
api.create_repo("your-username/qwen-medqa", exist_ok=True)
api.upload_folder(folder_path="/content/drive/MyDrive/medqa-models", repo_id="your-username/qwen-medqa")
```

### Step 3: Deploy on RunPod Serverless

Create a Dockerfile that loads from HuggingFace Hub:

```dockerfile
FROM vllm/vllm-openai:latest
ENV MODEL_NAME=your-username/qwen-medqa
CMD ["python", "-m", "vllm.entrypoints.openai.api_server", "--model", "your-username/qwen-medqa", "--host", "0.0.0.0", "--port", "8000"]
```

Push to Docker Hub → Create RunPod endpoint.

### Step 4: Update Render

```
LLM_API_BASE=https://api.runpod.ai/v2/your-endpoint-id/runsync
LLM_MODEL=your-username/qwen-medqa
```

---

## ⚠️ Important Notes

### Colab Pro Limitations
- **Preemption:** Long-running jobs may be interrupted (save checkpoints frequently)
- **Timeout:** Idle notebooks disconnect after 90 minutes
- **Solution:** Use `!wget` or `!curl` in cells, save to Drive every epoch

### RunPod Serverless Limitations
- **Cold start:** ~5-10 seconds first request
- **Solution:** Set `minWorkers: 1` for always-ready (costs more)

### OpenRouter as Fallback
- Always keep OpenRouter configured as backup
- If RunPod is cold-starting or down, switch to OpenRouter instantly
- Your portfolio should handle both gracefully

---

## 📊 Final Numbers

| Item | Cost |
|---|---|
| Colab Pro (1 month) | **$10** |
| HuggingFace Hub | **$0** |
| RunPod Serverless | **~$0–2/month** |
| Render (portfolio web) | **$0** (Free tier) |
| OpenRouter (fallback) | **$0** (Free tier) |
| **Total Setup** | **$10** |
| **Total Monthly** | **~$0–2** |

Compare to Strategy 1 (all Vast.ai): **$130/month**

**You save ~$120/month with this approach.**

---

## 🚀 Quick Start

1. **Right now:** Go to [colab.research.google.com/signup](https://colab.research.google.com/signup) → Pay $10
2. **Today:** Open the training notebook, run MedQA training (~3 hrs)
3. **Tomorrow:** Upload model to HuggingFace Hub, create RunPod endpoint
4. **This week:** Update Render env vars, test end-to-end
5. **Cancel Colab Pro** after training is done

---

*This strategy maximizes free tiers and minimizes GPU rental time. Training is done once on cheap Colab Pro, inference is served on serverless pay-per-request.*
