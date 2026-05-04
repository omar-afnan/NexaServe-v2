"""
mBERT baseline evaluation for category classification.
Run: python EvalMBERT.py
Requires: pip install transformers torch
Produces: mbert_results.json  (accuracy, macro F1, per-class F1)

Data loading and preprocessing intentionally mirrors TrainModel.py exactly —
same CSV, same English filter, same map_to_category, same 80/20 / random_state=42 split.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
from datetime import datetime

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
from sklearn.preprocessing import LabelEncoder

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import BertTokenizer, BertForSequenceClassification
from torch.optim import AdamW
from transformers import get_linear_schedule_with_warmup

warnings.filterwarnings("ignore")

CSV_PATH = "./aa_dataset-tickets-multi-lang-5-2-50-version.csv"
RESULTS_PATH = "./mbert_results.json"
MODEL_NAME = "bert-base-multilingual-cased"

#  Hyperparameters 
MAX_LEN = 128
BATCH_SIZE = 16
EPOCHS = 3
LEARNING_RATE = 2e-5
WARMUP_RATIO = 0.1


#  Data loading  identical to TrainModel.py 

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


def load_data():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    print(f"Total rows: {len(df)}")

    df = df[df['language'] == 'en'].copy()
    print(f"English rows: {len(df)}")

    df['mapped_category'] = df.apply(map_to_category, axis=1)
    df = df[df['mapped_category'].notna()].copy()
    print(f"Rows after category mapping: {len(df)}")

    texts, labels = [], []
    for _, row in df.iterrows():
        title = str(row.get('subject', '') or '')
        description = str(row.get('body', '') or '')
        text = f"{title} {description}".strip().lower()
        if text:
            texts.append(text)
            labels.append(row['mapped_category'])

    print(f"Final samples: {len(texts)}")
    return texts, labels


#  PyTorch Dataset 

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


#  Training & evaluation 

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


def evaluate(model, loader, device):
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


#  Main 

def main():
    started_at = datetime.now().isoformat()
    print(f"\nmBERT Category Evaluation")
    print(f"Started: {started_at}")
    print(f"Model:   {MODEL_NAME}")
    print("=" * 60)

    texts, labels_str = load_data()

    # Encode string labels to integers
    le = LabelEncoder()
    labels_enc = le.fit_transform(labels_str)
    class_names = list(le.classes_)
    num_classes = len(class_names)
    print(f"\nClasses ({num_classes}): {class_names}")

    # Same split as TrainModel.py
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels_enc,
        test_size=0.20,
        random_state=42,
        stratify=labels_enc
    )
    print(f"Train: {len(X_train)}  |  Test: {len(X_test)}")

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Device: {device}")

    print(f"\nLoading tokenizer and model ({MODEL_NAME})...")
    tokenizer = BertTokenizer.from_pretrained(MODEL_NAME)
    model = BertForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=num_classes)
    model.to(device)

    train_dataset = TicketDataset(X_train, y_train, tokenizer, MAX_LEN)
    test_dataset  = TicketDataset(X_test,  y_test,  tokenizer, MAX_LEN)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    test_loader  = DataLoader(test_dataset,  batch_size=BATCH_SIZE, shuffle=False)

    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=0.01)
    total_steps = len(train_loader) * EPOCHS
    warmup_steps = int(total_steps * WARMUP_RATIO)
    scheduler = get_linear_schedule_with_warmup(optimizer, warmup_steps, total_steps)

    print(f"\nFine-tuning for {EPOCHS} epochs  (batch={BATCH_SIZE}, lr={LEARNING_RATE})")
    print("-" * 60)

    for epoch in range(1, EPOCHS + 1):
        avg_loss = train_epoch(model, train_loader, optimizer, scheduler, device)
        y_true_e, y_pred_e = evaluate(model, test_loader, device)
        acc_e = accuracy_score(y_true_e, y_pred_e)
        f1_e  = f1_score(y_true_e, y_pred_e, average='macro', zero_division=0)
        print(f"  Epoch {epoch}/{EPOCHS}  loss={avg_loss:.4f}  acc={acc_e*100:.2f}%  macro-F1={f1_e*100:.2f}%")

    # Final evaluation on test set
    print("\n" + "=" * 60)
    print("Final Evaluation on Test Set")
    print("=" * 60)

    y_true, y_pred = evaluate(model, test_loader, device)
    accuracy   = float(accuracy_score(y_true, y_pred))
    macro_f1   = float(f1_score(y_true, y_pred, average='macro',  zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, average='weighted', zero_division=0))

    print(f"Accuracy:    {accuracy*100:.2f}%")
    print(f"Macro F1:    {macro_f1*100:.2f}%")
    print(f"Weighted F1: {weighted_f1*100:.2f}%")
    print(f"\nPer-class F1 scores:")

    per_class_f1_arr = f1_score(y_true, y_pred, average=None, labels=list(range(num_classes)), zero_division=0)
    per_class_f1 = {class_names[i]: round(float(per_class_f1_arr[i]), 4) for i in range(num_classes)}
    for cls, score in sorted(per_class_f1.items()):
        print(f"  {cls:<12} {score*100:.2f}%")

    print(f"\nClassification Report:\n")
    print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))

    # Save results
    results = {
        "model": MODEL_NAME,
        "task": "category_classification",
        "dataset": os.path.basename(CSV_PATH),
        "split": {"test_size": 0.20, "random_state": 42, "stratified": True},
        "hyperparameters": {
            "max_len": MAX_LEN,
            "batch_size": BATCH_SIZE,
            "epochs": EPOCHS,
            "learning_rate": LEARNING_RATE,
            "warmup_ratio": WARMUP_RATIO,
            "optimizer": "AdamW",
            "weight_decay": 0.01
        },
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "num_classes": num_classes,
        "classes": class_names,
        "device": str(device),
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "per_class_f1": per_class_f1,
        "evaluated_at": started_at,
        "completed_at": datetime.now().isoformat(),
        "comparison_baseline": {
            "tfidf_linearsvm_accuracy": 0.8885,
            "tfidf_linearsvm_macro_f1": None
        }
    }

    with open(RESULTS_PATH, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {os.path.abspath(RESULTS_PATH)}")
    print("\nComparison summary:")
    print(f"  TF-IDF + Linear SVM : 88.85% accuracy (existing model)")
    print(f"  mBERT               : {accuracy*100:.2f}% accuracy  |  macro F1 {macro_f1*100:.2f}%")


if __name__ == "__main__":
    main()
