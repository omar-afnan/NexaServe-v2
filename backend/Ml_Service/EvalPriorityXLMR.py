"""
Priority classification — XLM-R baseline (combined EN+DE).
Run: python EvalPriorityXLMR.py
Produces: priority_xlmr_results.json

Same split, SMOTE-on-index-proxy balancing, and hyperparameters as the mBERT
priority run in EvalMultilingual.py, with xlm-roberta-base swapped in for
bert-base-multilingual-cased. Kept identical apart from the model so the
comparison isolates the effect of the architecture/pretraining.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
from datetime import datetime

import torch
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from transformers import XLMRobertaTokenizer, XLMRobertaForSequenceClassification, get_linear_schedule_with_warmup

from sklearn.model_selection import train_test_split
from sklearn.metrics import (accuracy_score, f1_score, classification_report,
                              confusion_matrix, precision_score, recall_score)
from sklearn.preprocessing import LabelEncoder
from imblearn.over_sampling import SMOTE

warnings.filterwarnings("ignore")

import random

SEED = 42


def set_seed(seed=SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

CSV_PATH = "./aa_dataset-tickets-multi-lang-5-2-50-version.csv"
RESULTS_PATH = "./priority_xlmr_results_v2.json"
MODEL_NAME = "xlm-roberta-base"

MAX_LEN = 128
BATCH_SIZE = 16
EPOCHS = 3
LEARNING_RATE = 1e-5
WARMUP_RATIO = 0.2


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


def load_data():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    print(f"Total rows: {len(df)}")

    df['mapped_category'] = df.apply(map_to_category, axis=1)
    df = df[df['mapped_category'].notna()].copy()
    print(f"Rows after category mapping: {len(df)}")

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

    print(f"Final samples: {len(texts)}")
    return texts, priorities, languages


class TicketDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_len):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        encoding = self.tokenizer(
            self.texts[idx],
            max_length=self.max_len,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        return {
            'input_ids':      encoding['input_ids'].squeeze(0),
            'attention_mask': encoding['attention_mask'].squeeze(0),
            'label':          torch.tensor(self.labels[idx], dtype=torch.long)
        }


def train_epoch(model, loader, optimizer, scheduler, device):
    model.train()
    total_loss = 0
    for batch in loader:
        optimizer.zero_grad()
        input_ids      = batch['input_ids'].to(device)
        attention_mask = batch['attention_mask'].to(device)
        labels_b       = batch['label'].to(device)
        outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels_b)
        loss = outputs.loss
        total_loss += loss.item()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
    return total_loss / len(loader)


def run_eval(model, loader, device):
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for batch in loader:
            input_ids      = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            labels_b       = batch['label'].to(device)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            preds = torch.argmax(outputs.logits, dim=1)
            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(labels_b.cpu().numpy())
    return np.array(all_labels), np.array(all_preds)


def main():
    set_seed()
    started_at = datetime.now().isoformat()
    print(f"\nXLM-R Priority Evaluation (combined EN+DE)")
    print(f"Started: {started_at}")
    print("=" * 60)

    texts, labels_str, languages = load_data()

    le = LabelEncoder()
    labels_enc = le.fit_transform(labels_str)
    class_names = list(le.classes_)
    num_classes = len(class_names)
    print(f"Classes ({num_classes}): {class_names}")

    X_train_texts, X_test_texts, y_train, y_test, lang_train, lang_test = train_test_split(
        texts, labels_enc, languages, test_size=0.20, random_state=42, stratify=labels_enc
    )
    print(f"Train: {len(X_train_texts)}  |  Test: {len(X_test_texts)}")

    print("\nApplying SMOTE to training split (index-based, same as mBERT run)...")
    train_indices = np.arange(len(X_train_texts)).reshape(-1, 1).astype(np.float32)
    smote = SMOTE(random_state=42, k_neighbors=3)
    resampled_indices, y_train_balanced = smote.fit_resample(train_indices, y_train)
    resampled_indices = np.clip(
        np.round(resampled_indices.flatten()).astype(int),
        0, len(X_train_texts) - 1
    )
    X_train_balanced = [X_train_texts[i] for i in resampled_indices]
    print(f"Training samples after SMOTE: {len(X_train_balanced)}")

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\nDevice: {device}")
    if device.type == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    print(f"\nLoading tokenizer and model ({MODEL_NAME})...")
    tokenizer = XLMRobertaTokenizer.from_pretrained(MODEL_NAME)
    model = XLMRobertaForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=num_classes)
    model.to(device)

    train_dataset = TicketDataset(X_train_balanced, y_train_balanced.tolist(), tokenizer, MAX_LEN)
    test_dataset  = TicketDataset(X_test_texts,     y_test.tolist(),           tokenizer, MAX_LEN)
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True,  num_workers=0, pin_memory=(device.type == 'cuda'))
    test_loader  = DataLoader(test_dataset,  batch_size=BATCH_SIZE, shuffle=False, num_workers=0, pin_memory=(device.type == 'cuda'))

    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=0.01)
    total_steps = len(train_loader) * EPOCHS
    warmup_steps = int(total_steps * WARMUP_RATIO)
    scheduler = get_linear_schedule_with_warmup(optimizer, warmup_steps, total_steps)

    print(f"\nFine-tuning for {EPOCHS} epochs  (batch={BATCH_SIZE}, lr={LEARNING_RATE})")
    print("-" * 60)
    for epoch in range(1, EPOCHS + 1):
        avg_loss = train_epoch(model, train_loader, optimizer, scheduler, device)
        y_true_e, y_pred_e = run_eval(model, test_loader, device)
        acc_e = accuracy_score(y_true_e, y_pred_e)
        f1_e  = f1_score(y_true_e, y_pred_e, average='macro', zero_division=0)
        print(f"  Epoch {epoch}/{EPOCHS}  loss={avg_loss:.4f}  acc={acc_e*100:.2f}%  macro-F1={f1_e*100:.2f}%")

    y_true, y_pred = run_eval(model, test_loader, device)
    accuracy    = float(accuracy_score(y_true, y_pred))
    macro_f1    = float(f1_score(y_true, y_pred, average='macro',    zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, average='weighted', zero_division=0))

    print(f"\nAccuracy:    {accuracy*100:.2f}%")
    print(f"Macro F1:    {macro_f1*100:.2f}%")
    print(f"Weighted F1: {weighted_f1*100:.2f}%")

    per_class_f1_arr = f1_score(y_true, y_pred, average=None, labels=list(range(num_classes)), zero_division=0)
    per_class_precision_arr = precision_score(y_true, y_pred, average=None, labels=list(range(num_classes)), zero_division=0)
    per_class_recall_arr = recall_score(y_true, y_pred, average=None, labels=list(range(num_classes)), zero_division=0)
    per_class_f1 = {class_names[i]: round(float(per_class_f1_arr[i]), 4) for i in range(num_classes)}
    per_class_precision = {class_names[i]: round(float(per_class_precision_arr[i]), 4) for i in range(num_classes)}
    per_class_recall = {class_names[i]: round(float(per_class_recall_arr[i]), 4) for i in range(num_classes)}
    for cls in ['High', 'Medium', 'Low']:
        if cls in per_class_f1:
            print(f"  {cls:<8} {per_class_f1[cls]*100:.2f}%")

    print(f"\nClassification Report:\n")
    print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))

    cm = confusion_matrix(y_true, y_pred, labels=list(range(num_classes)))
    print(f"Confusion Matrix (rows=true, cols=predicted, order={class_names}):")
    print(cm)

    by_language = {}
    lang_test_arr = np.array(lang_test)
    for lang_code in sorted(set(lang_test)):
        mask = lang_test_arr == lang_code
        if mask.sum() == 0:
            continue
        acc_lang = float(accuracy_score(y_true[mask], y_pred[mask]))
        f1_lang = float(f1_score(y_true[mask], y_pred[mask], average='macro',
                                 labels=list(range(num_classes)), zero_division=0))
        by_language[lang_code] = {
            "test_samples": int(mask.sum()),
            "accuracy": round(acc_lang, 4),
            "macro_f1": round(f1_lang, 4),
        }

    results = {
        "model": MODEL_NAME,
        "task": "priority_classification",
        "method": "smote_index_proxy",
        "dataset": os.path.basename(CSV_PATH),
        "language_filter": "none (all languages)",
        "split": {"test_size": 0.20, "random_state": 42, "stratified": True},
        "smote": {"applied_to": "training_split_only", "k_neighbors": 3, "random_state": 42},
        "hyperparameters": {
            "max_len": MAX_LEN, "batch_size": BATCH_SIZE, "epochs": EPOCHS,
            "learning_rate": LEARNING_RATE, "warmup_ratio": WARMUP_RATIO,
            "optimizer": "AdamW", "weight_decay": 0.01
        },
        "train_samples_after_smote": len(X_train_balanced),
        "test_samples": len(X_test_texts),
        "num_classes": num_classes,
        "classes": class_names,
        "device": str(device),
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "per_class_f1": per_class_f1,
        "per_class_precision": per_class_precision,
        "per_class_recall": per_class_recall,
        "confusion_matrix": {"labels": class_names, "matrix": cm.tolist()},
        "predictions": {"y_true": y_true.tolist(), "y_pred": y_pred.tolist()},
        "by_language": by_language,
        "evaluated_at": started_at,
        "completed_at": datetime.now().isoformat(),
        "comparison_baseline": {
            "combined_smote_mbert_accuracy": 0.3715,
            "combined_smote_mbert_macro_f1": 0.2800,
            "majority_baseline_accuracy": 0.4954,
            "majority_baseline_macro_f1": 0.2209
        }
    }

    with open(RESULTS_PATH, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {os.path.abspath(RESULTS_PATH)}")
    print("\nComparison summary:")
    print(f"  Majority baseline      : 49.54% accuracy | 22.09% macro F1")
    print(f"  mBERT + SMOTE  : 37.15% accuracy | 28.00% macro F1")
    print(f"  XLM-R + SMOTE  : {accuracy*100:.2f}% accuracy | {macro_f1*100:.2f}% macro F1")


if __name__ == "__main__":
    main()
