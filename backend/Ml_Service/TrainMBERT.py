import os
import sys
import pickle
import warnings
import numpy as np
import pandas as pd
from datetime import datetime

import torch
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW

from transformers import BertTokenizer, BertForSequenceClassification

from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report

warnings.filterwarnings("ignore", category=FutureWarning)

CSV_PATH = "./aa_dataset-tickets-multi-lang-5-2-50-version.csv"
MODEL_DIR = "./models"
MBERT_SAVE_DIR = "./models/mbert_category"

BERT_MODEL_NAME = "bert-base-multilingual-cased"
MAX_LENGTH = 128
BATCH_SIZE = 16
EPOCHS = 3
LEARNING_RATE = 2e-5
RANDOM_STATE = 42


# Exact copy from TrainModel.py — do not modify
def map_to_category(row):
    queue = str(row.get('queue', '')).lower()
    tag1 = str(row.get('tag_1', '')).lower()
    tag2 = str(row.get('tag_2', '')).lower()
    subject = str(row.get('subject', '')).lower()
    body = str(row.get('body', '')).lower()
    text = subject + ' ' + body

    # password issues
    password_kw = {'login', 'account', 'authentication', 'password', 'access'}
    if tag1 in password_kw or tag2 in password_kw:
        return 'Password'
    if any(kw in text for kw in ['password', 'login', 'locked out', 'account access',
                                           'sign in', 'credentials', 'forgot password',
                                           'reset password', '2fa', 'authentication']):
        return 'Password'

    # network issues
    network_kw = {'network', 'outage', 'connectivity', 'disruption'}
    if tag1 in network_kw or tag2 in network_kw:
        return 'Network'
    if queue == 'service outages and maintenance':
        return 'Network'
    if any(kw in text for kw in ['wifi', 'internet', 'network', 'connectivity',
                                           'vpn', 'router', 'connection', 'bandwidth',
                                           'firewall', 'dns', 'ethernet']):
        return 'Network'

    # hardware issues
    hardware_kw = {'hardware', 'device', 'peripheral'}
    if tag1 in hardware_kw or tag2 in hardware_kw:
        return 'Hardware'
    if any(kw in text for kw in ['hardware', 'printer', 'keyboard', 'mouse',
                                           'monitor', 'screen', 'laptop', 'desktop',
                                           'webcam', 'overheating', 'battery', 'usb',
                                           'headset', 'speaker', 'microphone']):
        return 'Hardware'

    # email
    if any(kw in text for kw in ['email', 'outlook', 'inbox', 'calendar',
                                           'mail', 'smtp', 'attachment', 'spam',
                                           'mailbox', 'distribution list']):
        return 'Email'

    # software issues
    software_kw = {'bug', 'crash', 'performance', 'security', 'feature', 'virus', 'malware'}
    if queue in ['it support', 'technical support']:
        if tag1 in software_kw or tag2 in software_kw:
            return 'Software'

    # Default remaining IT queues to Software
    if queue in ['it support', 'technical support']:
        return 'Software'

    return None


class TicketDataset(Dataset):
    def __init__(self, texts, labels, tokenizer):
        self.encodings = tokenizer(
            texts,
            max_length=MAX_LENGTH,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return {
            'input_ids': self.encodings['input_ids'][idx],
            'attention_mask': self.encodings['attention_mask'][idx],
            'token_type_ids': self.encodings['token_type_ids'][idx],
            'labels': self.labels[idx]
        }


def load_dataset():
    print("Loading full multilingual dataset (EN + DE)...")

    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at: {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    print(f"Total rows in CSV: {len(df)}")

    df['mapped_category'] = df.apply(map_to_category, axis=1)
    df = df[df['mapped_category'].notna()].copy()
    print(f"Rows after category mapping: {len(df)}")

    lang_counts = df['language'].value_counts().to_dict()
    for lang, cnt in sorted(lang_counts.items()):
        print(f"  {lang}: {cnt} rows")

    texts = (df['subject'].fillna('') + ' ' + df['body'].fillna('')).str.strip().str.lower().tolist()
    labels_raw = df['mapped_category'].tolist()

    return texts, labels_raw


def train_epoch(model, loader, optimizer, device):
    model.train()
    total_loss = 0.0
    for batch in loader:
        optimizer.zero_grad()
        input_ids = batch['input_ids'].to(device)
        attention_mask = batch['attention_mask'].to(device)
        token_type_ids = batch['token_type_ids'].to(device)
        labels = batch['labels'].to(device)

        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
            labels=labels
        )
        loss = outputs.loss
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    return total_loss / len(loader)


def evaluate(model, loader, device):
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for batch in loader:
            input_ids = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            token_type_ids = batch['token_type_ids'].to(device)
            labels = batch['labels'].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                token_type_ids=token_type_ids
            )
            preds = torch.argmax(outputs.logits, dim=-1)
            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())
    return np.array(all_labels), np.array(all_preds)


