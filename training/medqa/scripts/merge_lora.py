#!/usr/bin/env python3
"""Merge LoRA adapters back into the base model for deployment."""

import argparse
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", required=True, help="Base model HF ID or path")
    parser.add_argument("--adapter", required=True, help="LoRA adapter checkpoint path")
    parser.add_argument("--output", required=True, help="Output path for merged model")
    parser.add_argument("--push_to_hub", help="HF hub repo to push to (optional)")
    args = parser.parse_args()

    print(f"[Merge] Loading base model: {args.base_model}")
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)

    print(f"[Merge] Loading adapter: {args.adapter}")
    model = PeftModel.from_pretrained(model, args.adapter)

    print("[Merge] Merging adapters...")
    model = model.merge_and_unload()

    print(f"[Merge] Saving to: {args.output}")
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)

    if args.push_to_hub:
        print(f"[Merge] Pushing to HuggingFace Hub: {args.push_to_hub}")
        model.push_to_hub(args.push_to_hub)
        tokenizer.push_to_hub(args.push_to_hub)

    print("[Merge] Done!")


if __name__ == "__main__":
    main()
