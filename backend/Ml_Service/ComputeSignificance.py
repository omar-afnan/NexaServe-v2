"""
Computes bootstrap 95% CIs for macro-F1 and pairwise McNemar's tests across
the priority classification ablation models (mBERT+SMOTE, class-weighted,
oversampling, XLM-R). Requires each source JSON to contain a "predictions"
key with "y_true"/"y_pred" arrays -- only present after re-running the
patched Eval*.py scripts.

Run: python ComputeSignificance.py
Requires: numpy, scikit-learn, scipy (no GPU)
"""

import json
import os
import numpy as np
from sklearn.metrics import f1_score
from scipy.stats import binomtest

N_BOOTSTRAP = 2000
SEED = 42

# Maps a friendly model name to (json_path, key_holding_the_result_dict)
# key is None when the result dict is at the top level of the JSON.
SOURCES = {
    "mBERT + SMOTE (seeded, combined)": ("multilingual_results.json", "eval_4_priority_mbert"),
    "mBERT + class-weighted loss":      ("priority_weighted_mbert_results.json", None),
    "mBERT + random oversampling":      ("priority_oversampled_mbert_results.json", None),
    "XLM-R + SMOTE":                    ("priority_xlmr_results_v2.json", None),
}


def load_predictions(path, key):
    if not os.path.exists(path):
        return None, None, f"missing file: {path}"
    with open(path) as f:
        data = json.load(f)
    d = data.get(key, data) if key else data
    preds = d.get("predictions")
    if not preds:
        return None, None, f"no 'predictions' key in {path} -- rerun the patched Eval script first"
    return np.array(preds["y_true"]), np.array(preds["y_pred"]), None


def bootstrap_macro_f1_ci(y_true, y_pred, n_boot=N_BOOTSTRAP, seed=SEED):
    rng = np.random.default_rng(seed)
    n = len(y_true)
    scores = np.empty(n_boot)
    for i in range(n_boot):
        idx = rng.integers(0, n, size=n)
        scores[i] = f1_score(y_true[idx], y_pred[idx], average="macro", zero_division=0)
    lo, hi = np.percentile(scores, [2.5, 97.5])
    return float(lo), float(hi), float(np.mean(scores))


def mcnemar_test(y_true, pred_a, pred_b):
    correct_a = (pred_a == y_true)
    correct_b = (pred_b == y_true)
    # b: a correct, b wrong ; c: a wrong, b correct
    b = int(np.sum(correct_a & ~correct_b))
    c = int(np.sum(~correct_a & correct_b))
    n = b + c
    if n == 0:
        return b, c, float("nan")
    result = binomtest(min(b, c), n, 0.5, alternative="two-sided")
    return b, c, result.pvalue


def main():
    loaded = {}
    for name, (path, key) in SOURCES.items():
        y_true, y_pred, err = load_predictions(path, key)
        if err:
            print(f"[skip] {name}: {err}")
            continue
        loaded[name] = (y_true, y_pred)

    if not loaded:
        print("\nNo prediction data found. Rerun the patched Eval*.py scripts first, "
              "then run this script again from the same directory.")
        return

    print(f"\n{'=' * 70}\nBootstrap 95% CI for macro-F1 ({N_BOOTSTRAP} resamples)\n{'=' * 70}")
    for name, (y_true, y_pred) in loaded.items():
        lo, hi, mean = bootstrap_macro_f1_ci(y_true, y_pred)
        point = f1_score(y_true, y_pred, average="macro", zero_division=0)
        print(f"{name}")
        print(f"  point estimate: {point*100:.2f}%   bootstrap mean: {mean*100:.2f}%   "
              f"95% CI: [{lo*100:.2f}%, {hi*100:.2f}%]")

    names = list(loaded.keys())
    if len(names) < 2:
        print("\nNeed at least two models with predictions loaded to run McNemar's test.")
        return

    # Confirm all loaded models share the same test set (same y_true, same order)
    reference_y_true = loaded[names[0]][0]
    for name in names[1:]:
        if not np.array_equal(reference_y_true, loaded[name][0]):
            print(f"\nWARNING: {name}'s y_true does not match {names[0]}'s y_true. "
                  f"McNemar's test requires paired predictions on the identical test "
                  f"set in the identical order -- results below may not be valid.")

    print(f"\n{'=' * 70}\nPairwise McNemar's test (exact, two-sided)\n{'=' * 70}")
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            name_a, name_b = names[i], names[j]
            y_true_a, pred_a = loaded[name_a]
            _, pred_b = loaded[name_b]
            b, c, p = mcnemar_test(y_true_a, pred_a, pred_b)
            sig = "significant (p<0.05)" if p < 0.05 else "not significant"
            print(f"{name_a}  vs  {name_b}")
            print(f"  disagreements: {b} favor A, {c} favor B   p-value: {p:.4f}   {sig}")
            print()

    summary = {
        "bootstrap_macro_f1": {
            name: {
                "point_estimate": round(float(f1_score(y_true, y_pred, average='macro', zero_division=0)), 4),
                "ci_95": list(bootstrap_macro_f1_ci(y_true, y_pred)[:2]),
            }
            for name, (y_true, y_pred) in loaded.items()
        },
    }
    with open("significance_results.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Saved: {os.path.abspath('significance_results.json')}")


if __name__ == "__main__":
    main()
