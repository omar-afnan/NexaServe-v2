"""
The "always guess the most common class" baseline for priority. No training -
it just predicts the majority class for every test row and reports the accuracy
and macro F1 that gets you.

Runs on both the English-only and the combined EN+DE test splits, using the
same split calls as EvalMBERTPriority.py and EvalMultilingual.py so the numbers
are comparable.

Run: python EvalPriorityMajorityBaseline.py
Needs: pandas, scikit-learn
"""

import os
import sys
import json
from datetime import datetime

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
from sklearn.preprocessing import LabelEncoder

CSV_PATH = "./aa_dataset-tickets-multi-lang-5-2-50-version.csv"
RESULTS_PATH = "./majority_baseline_results.json"


def map_to_category(row):
    queue = str(row.get('queue', '')).lower()
    tag1 = str(row.get('tag_1', '')).lower()
    tag2 = str(row.get('tag_2', '')).lower()
    subject = str(row.get('subject', '')).lower()
    body = str(row.get('body', '')).lower()
    text = subject + ' ' + body

    password_kw = {'login', 'account', 'authentication', 'password', 'access'}
    if tag1 in password_kw or tag2 in password_kw:
        return 'Password'
    if any(kw in text for kw in ['password', 'login', 'locked out', 'account access',
                                  'sign in', 'credentials', 'forgot password',
                                  'reset password', '2fa', 'authentication']):
        return 'Password'

    network_kw = {'network', 'outage', 'connectivity', 'disruption'}
    if tag1 in network_kw or tag2 in network_kw:
        return 'Network'
    if queue == 'service outages and maintenance':
        return 'Network'
    if any(kw in text for kw in ['wifi', 'internet', 'network', 'connectivity',
                                  'vpn', 'router', 'connection', 'bandwidth',
                                  'firewall', 'dns', 'ethernet']):
        return 'Network'

    hardware_kw = {'hardware', 'device', 'peripheral'}
    if tag1 in hardware_kw or tag2 in hardware_kw:
        return 'Hardware'
    if any(kw in text for kw in ['hardware', 'printer', 'keyboard', 'mouse',
                                  'monitor', 'screen', 'laptop', 'desktop',
                                  'webcam', 'overheating', 'battery', 'usb',
                                  'headset', 'speaker', 'microphone']):
        return 'Hardware'

    if any(kw in text for kw in ['email', 'outlook', 'inbox', 'calendar',
                                  'mail', 'smtp', 'attachment', 'spam',
                                  'mailbox', 'distribution list']):
        return 'Email'

    software_kw = {'bug', 'crash', 'performance', 'security', 'feature', 'virus', 'malware'}
    if queue in ['it support', 'technical support']:
        if tag1 in software_kw or tag2 in software_kw:
            return 'Software'

    if queue in ['it support', 'technical support']:
        return 'Software'

    return None


def map_priority(priority_str):
    p = str(priority_str).strip().lower()
    if p == 'high':
        return 'High'
    if p == 'medium':
        return 'Medium'
    if p == 'low':
        return 'Low'
    if p == 'critical':
        return 'High'
    return 'Medium'


def load_rows():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    df['mapped_category'] = df.apply(map_to_category, axis=1)
    df = df[df['mapped_category'].notna()].copy()
    df['mapped_priority'] = df['priority'].apply(map_priority)

    texts, priorities, languages = [], [], []
    for _, row in df.iterrows():
        title = str(row.get('subject', '') or '')
        description = str(row.get('body', '') or '')
        text = f"{title} {description}".strip().lower()
        if text:
            texts.append(text)
            priorities.append(row['mapped_priority'])
            languages.append(row.get('language', ''))

    return texts, priorities, languages


def majority_baseline(y_test, class_names, split_name):
    y_test = list(y_test)
    counts = {cls: y_test.count(cls) for cls in class_names}
    majority_class = max(counts, key=counts.get)
    y_pred = [majority_class] * len(y_test)

    accuracy = float(accuracy_score(y_test, y_pred))
    macro_f1 = float(f1_score(y_test, y_pred, average='macro', labels=class_names, zero_division=0))

    print(f"\n{'=' * 60}")
    print(f"Majority-class baseline — {split_name}")
    print(f"{'=' * 60}")
    print(f"Test samples: {len(y_test)}")
    print("Class distribution:")
    for cls in class_names:
        pct = counts[cls] / len(y_test) * 100
        print(f"  {cls:<8} {counts[cls]:>5} ({pct:.1f}%)")
    print(f"\nMajority class: {majority_class}")
    print(f"Accuracy:  {accuracy * 100:.2f}%")
    print(f"Macro F1:  {macro_f1 * 100:.2f}%")
    print(classification_report(y_test, y_pred, labels=class_names, zero_division=0))

    return {
        "split": split_name,
        "test_samples": len(y_test),
        "class_distribution": counts,
        "majority_class": majority_class,
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
    }


def main():
    started_at = datetime.now().isoformat()
    texts, priorities, languages = load_rows()

    class_names = ['High', 'Medium', 'Low']
    results = {}

    # English-only split - matches EvalMBERTPriority.py
    en_texts, en_priorities = [], []
    for t, p, lang in zip(texts, priorities, languages):
        if lang == 'en':
            en_texts.append(t)
            en_priorities.append(p)

    _, _, _, y_test_en = train_test_split(
        en_texts, en_priorities, test_size=0.20, random_state=42, stratify=en_priorities
    )
    results["english_only"] = majority_baseline(y_test_en, class_names, "English-only (n=%d)" % len(en_texts))

    # Combined EN+DE split - matches EvalMultilingual.py
    _, _, _, y_test_all = train_test_split(
        texts, priorities, test_size=0.20, random_state=42, stratify=priorities
    )
    results["combined_en_de"] = majority_baseline(y_test_all, class_names, "Combined EN+DE (n=%d)" % len(texts))

    results["evaluated_at"] = started_at
    results["completed_at"] = datetime.now().isoformat()

    with open(RESULTS_PATH, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {os.path.abspath(RESULTS_PATH)}")


if __name__ == "__main__":
    main()
