# MedQA Model Fine-Tuning

Fine-tune a 7B–14B medical LLM with QLoRA for medical question answering.

## Goal

Train a model that:
1. Reads a medical question + options
2. Retrieves relevant evidence (RAG)
3. Generates an answer with reasoning
4. Output format: JSON with `answer`, `explanation`, `confidence`

## Model Choice

| Model | VRAM (QLoRA 4-bit) | Medical Knowledge | Best For |
|---|---|---|---|
| **Qwen2.5-7B-Instruct** | ~8 GB | Good | Balanced |
| **Qwen2.5-14B-Instruct** | ~14 GB | Very good | Best on RTX 3090 |
| **Llama-3.1-8B-Instruct** | ~8 GB | Good | Fast inference |
| **Mistral-7B-Instruct-v0.3** | ~8 GB | Good | Long context |

**Recommendation:** Start with **Qwen2.5-7B-Instruct** for training speed. Upgrade to 14B if quality isn't sufficient.

## Datasets

| Dataset | Size | Source |
|---|---|---|
| **MedQA (USMLE)** | 10,178 train / 1,273 test | [github.com/jind11/MedQA](https://github.com/jind11/MedQA) |
| **PubMedQA** | 1,000 labeled | [pubmedqa.github.io](https://pubmedqa.github.io) |
| **MedMCQA** | 194,000 | [medmcqa.github.io](https://medmcqa.github.io) |
| **Your seed data** | 120 pairs | `backend/data/medqa-seed.json` |

## Training Method: QLoRA

QLoRA (Quantized Low-Rank Adaptation) lets you fine-tune large models on consumer GPUs:
- Base model in 4-bit quantization (~4× memory reduction)
- Only LoRA adapters are trained (~1% of parameters)
- Final adapter: ~10–500 MB
- Can be merged back into base model for deployment

## Hardware Requirements

| GPU | VRAM | Can Train | Can Infer |
|---|---|---|---|
| RTX 3090 | 24 GB | 7B, 14B QLoRA | 7B, 14B, 70B |
| RTX 4090 | 24 GB | 7B, 14B QLoRA | 7B, 14B, 70B |
| A100 (40 GB) | 40 GB | 70B QLoRA | All |

## Quick Start

### 1. Install Dependencies

```bash
cd training/medqa
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Prepare Dataset

```bash
# Download MedQA
python scripts/download_medqa.py

# Or use your seed data
python scripts/prepare_from_seed.py \
  --input ../../backend/data/medqa-seed.json \
  --output ./data/medqa-formatted.jsonl
```

### 3. Train

```bash
python train.py \
  --model_name Qwen/Qwen2.5-7B-Instruct \
  --dataset ./data/medqa-formatted.jsonl \
  --output_dir ./checkpoints/qwen-7b-medqa \
  --num_epochs 3 \
  --batch_size 4 \
  --learning_rate 2e-4 \
  --lora_r 16 \
  --lora_alpha 32
```

### 4. Merge & Export

```bash
python scripts/merge_lora.py \
  --base_model Qwen/Qwen2.5-7B-Instruct \
  --adapter ./checkpoints/qwen-7b-medqa \
  --output ./models/qwen-7b-medqa-merged
```

### 5. Test

```bash
python scripts/test_model.py \
  --model ./models/qwen-7b-medqa-merged \
  --question "A 45-year-old man has chest pain. First line treatment?" \
  --options "Aspirin,Morphine,Nitroglycerin,Oxygen"
```

### 6. Deploy

```bash
# Upload to HuggingFace Hub
huggingface-cli upload yourname/qwen-7b-medqa ./models/qwen-7b-medqa-merged

# Or deploy directly on Vast.ai
./scripts/deploy-to-vastai.sh ./models/qwen-7b-medqa-merged
```

## Training Script Details

See `train.py` for the full implementation with:
- QLoRA configuration (r, alpha, dropout, target modules)
- Gradient checkpointing for memory efficiency
- Mixed precision training (bf16/fp16)
- Learning rate scheduling (cosine with warmup)
- Checkpointing every N steps
- WandB logging (optional)

## Expected Results

| Model | Dataset | Epochs | MedQA Accuracy | Training Time | Cost (Vast.ai RTX 3090) |
|---|---|---|---|---|---|
| Qwen2.5-7B | MedQA | 3 | ~55–60% | ~2 hrs | ~$0.36 |
| Qwen2.5-14B | MedQA | 3 | ~58–63% | ~4 hrs | ~$0.72 |

> Baseline (no fine-tuning): ~45% on MedQA test set.

## Output Format

The fine-tuned model generates answers in this JSON format:

```json
{
  "answer": "A",
  "explanation": "Aspirin is the first-line treatment for suspected acute coronary syndrome...",
  "confidence": 0.87
}
```

This matches what your current RAG pipeline expects.

## Integration with Portfolio

After fine-tuning, update your portfolio backend:

1. **Option A: Replace OpenRouter with self-hosted vLLM**
   - Deploy the merged model with vLLM on Vast.ai
   - Set `LLM_API_BASE` to your vLLM endpoint
   - All chat, MedQA, and SceneLab now use your fine-tuned model

2. **Option B: Use as MedQA-specific model**
   - Keep OpenRouter for general chat
   - Add a new env var `MEDQA_MODEL_URL` pointing to your fine-tuned model
   - Route MedQA queries to it, general chat to OpenRouter

## Files

| File | Purpose |
|---|---|
| `train.py` | Main QLoRA training script |
| `requirements.txt` | Training dependencies |
| `scripts/download_medqa.py` | Download MedQA dataset |
| `scripts/prepare_from_seed.py` | Convert seed.json to training format |
| `scripts/merge_lora.py` | Merge LoRA adapters into base model |
| `scripts/test_model.py` | Quick inference test |
| `scripts/deploy-to-vastai.sh` | Deploy merged model to Vast.ai |

## Resources

- [QLoRA Paper](https://arxiv.org/abs/2305.14314)
- [PEFT Library Docs](https://huggingface.co/docs/peft)
- [MedQA Dataset](https://github.com/jind11/MedQA)
