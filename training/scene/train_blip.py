#!/usr/bin/env python3
"""
BLIP Image Captioning Fine-Tuning
Fine-tune BLIP on custom image-caption pairs for domain-specific scene understanding.

Usage:
    python train_blip.py \
        --image_dir ./data/images \
        --captions_file ./data/captions.json \
        --output_dir ./checkpoints/blip-finetuned \
        --num_epochs 5

Expected captions.json format:
[
    {"image": "img001.jpg", "caption": "A robotic arm assembling a circuit board"},
    ...
]
"""

import os
import argparse
import json
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from transformers import (
    BlipForConditionalGeneration,
    BlipProcessor,
    TrainingArguments,
    Trainer,
)
import torch


class ImageCaptionDataset(Dataset):
    def __init__(self, image_dir, captions, processor):
        self.image_dir = image_dir
        self.captions = captions
        self.processor = processor

    def __len__(self):
        return len(self.captions)

    def __getitem__(self, idx):
        item = self.captions[idx]
        image_path = os.path.join(self.image_dir, item["image"])
        image = Image.open(image_path).convert("RGB")
        caption = item["caption"]

        encoding = self.processor(
            images=image,
            text=caption,
            padding="max_length",
            truncation=True,
            max_length=128,
            return_tensors="pt",
        )

        # Remove batch dimension added by processor
        encoding = {k: v.squeeze(0) for k, v in encoding.items()}
        encoding["labels"] = encoding["input_ids"].clone()
        return encoding


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_name", default="Salesforce/blip-image-captioning-base", help="Base BLIP model")
    parser.add_argument("--image_dir", required=True, help="Directory containing images")
    parser.add_argument("--captions_file", required=True, help="JSON file with image-caption pairs")
    parser.add_argument("--output_dir", default="./checkpoints/blip-finetuned", help="Output directory")
    parser.add_argument("--num_epochs", type=int, default=5, help="Training epochs")
    parser.add_argument("--batch_size", type=int, default=8, help="Batch size")
    parser.add_argument("--learning_rate", type=float, default=5e-5, help="Learning rate")
    parser.add_argument("--max_length", type=int, default=128, help="Max caption length")
    return parser.parse_args()


def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"[BLIP Training] Model: {args.model_name}")
    print(f"[BLIP Training] Images: {args.image_dir}")
    print(f"[BLIP Training] Captions: {args.captions_file}")

    # Load captions
    with open(args.captions_file, "r") as f:
        captions = json.load(f)
    print(f"[BLIP Training] Loaded {len(captions)} image-caption pairs")

    # Load model & processor
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[BLIP Training] Device: {device}")

    processor = BlipProcessor.from_pretrained(args.model_name)
    model = BlipForConditionalGeneration.from_pretrained(args.model_name).to(device)

    # Create dataset
    dataset = ImageCaptionDataset(args.image_dir, captions, processor)

    # Split train/val
    train_size = int(0.95 * len(dataset))
    val_size = len(dataset) - train_size
    train_dataset, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])

    # Training arguments
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        logging_steps=50,
        save_steps=500,
        eval_strategy="steps",
        eval_steps=500,
        save_total_limit=2,
        remove_unused_columns=False,
        fp16=torch.cuda.is_available(),
        report_to="none",
    )

    # Train
    print("[BLIP Training] Starting training...")
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=lambda batch: {
            k: torch.stack([f[k] for f in batch]) for k in batch[0].keys()
        },
    )

    trainer.train()

    # Save
    print(f"[BLIP Training] Saving to {args.output_dir}")
    model.save_pretrained(args.output_dir)
    processor.save_pretrained(args.output_dir)

    print("[BLIP Training] Done!")


if __name__ == "__main__":
    main()
