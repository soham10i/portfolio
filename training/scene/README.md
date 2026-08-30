# Scene Understanding (BLIP) Fine-Tuning

Fine-tune BLIP for domain-specific image captioning.

## Goal

Train BLIP to generate better captions for:
- Industrial scenes (factory floors, machinery, robots)
- Medical images (X-rays, MRI scans, tissue samples)
- Technical diagrams and schematics

## Model Choice

| Model | Size | VRAM | Best For |
|---|---|---|---|
| `Salesforce/blip-image-captioning-base` | 1.5 GB | ~4 GB | **Default** — balanced |
| `Salesforce/blip-image-captioning-large` | 2.8 GB | ~6 GB | Higher quality |

Both fit comfortably on an RTX 3090.

## Dataset Format

Create `captions.json`:
```json
[
  {
    "image": "factory_floor_01.jpg",
    "caption": "A robotic arm welding a steel frame on the production line"
  },
  {
    "image": "medical_xray_01.jpg",
    "caption": "Chest X-ray showing clear lung fields with no visible infiltrates"
  }
]
```

Place images in `./data/images/`.

## Training

```bash
cd training/scene
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python train_blip.py \
  --image_dir ./data/images \
  --captions_file ./data/captions.json \
  --output_dir ./checkpoints/blip-finetuned \
  --num_epochs 5 \
  --batch_size 8
```

## Hardware

| GPU | Training Time (1,000 images, 5 epochs) | Cost (Vast.ai) |
|---|---|---|
| RTX 3090 | ~30 min | ~$0.09 |
| RTX 4090 | ~20 min | ~$0.10 |
| A100 | ~15 min | ~$0.15 |

## Expected Improvement

| Metric | Pre-trained BLIP | Fine-tuned BLIP |
|---|---|---|
| Domain accuracy | 60% | 85%+ |
| Technical term usage | Low | High |
| Caption relevance | Generic | Domain-specific |

## Integration

After fine-tuning, update `scene-api/main.py` to load your checkpoint:

```python
MODEL_NAME = os.getenv("MODEL_NAME", "./checkpoints/blip-finetuned")
```

Or upload to HuggingFace Hub:
```bash
huggingface-cli upload yourname/blip-factory ./checkpoints/blip-finetuned
```

## Files

| File | Purpose |
|---|---|
| `train_blip.py` | Fine-tuning script |
| `requirements.txt` | Dependencies |

## Data Collection Tips

1. **Collect 500–2,000 image-caption pairs** for your domain
2. **Captions should be specific** — not "a machine" but "a CNC lathe cutting a titanium rod"
3. **Include variety** — different angles, lighting, object configurations
4. **Medical images** — ensure HIPAA compliance; use synthetic or public datasets

## Public Datasets

| Dataset | Domain | Size | URL |
|---|---|---|---|
| **Conceptual Captions** | General | 3.3M | [conceptualcaptions.com](https://ai.google.com/research/ConceptualCaptions) |
| **LAION-400M** | General | 400M | [laion.ai](https://laion.ai/blog/laion-400-open-dataset) |
| **RSICD** | Remote sensing | 10K | [Github](https://github.com/201528014227051/RSICD_optimal) |
| **IU X-Ray** | Medical | 7K | [Open-i](https://openi.nlm.nih.gov) |

---

*For industrial domains, collecting your own data (500–1000 images with captions) often outperforms generic pre-training.*
