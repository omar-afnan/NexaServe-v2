"""
German translation experiment: does translating German tickets to English
let a monolingual (English-trained) TF-IDF + Linear SVM category model work?

Run separately from the Flask service (PredictionApi.py, port 5006):
    python EvalGermanTranslated.py

What it does:
  1. Loads the same Kaggle multilingual dataset, same category mapping.
  2. Trains TF-IDF + Linear SVM on the English-only 80% training split
     (random_state=42, 80/20 stratified split — identical to EvalMultilingual.py).
  3. Takes the German-only rows from the 20% test split.
  4. Translates each German ticket text to English via deep_translator GoogleTranslator,
     with a try/except per call — failed translations are skipped and counted.
  5. Prints accuracy and macro F1 on the translated German test set.

No new dependencies: pandas, scikit-learn, deep_translator are all already used.
"""

import os
import sys

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report

from deep_translator import GoogleTranslator

CSV_PATH = "./aa_dataset-tickets-multi-lang-5-2-50-version.csv"


#  Category mapping — identical to TrainModel.py / EvalMultilingual.py

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
    """Returns the full mapped dataframe with 'text' and 'mapped_category' columns."""
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    print(f"Total rows in CSV: {len(df)}")

    df['mapped_category'] = df.apply(map_to_category, axis=1)
    df = df[df['mapped_category'].notna()].copy()

    # text = combined title + description, lowercased — same as the other scripts
    df['text'] = (
        df['subject'].fillna('').astype(str) + ' ' + df['body'].fillna('').astype(str)
    ).str.strip().str.lower()
    df = df[df['text'] != ''].copy().reset_index(drop=True)

    print(f"Rows after category mapping: {len(df)}")
    return df


def main():
    df = load_data()

    # 80/20 stratified split on the FULL multilingual set, seed 42 —
    # identical split call as EvalMultilingual.py so the test rows match.
    train_df, test_df = train_test_split(
        df, test_size=0.20, random_state=42, stratify=df['mapped_category']
    )
    print(f"Train: {len(train_df)}  |  Test: {len(test_df)}")

    # Train the monolingual model on English-only training rows.
    train_en = train_df[train_df['language'] == 'en']
    print(f"English training rows: {len(train_en)}")

    vectorizer = TfidfVectorizer(
        max_features=3000,
        ngram_range=(1, 2),
        stop_words='english',
        min_df=3,
        max_df=0.9,
        sublinear_tf=True
    )
    X_train = vectorizer.fit_transform(train_en['text'])

    svm = LinearSVC(max_iter=2000, C=0.5, class_weight='balanced',
                    random_state=42, dual="auto")
    model = CalibratedClassifierCV(svm, cv=3, method='sigmoid')
    model.fit(X_train, train_en['mapped_category'])
    print("Model trained: TF-IDF + Linear SVM (English-only)")

    # German-only rows from the test split.
    test_de = test_df[test_df['language'] == 'de'].reset_index(drop=True)
    print(f"\nGerman test rows: {len(test_de)}")
    if len(test_de) == 0:
        print("No German rows in the test split — nothing to evaluate.")
        return

    # Translate each German ticket to English, skipping failures.
    translator = GoogleTranslator(source='de', target='en')
    translated_texts = []
    translated_labels = []
    skipped = 0

    print("Translating German tickets to English...")
    for text, label in zip(test_de['text'], test_de['mapped_category']):
        try:
            result = translator.translate(text)
            if not result:
                raise ValueError("empty translation")
            translated_texts.append(result)
            translated_labels.append(label)
        except Exception as e:
            skipped += 1
            print(f"  skipped (translation failed): {e}")

    print(f"\nTranslated: {len(translated_texts)}  |  Skipped: {skipped}")
    if len(translated_texts) == 0:
        print("All translations failed — cannot compute metrics.")
        return

    # Run the English-trained pipeline on the translated text.
    X_test = vectorizer.transform(translated_texts)
    y_pred = model.predict(X_test)

    accuracy = accuracy_score(translated_labels, y_pred)
    macro_f1 = f1_score(translated_labels, y_pred, average='macro', zero_division=0)

    print("\n" + "=" * 55)
    print("RESULT — German tickets translated to English")
    print("=" * 55)
    print(f"Evaluated tickets: {len(translated_texts)}  (skipped {skipped})")
    print(f"Accuracy:  {accuracy * 100:.2f}%")
    print(f"Macro F1:  {macro_f1 * 100:.2f}%")
    print("\nClassification Report:")
    print(classification_report(translated_labels, y_pred, zero_division=0))


if __name__ == "__main__":
    main()
