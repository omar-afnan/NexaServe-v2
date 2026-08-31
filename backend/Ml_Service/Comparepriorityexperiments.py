"""
Pulls together the results from every priority experiment and prints a ranked
table so I can see which one actually won.

Ranking is by macro-F1, not accuracy. The classes are imbalanced enough that a
model can hit ~50% accuracy just by always guessing High (that's what the
majority baseline does), so accuracy tells us nothing about whether Medium and
Low are usable. Macro-F1 does.

Reads the JSON that these produce, expected in the current directory:
EvalMultilingual.py, EvalPriorityWeightedMBERT.py, EvalPriorityOversampledMBERT.py,
EvalPriorityXLMR.py, EvalPriorityMajorityBaseline.py.

Run: python ComparePriorityExperiments.py
"""

import json
import os

FILES = {
    "mBERT + SMOTE (combined, original)": "multilingual_results.json",
    "mBERT + class-weighted loss":        "priority_weighted_mbert_results.json",
    "mBERT + random oversampling":        "priority_oversampled_mbert_results.json",
    "XLM-R + SMOTE":                      "priority_xlmr_results_v2.json",
    "Majority-class baseline":            "majority_baseline_results.json",
}


def extract(name, path):
    if not os.path.exists(path):
        print(f"  [missing] {name} — expected {path}")
        return None

    with open(path) as f:
        data = json.load(f)

    if name == "mBERT + SMOTE (combined, original)":
        d = data.get("eval_4_priority_mbert", data)
    elif name == "Majority-class baseline":
        d = data.get("combined_en_de", data)
    else:
        d = data

    return {
        "name": name,
        "accuracy": d.get("accuracy"),
        "macro_f1": d.get("macro_f1"),
        "per_class_f1": d.get("per_class_f1"),
    }


def main():
    rows = []
    for name, path in FILES.items():
        r = extract(name, path)
        if r is not None and r["macro_f1"] is not None:
            rows.append(r)

    if not rows:
        print("No result files found. Run the experiments first.")
        return

    rows.sort(key=lambda r: r["macro_f1"], reverse=True)

    print("\nPriority classification — comparison (combined EN+DE, ranked by macro-F1)")
    print("=" * 78)
    print(f"{'Method':<38} {'Accuracy':>10} {'Macro F1':>10}")
    print("-" * 78)
    for r in rows:
        acc = f"{r['accuracy']*100:.2f}%" if r['accuracy'] is not None else "n/a"
        f1  = f"{r['macro_f1']*100:.2f}%" if r['macro_f1'] is not None else "n/a"
        print(f"{r['name']:<38} {acc:>10} {f1:>10}")

    best = rows[0]
    print("\nBest by macro-F1:", best["name"])
    if best["per_class_f1"]:
        print("Per-class F1:")
        for cls, val in best["per_class_f1"].items():
            print(f"  {cls:<8} {val*100:.2f}%")

    with open("priority_comparison_summary.json", "w") as f:
        json.dump({"ranked": rows, "best": best["name"]}, f, indent=2)
    print(f"\nSaved to: {os.path.abspath('priority_comparison_summary.json')}")


if __name__ == "__main__":
    main()
