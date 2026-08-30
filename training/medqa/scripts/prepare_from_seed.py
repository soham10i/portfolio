#!/usr/bin/env python3
"""Convert backend/data/medqa-seed.json to training format (.jsonl)."""

import json
import argparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="../../backend/data/medqa-seed.json", help="Input seed JSON")
    parser.add_argument("--output", default="./data/medqa-formatted.jsonl", help="Output .jsonl")
    args = parser.parse_args()

    with open(args.input, "r") as f:
        data = json.load(f)

    records = data if isinstance(data, list) else data.get("records", [])

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        for record in records:
            options = record.get("options", {})
            if isinstance(options, list):
                options = {chr(65+i): opt for i, opt in enumerate(options)}

            out = {
                "question": record.get("question", ""),
                "options": options,
                "answer": record.get("answer", ""),
                "explanation": record.get("explanation", ""),
            }
            f.write(json.dumps(out, ensure_ascii=False) + "\n")

    print(f"[Prepare] Wrote {len(records)} records to {args.output}")


if __name__ == "__main__":
    import os
    main()
