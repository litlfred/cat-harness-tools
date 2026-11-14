#!/usr/bin/env python3
"""
opus-mt-runner — the local OPUS-MT runner `translate-pot.ts --engine opus-mt`
calls. Helsinki-NLP Marian models (CC-BY 4.0), run on this machine; nothing is
sent to a translation service.

    bun run cat-harness-tools/scripts/translate-pot.ts --root <layer> \
      --engine opus-mt --runner "python3 cat-harness-tools/scripts/opus-mt-runner.py"

Reads ONE JSON request on stdin and writes ONE JSON response on stdout:

    -> {"source": "en", "target": "es", "model": "Helsinki-NLP/opus-mt-en-es",
        "targetToken": null, "texts": ["..."]}
    <- {"translations": ["..."]}

`targetToken` (`>>ara<<`, `>>cmn_Hans<<`) is put in front of each text for the
multi-target `en-ar` and `en-zh` models, which need it.

Needs `transformers` with `torch` and `sentencepiece` (the `extended` tier of
`schemas/sdlc/python-deps.ts`, not installed in CI). The model is loaded from
the Hugging Face cache, downloaded once on first use unless HF_HUB_OFFLINE=1;
set `--model-dir DIR` to load a checkout you already have instead.

The caller checks every placeholder; this runner only translates.
"""
import argparse
import json
import sys


def translate(texts, model_name, target_token, batch):
    # Imported here so `--help` and the protocol check work without the
    # extended dependencies installed.
    from transformers import MarianMTModel, MarianTokenizer

    tok = MarianTokenizer.from_pretrained(model_name)
    model = MarianMTModel.from_pretrained(model_name)
    prefix = f"{target_token} " if target_token else ""
    out = []
    for i in range(0, len(texts), batch):
        chunk = [prefix + t for t in texts[i : i + batch]]
        enc = tok(chunk, return_tensors="pt", padding=True, truncation=True)
        gen = model.generate(**enc)
        out.extend(tok.batch_decode(gen, skip_special_tokens=True))
    return out


def read_request(raw):
    req = json.loads(raw)
    texts = req.get("texts")
    if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
        raise ValueError("request has no `texts` array of strings")
    model = req.get("model")
    if not isinstance(model, str) or not model:
        raise ValueError("request names no `model`")
    token = req.get("targetToken")
    if token is not None and not isinstance(token, str):
        raise ValueError("`targetToken` must be a string or null")
    return texts, model, token


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--model-dir", help="load the model from this directory instead of the request's model id")
    ap.add_argument("--batch", type=int, default=8)
    args = ap.parse_args()
    try:
        texts, model, token = read_request(sys.stdin.read())
    except ValueError as e:
        print(f"opus-mt-runner: {e}", file=sys.stderr)
        return 2
    if not texts:
        json.dump({"translations": []}, sys.stdout)
        return 0
    out = translate(texts, args.model_dir or model, token, max(1, args.batch))
    json.dump({"translations": out}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