def main():
    print("mBERT Category Training — EN + DE full dataset")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Device: {device}")
    if device.type == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    texts, labels_raw = load_dataset()

    label_encoder = LabelEncoder()
    labels = label_encoder.fit_transform(labels_raw)
    num_labels = len(label_encoder.classes_)
    print(f"\nCategories ({num_labels}): {list(label_encoder.classes_)}")

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=labels
    )
    print(f"\nTrain/test split: 80/20")
    print(f"Training samples: {len(X_train)}")
    print(f"Test samples:     {len(X_test)}")

    print(f"\nLoading tokenizer: {BERT_MODEL_NAME}")
    tokenizer = BertTokenizer.from_pretrained(BERT_MODEL_NAME)

    print("Tokenizing training set...")
    train_dataset = TicketDataset(X_train, y_train.tolist(), tokenizer)
    print("Tokenizing test set...")
    test_dataset = TicketDataset(X_test, y_test.tolist(), tokenizer)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

    print(f"\nLoading model: {BERT_MODEL_NAME} (num_labels={num_labels})")
    model = BertForSequenceClassification.from_pretrained(
        BERT_MODEL_NAME,
        num_labels=num_labels
    )
    model.to(device)

    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE)

    print(f"\nFine-tuning for {EPOCHS} epochs...")
    for epoch in range(1, EPOCHS + 1):
        avg_loss = train_epoch(model, train_loader, optimizer, device)
        y_true, y_pred = evaluate(model, test_loader, device)
        epoch_acc = accuracy_score(y_true, y_pred)
        epoch_f1 = f1_score(y_true, y_pred, average='macro', zero_division=0)
        print(f"  Epoch {epoch}/{EPOCHS}  loss={avg_loss:.4f}  acc={epoch_acc*100:.2f}%  macro-F1={epoch_f1*100:.2f}%")

    print("\nFinal Evaluation")
    print("=" * 50)
    y_true, y_pred = evaluate(model, test_loader, device)
    final_acc = accuracy_score(y_true, y_pred)
    final_f1 = f1_score(y_true, y_pred, average='macro', zero_division=0)

    print(classification_report(
        y_true, y_pred,
        target_names=label_encoder.classes_,
        zero_division=0
    ))

    os.makedirs(MBERT_SAVE_DIR, exist_ok=True)
    print(f"\nSaving fine-tuned model to {MBERT_SAVE_DIR}/")
    model.save_pretrained(MBERT_SAVE_DIR)
    tokenizer.save_pretrained(MBERT_SAVE_DIR)

    os.makedirs(MODEL_DIR, exist_ok=True)
    with open(f"{MODEL_DIR}/mbert_label_encoder.pkl", 'wb') as f:
        pickle.dump(label_encoder, f)

    mbert_metadata = {
        'trained_at': datetime.now().isoformat(),
        'accuracy': final_acc,
        'f1_macro': final_f1,
        'categories': list(label_encoder.classes_),
        'num_labels': num_labels,
        'model_name': BERT_MODEL_NAME,
        'max_length': MAX_LENGTH,
        'batch_size': BATCH_SIZE,
        'epochs': EPOCHS,
        'learning_rate': LEARNING_RATE,
        'data_source': 'Multilingual EN+DE full dataset'
    }
    with open(f"{MODEL_DIR}/mbert_metadata.pkl", 'wb') as f:
        pickle.dump(mbert_metadata, f)

    print(f"Saved: {MBERT_SAVE_DIR}/")
    print(f"Saved: {MODEL_DIR}/mbert_label_encoder.pkl")
    print(f"Saved: {MODEL_DIR}/mbert_metadata.pkl")

    print(f"\nmBERT Category accuracy: {final_acc * 100:.2f}%  |  Macro F1: {final_f1 * 100:.2f}%")


if __name__ == "__main__":
    main()
