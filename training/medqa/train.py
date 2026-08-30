#!/usr/bin/env python3
"""
MedQA QLoRA Fine-Tuning Script
Fine-tune a 7B-14B instruct model on medical QA data using QLoRA.

Usage:
    python train.py \
        --model_name Qwen/Qwen2.5-7B-Instruct \
        --dataset ./data/medqa-formatted.jsonl \
        --output_dir ./checkpoints/qwen-7b-medqa \
        --num_epochs 3

Hardware:
    - 7B model: fits on RTX 3090/4090 (24 GB)
    - 14B model: fits on RTX 3090/4090 (24 GB) with smaller batch
    - 70B model: needs A100 (40/80 GB)
"""

import os
import argparse
import json
import torch
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    BitsAndBytesConfig,
    DataCollatorForLanguageModeling,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

# ── config ─────────────────────────────────────────────────────────────────
DEFAULT_LORA_R = 16
DEFAULT_LORA_ALPHA = 32
DEFAULT_LORA_DROPOUT = 0.05
DEFAULT_TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]


def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune a medical LLM with QLoRA")
    parser.add_argument("--model_name", type=str, required=True, help="HuggingFace model ID (e.g., Qwen/Qwen2.5-7B-Instruct)")
    parser.add_argument("--dataset", type=str, required=True, help="Path to .jsonl training data")
    parser.add_argument("--output_dir", type=str, default="./checkpoints/medqa-model", help="Checkpoint output directory")
    parser.add_argument("--num_epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--batch_size", type=int, default=4, help="Per-device batch size")
    parser.add_argument("--gradient_accumulation_steps", type=int, default=4, help="Gradient accumulation steps")
    parser.add_argument("--learning_rate", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--max_seq_length", type=int, default=2048, help="Max sequence length")
    parser.add_argument("--lora_r", type=int, default=DEFAULT_LORA_R, help="LoRA rank")
    parser.add_argument("--lora_alpha", type=int, default=DEFAULT_LORA_ALPHA, help="LoRA alpha")
    parser.add_argument("--lora_dropout", type=float, default=DEFAULT_LORA_DROPOUT, help="LoRA dropout")
    parser.add_argument("--warmup_steps", type=int, default=100, help="Warmup steps")
    parser.add_argument("--save_steps", type=int, default=500, help="Save checkpoint every N steps")
    parser.add_argument("--logging_steps", type=int, default=50, help="Log every N steps")
    parser.add_argument("--bf16", action="store_true", default=True, help="Use bfloat16")
    parser.add_argument("--fp16", action="store_true", help="Use float16 (fallback)")
    parser.add_argument("--use_wandb", action="store_true", help="Log to Weights & Biases")
    return parser.parse_args()


def load_dataset(path: str):
    """Load .jsonl file into HuggingFace Dataset."""
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            records.append(json.loads(line))
    return Dataset.from_list(records)


def format_medqa_prompt(example):
    """
    Format a medical QA example into a chat prompt.
    Expected input fields: question, options (dict), answer, explanation
    """
    question = example.get("question", "")
    options = example.get("options", {})
    answer = example.get("answer", "")
    explanation = example.get("explanation", "")

    options_text = "\n".join([f"{k}. {v}" for k, v in options.items()])

    system_msg = (
        "You are a medical expert assistant. Answer the following multiple-choice "
        "medical question. Provide your answer as a single letter (A, B, C, or D), "
        "a brief explanation, and a confidence score (0-1). "
        "Respond ONLY with valid JSON in this exact format:\n"
        '{"answer": "A", "explanation": "...", "confidence": 0.85}'
    )

    user_msg = f"Question:\n{question}\n\nOptions:\n{options_text}"

    # If we have the answer, include it for training (supervised fine-tuning)
    if answer:
        assistant_msg = json.dumps({
            "answer": answer,
            "explanation": explanation if explanation else f"The correct answer is {answer}.",
            "confidence": 0.9
        }, ensure_ascii=False)

        return {
            "text": (
                f"<|im_start|>system\n{system_msg}<|im_end|>\n"
                f"<|im_start|>user\n{user_msg}<|im_end|>\n"
                f"<|im_start|>assistant\n{assistant_msg}<|im_end|>"
            )
        }

    # For inference (no answer)
    return {
        "text": (
            f"<|im_start|>system\n{system_msg}<|im_end|>\n"
            f"<|im_start|>user\n{user_msg}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )
    }


def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"[MedQA Training] Model: {args.model_name}")
    print(f"[MedQA Training] Dataset: {args.dataset}")
    print(f"[MedQA Training] Output: {args.output_dir}")
    print(f"[MedQA Training] Epochs: {args.num_epochs} | Batch: {args.batch_size} | LR: {args.learning_rate}")

    # ── 4-bit quantization config ──
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16 if args.bf16 else torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    # ── Load model & tokenizer ──
    print("[MedQA Training] Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        attn_implementation="flash_attention_2" if torch.cuda.is_available() else None,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model_name, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    # ── Prepare for QLoRA ──
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=DEFAULT_TARGET_MODULES,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # ── Load & format dataset ──
    print("[MedQA Training] Loading dataset...")
    dataset = load_dataset(args.dataset)
    dataset = dataset.map(format_medqa_prompt, remove_columns=dataset.column_names)
    print(f"[MedQA Training] Loaded {len(dataset)} examples")

    # Split train/val
    split = dataset.train_test_split(test_size=0.05, seed=42)
    train_data = split["train"]
    val_data = split["test"]

    # ── Training arguments ──
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        optim="paged_adamw_8bit",
        learning_rate=args.learning_rate,
        warmup_steps=args.warmup_steps,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        eval_strategy="steps",
        eval_steps=args.save_steps,
        bf16=args.bf16,
        fp16=args.fp16 and not args.bf16,
        max_grad_norm=0.3,
        group_by_length=True,
        lr_scheduler_type="cosine",
        report_to="wandb" if args.use_wandb else None,
        run_name="medqa-qlora" if args.use_wandb else None,
    )

    # ── Train ──
    print("[MedQA Training] Starting training...")
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_data,
        eval_dataset=val_data,
        args=training_args,
        max_seq_length=args.max_seq_length,
        dataset_text_field="text",
    )

    trainer.train()

    # ── Save ──
    print(f"[MedQA Training] Saving to {args.output_dir}")
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    # Save training config
    with open(os.path.join(args.output_dir, "training_config.json"), "w") as f:
        json.dump(vars(args), f, indent=2)

    print("[MedQA Training] Done!")
    print(f"[MedQA Training] Adapter saved to: {args.output_dir}")
    print(f"[MedQA Training] To merge: python scripts/merge_lora.py --base_model {args.model_name} --adapter {args.output_dir}")


if __name__ == "__main__":
    main()
