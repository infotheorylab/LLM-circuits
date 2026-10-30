#!/usr/bin/env python3
"""Count the models listed on OpenRouter and summarise their input prices.

Fetches the public model list (no API key needed) and writes data/openrouter.json:

    date                        UTC date of the fetch, YYYY-MM-DD
    count                       number of entries in the model list
    distinct_count              distinct models: `:free`/`:batch` variants folded into their model, `~` aliases and
                                routers (negative price) left out
    paid_count                  entries with a positive input price
    free_count                  entries with an input price of zero
    min_input_usd_per_mtok      cheapest positive input price, USD per million tokens
    median_input_usd_per_mtok   median positive input price, USD per million tokens
    max_input_usd_per_mtok      highest input price, USD per million tokens
    source                      the URL fetched

The API reports `pricing.prompt` in USD per token, so prices are multiplied by 1e6. Entries whose price is
negative (OpenRouter uses -1 for routers whose price depends on the model chosen) or missing are counted in
`count` but not in the price statistics. Standard library only.

Scope: without `?output_modalities=...` the endpoint lists only models that output text. Each entry counts once,
so `:free` and `:batch` variants and `~...-latest` aliases count separately from the model they point to. Decision
models (output modality `decisions`), embedding, image, speech and other models are not in this list; adding them
would mix prices in different units.

Usage: python3 scripts/openrouter_stats.py [--out data/openrouter.json]
"""

import argparse
import datetime
import json
import pathlib
import statistics
import urllib.request

SOURCE = "https://openrouter.ai/api/v1/models"


def fetch(url=SOURCE, timeout=60):
    """Return the list of model records from the OpenRouter API."""
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "lmcircuit-site/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)["data"]


def input_price(model):
    """Input price in USD per million tokens, or None when it is missing or not a fixed price."""
    try:
        p = float((model.get("pricing") or {}).get("prompt"))
    except (TypeError, ValueError):
        return None
    return None if p < 0 else p * 1e6


def distinct(models):
    """Ids of distinct models: variants such as `x:free` fold into `x`; aliases (`~...`) and routers are dropped."""
    return {m["id"].split(":")[0] for m in models
            if not m["id"].startswith("~") and (input_price(m) is not None)}


def summarise(models, date=None):
    prices = [p for p in map(input_price, models) if p is not None]
    paid = sorted(p for p in prices if p > 0)
    r = lambda x: float(f"{x:.6g}")  # drop float noise such as 0.30000000000000004
    return {
        "date": date or datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
        "count": len(models),
        "distinct_count": len(distinct(models)),
        "paid_count": len(paid),
        "free_count": sum(p == 0 for p in prices),
        "min_input_usd_per_mtok": r(paid[0]) if paid else None,
        "median_input_usd_per_mtok": r(statistics.median(paid)) if paid else None,
        "max_input_usd_per_mtok": r(paid[-1]) if paid else None,
        "source": SOURCE,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=str(pathlib.Path(__file__).resolve().parent.parent / "data" / "openrouter.json"))
    args = ap.parse_args()
    stats = summarise(fetch())
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(stats, indent=2) + "\n")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
