"""The reliability data behind the calibration figure, from the lmcircuit reports.

Each dataset's report.json (written by adaptive_circuits.lmcircuit_run) holds, on held-out prompts,
  objectives.accuracy.circuit.calibration[budget]  the belief where LMCircuit stops, at budgets 0.01 ... 1
  calibration.majority_vote                        majority voting's share of votes for label 1
each as 10 equal-width bins (mean predicted probability, observed share, rows) with its expected calibration
error (ece) and Brier score. This copies them, rounded, for the five tasks the results screen shows.

Usage:  python3 -I scripts/extract_calibration.py [--root RUN_ROOT] [--out data/calibration.json]
"""

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
TASKS = {"beavertails": "beavertails", "politicause": "politicause", "arena": "arena",
         "healthbench": "healthbench", "decision_index": "decision_index"}       # site key: report folder


def curve(c: dict) -> dict:
    return {"predicted": [round(x, 4) for x in c["predicted"]], "observed": [round(x, 4) for x in c["observed"]],
            "rows": c["rows"], "ece": round(c["ece"], 4), "brier": round(c["brier"], 4)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="/n/netscratch/calmon_lab/Lab/hadikhalaf/runs/adaptiveCircuits")
    ap.add_argument("--out", default=str(HERE / "data/calibration.json"))
    a = ap.parse_args()
    out = {}
    for key, folder in TASKS.items():
        report = json.loads((Path(a.root) / folder / "lmcircuit/run/report.json").read_text())
        budgets = report["objectives"]["accuracy"]["circuit"]["calibration"]
        out[key] = {"lmcircuit": {b: curve(c) for b, c in budgets.items()},
                    "majority_vote": curve(report["calibration"]["majority_vote"])}
    Path(a.out).write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(a.out, {k: (v["lmcircuit"]["0.1"]["ece"], v["majority_vote"]["ece"]) for k, v in out.items()})


if __name__ == "__main__":
    main()
