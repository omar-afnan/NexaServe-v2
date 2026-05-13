"""
Multilingual evaluation: Classical ML vs mBERT on full dataset (all languages).
Run: python EvalMultilingual.py
Produces: multilingual_results.json

Evaluations:
  1. Category Classification  — TF-IDF + Linear SVM (all languages)
  2. Category Classification  — mBERT (all languages)
  3. Priority Classification  — Random Forest + SMOTE (all languages)
  4. Priority Classification  — mBERT + SMOTE (all languages)

Comparison table vs English-only baselines from TrainModel.py / EvalMBERT.py /
EvalMBERTPriority.py is included in the JSON output.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
from datetime import datetime
from scipy.sparse import hstack, csr_matrix

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import LabelEncoder
from imblearn.over_sampling import SMOTE

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import BertTokenizer, BertForSequenceClassification
from torch.optim import AdamW
from transformers import get_linear_schedule_with_warmup

warnings.filterwarnings("ignore")

CSV_PATH = "./aa_dataset-tickets-multi-lang-5-2-50-version.csv"
RESULTS_PATH = "./multilingual_results.json"
MODEL_NAME = "bert-base-multilingual-cased"

MAX_LEN = 128
BATCH_SIZE = 16
EPOCHS = 3
LEARNING_RATE = 2e-5
WARMUP_RATIO = 0.1

# English-only baseline numbers from prior evaluations
ENGLISH_BASELINES = {
    "category_classical_accuracy": 0.8885,
    "category_classical_macro_f1": None,
    "category_mbert_accuracy": None,
    "category_mbert_macro_f1": None,
    "priority_classical_accuracy": 0.7770,
    "priority_classical_macro_f1": None,
    "priority_mbert_accuracy": None,
    "priority_mbert_macro_f1": None,
}


# ── Shared mapping functions (identical to TrainModel.py) 

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


#  Priority engineered features (identical to TrainModel.py) 

def priority_features(texts):
    high_keywords = [
        'urgent', 'critical', 'asap', 'emergency', 'immediately', 'severe',
        'entire team', 'all users', 'production down', 'cannot access',
        'completely broken', 'deadline', 'client waiting', 'data loss',
        'security breach', 'not working at all', 'fully down', 'business critical',
        'major outage', 'system down', 'blocked', 'blocking', 'escalate',
        'no access', 'cannot login', 'total failure', 'widespread'
    ]
    low_keywords = [
        'when possible', 'minor', 'small issue', 'not urgent', 'low priority',
        'enhancement', 'suggestion', 'feature request', 'cosmetic',
        'no rush', 'whenever', 'nice to have', 'minor inconvenience',
        'low impact', 'trivial', 'negligible', 'not critical', 'sometime'
    ]
    medium_keywords = [
        'intermittent', 'sometimes', 'occasionally', 'workaround', 'slow',
        'degraded', 'partial', 'some users', 'a few', 'mostly working'
    ]
    negation_patterns = ["can't", "cannot", "won't", "not working", "doesn't work",
                         "unable to", "failed to", "no longer", "stopped working"]

    features = []
    for text in texts:
        t = text.lower()
        words = t.split()
        word_count = len(words)
        features.append([
            sum(1 for kw in high_keywords if kw in t),
            sum(1 for kw in low_keywords if kw in t),
            sum(1 for kw in medium_keywords if kw in t),
            t.count('!'),
            t.count('?'),
            sum(1 for c in text if c.isupper()) / max(len(text), 1),
            word_count,
            1 if word_count < 20 else 0,
            1 if word_count > 100 else 0,
            sum(1 for p in negation_patterns if p in t),
        ])
    return np.array(features, dtype=np.float32)


#  Data loading (no language filter) 

def load_data_multilingual():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    print(f"Total rows in CSV: {len(df)}")

    langs = df['language'].value_counts()
    print(f"Language distribution:\n{langs.to_string()}")

    df['mapped_category'] = df.apply(map_to_category, axis=1)
    df = df[df['mapped_category'].notna()].copy()
    print(f"Rows after category mapping: {len(df)}")

    df['mapped_priority'] = df['priority'].apply(map_priority)

    texts, categories, priorities = [], [], []
    for _, row in df.iterrows():
        title = str(row.get('subject', '') or '')
        description = str(row.get('body', '') or '')
        text = f"{title} {description}".strip().lower()
        if text:
            texts.append(text)
            categories.append(row['mapped_category'])
            priorities.append(row['mapped_priority'])

    print(f"Final samples: {len(texts)}")
    print("\nCategory distribution:")
    for cat in sorted(set(categories)):
        n = categories.count(cat)
        print(f"  {cat:<12} {n:>6} ({n/len(categories)*100:.1f}%)")
    print("\nPriority distribution:")
    for pri in ['High', 'Medium', 'Low']:
        n = priorities.count(pri)
        print(f"  {pri:<8} {n:>6} ({n/len(priorities)*100:.1f}%)")

    return texts, categories, priorities


# ── Evaluation 1 & 3: Classical ML ───────────────────────────────────────────

def eval_classical_category(texts, categories):
    print("\n" + "=" * 60)
    print("Evaluation 1: Category Classification — Classical ML (multilingual)")
    print("=" * 60)

    vectorizer = TfidfVectorizer(
        max_features=3000,
        ngram_range=(1, 2),
        stop_words='english',
        min_df=3,
        max_df=0.9,
        sublinear_tf=True
    )
    X = vectorizer.fit_transform(texts)

    X_train, X_test, y_train, y_test = train_test_split(
        X, categories, test_size=0.20, random_state=42, stratify=categories
    )
    print(f"Train: {X_train.shape[0]}  |  Test: {X_test.shape[0]}")

    svm = LinearSVC(max_iter=2000, C=0.5, class_weight='balanced', random_state=42, dual="auto")
    model = CalibratedClassifierCV(svm, cv=3, method='sigmoid')
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred))
    macro_f1 = float(f1_score(y_test, y_pred, average='macro', zero_division=0))
    class_names = sorted(set(categories))
    per_class_f1_arr = f1_score(y_test, y_pred, average=None,
                                labels=class_names, zero_division=0)
    per_class_f1 = {cls: round(float(s), 4) for cls, s in zip(class_names, per_class_f1_arr)}

    print(f"Accuracy:  {accuracy*100:.2f}%")
    print(f"Macro F1:  {macro_f1*100:.2f}%")
    print(f"\nClassification Report:\n")
    print(classification_report(y_test, y_pred, zero_division=0))

    return {
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "train_samples": X_train.shape[0],
        "test_samples": X_test.shape[0],
        "per_class_f1": per_class_f1,
    }


def eval_classical_priority(texts, priorities):
    print("\n" + "=" * 60)
    print("Evaluation 3: Priority Classification — Classical ML (multilingual)")
    print("=" * 60)

    vectorizer = TfidfVectorizer(
        max_features=2000,
        ngram_range=(1, 3),
        stop_words='english',
        min_df=1,
        max_df=0.90,
        sublinear_tf=True
    )
    X_tfidf = vectorizer.fit_transform(texts)
    pri_extra = priority_features(texts)
    X = hstack([X_tfidf, csr_matrix(pri_extra)])
    print(f"Feature matrix shape: {X.shape}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, priorities, test_size=0.20, random_state=42, stratify=priorities
    )
    print(f"Train: {X_train.shape[0]}  |  Test: {X_test.shape[0]}")

    print("\nApplying SMOTE to training split...")
    print("Before SMOTE:")
    unique, counts = np.unique(y_train, return_counts=True)
    for cls, cnt in zip(unique, counts):
        print(f"  {cls}: {cnt}")

    smote = SMOTE(random_state=42, k_neighbors=3)
    X_train_bal, y_train_bal = smote.fit_resample(X_train, y_train)

    print("After SMOTE:")
    unique, counts = np.unique(y_train_bal, return_counts=True)
    for cls, cnt in zip(unique, counts):
        print(f"  {cls}: {cnt}")

    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        random_state=42
    )
    model.fit(X_train_bal, y_train_bal)

    y_pred = model.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred))
    macro_f1 = float(f1_score(y_test, y_pred, average='macro', zero_division=0))
    class_names = sorted(set(priorities))
    per_class_f1_arr = f1_score(y_test, y_pred, average=None,
                                labels=class_names, zero_division=0)
    per_class_f1 = {cls: round(float(s), 4) for cls, s in zip(class_names, per_class_f1_arr)}

    print(f"\nAccuracy:  {accuracy*100:.2f}%")
    print(f"Macro F1:  {macro_f1*100:.2f}%")
    print(f"\nClassification Report:\n")
    print(classification_report(y_test, y_pred, zero_division=0))

    return {
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "train_samples_after_smote": int(X_train_bal.shape[0]),
        "test_samples": X_test.shape[0],
        "per_class_f1": per_class_f1,
    }


# ── PyTorch Dataset ───────────────────────────────────────────────────────────

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


def run_mbert_eval(model, loader, device):
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


# ── Evaluation 2: mBERT Category ─────────────────────────────────────────────

def eval_mbert_category(texts, categories, device, tokenizer):
    print("\n" + "=" * 60)
    print("Evaluation 2: Category Classification — mBERT (multilingual)")
    print("=" * 60)

    le = LabelEncoder()
    labels_enc = le.fit_transform(categories)
    class_names = list(le.classes_)
    num_classes = len(class_names)
    print(f"Classes ({num_classes}): {class_names}")

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels_enc, test_size=0.20, random_state=42, stratify=labels_enc
    )
    print(f"Train: {len(X_train)}  |  Test: {len(X_test)}")

    model = BertForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=num_classes)
    model.to(device)

    train_dataset = TicketDataset(X_train, y_train.tolist(), tokenizer, MAX_LEN)
    test_dataset  = TicketDataset(X_test,  y_test.tolist(),  tokenizer, MAX_LEN)
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True,
                              num_workers=0, pin_memory=(device.type == 'cuda'))
    test_loader  = DataLoader(test_dataset,  batch_size=BATCH_SIZE, shuffle=False,
                              num_workers=0, pin_memory=(device.type == 'cuda'))

    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=0.01)
    total_steps = len(train_loader) * EPOCHS
    warmup_steps = int(total_steps * WARMUP_RATIO)
    scheduler = get_linear_schedule_with_warmup(optimizer, warmup_steps, total_steps)

    print(f"\nFine-tuning for {EPOCHS} epochs  (batch={BATCH_SIZE}, lr={LEARNING_RATE})")
    print("-" * 60)
    for epoch in range(1, EPOCHS + 1):
        avg_loss = train_epoch(model, train_loader, optimizer, scheduler, device)
        y_true_e, y_pred_e = run_mbert_eval(model, test_loader, device)
        acc_e = accuracy_score(y_true_e, y_pred_e)
        f1_e  = f1_score(y_true_e, y_pred_e, average='macro', zero_division=0)
        print(f"  Epoch {epoch}/{EPOCHS}  loss={avg_loss:.4f}  acc={acc_e*100:.2f}%  macro-F1={f1_e*100:.2f}%")

    y_true, y_pred = run_mbert_eval(model, test_loader, device)
    accuracy  = float(accuracy_score(y_true, y_pred))
    macro_f1  = float(f1_score(y_true, y_pred, average='macro',    zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, average='weighted', zero_division=0))

    print(f"\nAccuracy:    {accuracy*100:.2f}%")
    print(f"Macro F1:    {macro_f1*100:.2f}%")
    print(f"Weighted F1: {weighted_f1*100:.2f}%")
    per_class_f1_arr = f1_score(y_true, y_pred, average=None,
                                labels=list(range(num_classes)), zero_division=0)
    per_class_f1 = {class_names[i]: round(float(per_class_f1_arr[i]), 4)
                    for i in range(num_classes)}
    print(f"\nClassification Report:\n")
    print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))

    del model
    if device.type == 'cuda':
        torch.cuda.empty_cache()

    return {
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "per_class_f1": per_class_f1,
    }


#  Evaluation 4: mBERT Priority 

def eval_mbert_priority(texts, priorities, device, tokenizer):
    print("\n" + "=" * 60)
    print("Evaluation 4: Priority Classification — mBERT (multilingual)")
    print("=" * 60)

    le = LabelEncoder()
    labels_enc = le.fit_transform(priorities)
    class_names = list(le.classes_)
    num_classes = len(class_names)
    print(f"Classes ({num_classes}): {class_names}")

    X_train_texts, X_test_texts, y_train, y_test = train_test_split(
        texts, labels_enc, test_size=0.20, random_state=42, stratify=labels_enc
    )
    print(f"Train: {len(X_train_texts)}  |  Test: {len(X_test_texts)}")

    print("\nApplying SMOTE to training split (index-based)...")
    print("Before SMOTE:")
    unique, counts = np.unique(y_train, return_counts=True)
    for cls, cnt in zip(unique, counts):
        print(f"  {le.classes_[cls]}: {cnt}")

    train_indices = np.arange(len(X_train_texts)).reshape(-1, 1).astype(np.float32)
    smote = SMOTE(random_state=42, k_neighbors=3)
    resampled_indices, y_train_balanced = smote.fit_resample(train_indices, y_train)
    resampled_indices = np.clip(
        np.round(resampled_indices.flatten()).astype(int),
        0, len(X_train_texts) - 1
    )
    X_train_balanced = [X_train_texts[i] for i in resampled_indices]

    print("After SMOTE:")
    unique, counts = np.unique(y_train_balanced, return_counts=True)
    for cls, cnt in zip(unique, counts):
        print(f"  {le.classes_[cls]}: {cnt}")
    print(f"Training samples after SMOTE: {len(X_train_balanced)}")

    model = BertForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=num_classes)
    model.to(device)

    train_dataset = TicketDataset(X_train_balanced, y_train_balanced.tolist(), tokenizer, MAX_LEN)
    test_dataset  = TicketDataset(X_test_texts,     y_test.tolist(),           tokenizer, MAX_LEN)
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True,
                              num_workers=0, pin_memory=(device.type == 'cuda'))
    test_loader  = DataLoader(test_dataset,  batch_size=BATCH_SIZE, shuffle=False,
                              num_workers=0, pin_memory=(device.type == 'cuda'))

    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=0.01)
    total_steps = len(train_loader) * EPOCHS
    warmup_steps = int(total_steps * WARMUP_RATIO)
    scheduler = get_linear_schedule_with_warmup(optimizer, warmup_steps, total_steps)

    print(f"\nFine-tuning for {EPOCHS} epochs  (batch={BATCH_SIZE}, lr={LEARNING_RATE})")
    print("-" * 60)
    for epoch in range(1, EPOCHS + 1):
        avg_loss = train_epoch(model, train_loader, optimizer, scheduler, device)
        y_true_e, y_pred_e = run_mbert_eval(model, test_loader, device)
        acc_e = accuracy_score(y_true_e, y_pred_e)
        f1_e  = f1_score(y_true_e, y_pred_e, average='macro', zero_division=0)
        print(f"  Epoch {epoch}/{EPOCHS}  loss={avg_loss:.4f}  acc={acc_e*100:.2f}%  macro-F1={f1_e*100:.2f}%")

    y_true, y_pred = run_mbert_eval(model, test_loader, device)
    accuracy    = float(accuracy_score(y_true, y_pred))
    macro_f1    = float(f1_score(y_true, y_pred, average='macro',    zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, average='weighted', zero_division=0))

    print(f"\nAccuracy:    {accuracy*100:.2f}%")
    print(f"Macro F1:    {macro_f1*100:.2f}%")
    print(f"Weighted F1: {weighted_f1*100:.2f}%")
    per_class_f1_arr = f1_score(y_true, y_pred, average=None,
                                labels=list(range(num_classes)), zero_division=0)
    per_class_f1 = {class_names[i]: round(float(per_class_f1_arr[i]), 4)
                    for i in range(num_classes)}
    for cls in ['High', 'Medium', 'Low']:
        if cls in per_class_f1:
            print(f"  {cls:<8} {per_class_f1[cls]*100:.2f}%")
    print(f"\nClassification Report:\n")
    print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))

    del model
    if device.type == 'cuda':
        torch.cuda.empty_cache()

    return {
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "train_samples_after_smote": len(X_train_balanced),
        "test_samples": len(X_test_texts),
        "per_class_f1": per_class_f1,
    }


#  Main 

def main():
    started_at = datetime.now().isoformat()
    print(f"\nMultilingual Evaluation (all languages)")
    print(f"Started: {started_at}")
    print(f"mBERT model: {MODEL_NAME}")
    print("=" * 60)

    texts, categories, priorities = load_data_multilingual()

    if len(texts) < 50:
        print("ERROR: Too few samples after mapping. Check CSV path and mapping logic.")
        sys.exit(1)

    # Classical ML evaluations (no GPU needed)
    cat_classical = eval_classical_category(texts, categories)
    pri_classical = eval_classical_priority(texts, priorities)

    # Set up shared tokenizer and device for both mBERT runs
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\nDevice: {device}")
    if device.type == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    print(f"\nLoading tokenizer ({MODEL_NAME})...")
    tokenizer = BertTokenizer.from_pretrained(MODEL_NAME)

    cat_mbert = eval_mbert_category(texts, categories, device, tokenizer)
    pri_mbert = eval_mbert_priority(texts, priorities, device, tokenizer)

    #  Comparison table 
    comparison = {
        "category_classification": {
            "english_only_classical": {
                "model": "TF-IDF + Linear SVM",
                "accuracy": ENGLISH_BASELINES["category_classical_accuracy"],
                "macro_f1": ENGLISH_BASELINES["category_classical_macro_f1"],
            },
            "multilingual_classical": {
                "model": "TF-IDF + Linear SVM",
                "accuracy": cat_classical["accuracy"],
                "macro_f1": cat_classical["macro_f1"],
            },
            "english_only_mbert": {
                "model": MODEL_NAME,
                "accuracy": ENGLISH_BASELINES["category_mbert_accuracy"],
                "macro_f1": ENGLISH_BASELINES["category_mbert_macro_f1"],
                "note": "Run EvalMBERT.py to populate these values"
            },
            "multilingual_mbert": {
                "model": MODEL_NAME,
                "accuracy": cat_mbert["accuracy"],
                "macro_f1": cat_mbert["macro_f1"],
            },
        },
        "priority_classification": {
            "english_only_classical": {
                "model": "Random Forest + SMOTE",
                "accuracy": ENGLISH_BASELINES["priority_classical_accuracy"],
                "macro_f1": ENGLISH_BASELINES["priority_classical_macro_f1"],
            },
            "multilingual_classical": {
                "model": "Random Forest + SMOTE",
                "accuracy": pri_classical["accuracy"],
                "macro_f1": pri_classical["macro_f1"],
            },
            "english_only_mbert": {
                "model": MODEL_NAME,
                "accuracy": ENGLISH_BASELINES["priority_mbert_accuracy"],
                "macro_f1": ENGLISH_BASELINES["priority_mbert_macro_f1"],
                "note": "Run EvalMBERTPriority.py to populate these values"
            },
            "multilingual_mbert": {
                "model": MODEL_NAME,
                "accuracy": pri_mbert["accuracy"],
                "macro_f1": pri_mbert["macro_f1"],
            },
        }
    }

    results = {
        "evaluated_at": started_at,
        "completed_at": datetime.now().isoformat(),
        "dataset": os.path.basename(CSV_PATH),
        "language_filter": "none (all languages)",
        "mbert_model": MODEL_NAME,
        "hyperparameters": {
            "max_len": MAX_LEN,
            "batch_size": BATCH_SIZE,
            "epochs": EPOCHS,
            "learning_rate": LEARNING_RATE,
            "warmup_ratio": WARMUP_RATIO,
            "optimizer": "AdamW",
            "weight_decay": 0.01,
        },
        "split": {"test_size": 0.20, "random_state": 42, "stratified": True},
        "eval_1_category_classical": cat_classical,
        "eval_2_category_mbert": cat_mbert,
        "eval_3_priority_classical": pri_classical,
        "eval_4_priority_mbert": pri_mbert,
        "comparison_table": comparison,
    }

    with open(RESULTS_PATH, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {os.path.abspath(RESULTS_PATH)}")

    #  Print comparison summary 
    print("\n" + "=" * 70)
    print("COMPARISON SUMMARY")
    print("=" * 70)

    def fmt(val):
        return f"{val*100:.2f}%" if val is not None else "  N/A  "

    print(f"\nCategory Classification:")
    print(f"  {'':30s} {'Accuracy':>10}  {'Macro F1':>10}")
    print(f"  {'English-only Classical ML':30s} {fmt(ENGLISH_BASELINES['category_classical_accuracy']):>10}  {fmt(ENGLISH_BASELINES['category_classical_macro_f1']):>10}")
    print(f"  {'Multilingual Classical ML':30s} {fmt(cat_classical['accuracy']):>10}  {fmt(cat_classical['macro_f1']):>10}")
    print(f"  {'English-only mBERT':30s} {fmt(ENGLISH_BASELINES['category_mbert_accuracy']):>10}  {fmt(ENGLISH_BASELINES['category_mbert_macro_f1']):>10}")
    print(f"  {'Multilingual mBERT':30s} {fmt(cat_mbert['accuracy']):>10}  {fmt(cat_mbert['macro_f1']):>10}")

    print(f"\nPriority Classification:")
    print(f"  {'':30s} {'Accuracy':>10}  {'Macro F1':>10}")
    print(f"  {'English-only Classical ML':30s} {fmt(ENGLISH_BASELINES['priority_classical_accuracy']):>10}  {fmt(ENGLISH_BASELINES['priority_classical_macro_f1']):>10}")
    print(f"  {'Multilingual Classical ML':30s} {fmt(pri_classical['accuracy']):>10}  {fmt(pri_classical['macro_f1']):>10}")
    print(f"  {'English-only mBERT':30s} {fmt(ENGLISH_BASELINES['priority_mbert_accuracy']):>10}  {fmt(ENGLISH_BASELINES['priority_mbert_macro_f1']):>10}")
    print(f"  {'Multilingual mBERT':30s} {fmt(pri_mbert['accuracy']):>10}  {fmt(pri_mbert['macro_f1']):>10}")
    print()


if __name__ == "__main__":
    main()
