#!/usr/bin/env python3
"""Quick inference test for the fine-tuned MedQA model."""

import argparse
import json
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path or HF ID of the model")
    parser.add_argument("--question", required=True, help="Medical question")
    parser.add_argument("--options", required=True, help="Comma-separated options")
    args = parser.parse_args()

    print(f"[Test] Loading model: {args.model}")
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)

    options_list = args.options.split(",")
    options_text = "\n".join([f"{chr(65+i)}. {opt.strip()}" for i, opt in enumerate(options_list)])

    system_msg = (
        "You are a medical expert assistant. Answer the multiple-choice question. "
        "Respond ONLY with JSON: {\"answer\": \"A\", \"explanation\": \"...\", \"confidence\": 0.85}"
    )
    user_msg = f"Question:\n{args.question}\n\nOptions:\n{options_text}"

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]

    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    print("[Test] Generating...")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,
            temperature=0.3,
            do_sample=True,
            top_p=0.9,
        )

    response = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
    print(f"\n[Response]\n{response}\n")

    # Try to parse JSON
    try:
        json_match = response[response.find("{"):response.rfind("}")+1]
        parsed = json.loads(json_match)
        print(f"[Parsed] Answer: {parsed.get('answer')}")
        print(f"[Parsed] Confidence: {parsed.get('confidence')}")
        print(f"[Parsed] Explanation: {parsed.get('explanation', '')[:100]}...")
    except Exception as e:
        print(f"[Parse Error] {e}")
        print(f"[Raw] {response}")


if __name__ == "__main__":
    main()
