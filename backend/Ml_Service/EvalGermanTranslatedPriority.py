"""
Same translate-then-classify test as EvalGermanTranslated.py, but for priority
instead of category: translate the German tickets to English and see if the
English-only TF-IDF + Random Forest priority model can cope.

Steps:
  1. Load the dataset. Category mapping is only used to narrow down to the 5 IT
     categories; then apply the priority mapping.
  2. Train TF-IDF + engineered urgency features + Random Forest with SMOTE on the
     English rows of the 80% training split (random_state=42, same as
     TrainModel.py - 7,780 train / 1,946 test).
  3. Pull the German rows from the 20% test split of the full multilingual set.
  4. Translate each to English with deep_translator's GoogleTranslator; failed
     translations are skipped and counted. Finished translations are cached to
     disk so a run killed by a rate limit can pick up where it left off.
  5. Report accuracy and macro F1, and write german_translated_priority_results.json.

Run it standalone, not via the Flask service (PredictionApi.py, port 5006):
    python EvalGermanTranslatedPriority.py

Nothing new to install.
"""

import os
import sys
import json
import time
import hashlib
import numpy as np
import pandas as pd
from datetime import datetime
from scipy.sparse import hstack, csr_matrix

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
from imblearn.over_sampling import SMOTE

import requests
from deep_translator import GoogleTranslator

CSV_PATH = "./aa_dataset-tickets-multi-lang-5-2-50-version.csv"
RESULTS_PATH = "./german_translated_priority_results.json"
CACHE_PATH = "./german_translation_cache.json"

# Google throttles bulk translation, so these knobs slow the run down in
# exchange for it surviving a temporary block rather than losing the test set.
REQUEST_DELAY = 0.5      # seconds between successful calls
MAX_RETRIES = 3          # attempts per ticket before giving up
BACKOFF_BASE = 2.0       # backoff is 2s, then 4s, then 8s
CONNECT_TIMEOUT = 10     # deep_translator sets no timeout of its own
READ_TIMEOUT = 20

# deep_translator 1.9.1 calls requests.get() with no timeout, so a blocked
# request hangs for however long the OS default is (minutes). Force one in.
_original_requests_get = requests.get


def _requests_get_with_timeout(*args, **kwargs):
    kwargs.setdefault('timeout', (CONNECT_TIMEOUT, READ_TIMEOUT))
    return _original_requests_get(*args, **kwargs)


requests.get = _requests_get_with_timeout


# Category mapping - identical to TrainModel.py / EvalMultilingual.py

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


# Priority mapping - identical to TrainModel.py / EvalMultilingual.py

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


# Engineered urgency features - identical to TrainModel.py

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


# Translation cache and retry - so a rerun doesn't redo work that's already done

def _cache_key(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()


def load_cache():
    """Translations from earlier runs, keyed by a hash of the German text."""
    if not os.path.exists(CACHE_PATH):
        return {}
    try:
        with open(CACHE_PATH, 'r', encoding='utf-8') as f:
            cache = json.load(f)
        print(f"Loaded {len(cache)} cached translations from {CACHE_PATH}")
        return cache
    except Exception as e:
        print(f"  cache unreadable ({e}) — starting fresh")
        return {}


def save_cache(cache):
    with open(CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False)


def translate_with_retry(translator, text):
    """
    Returns the English translation, or None if the text genuinely can't be
    translated. Raises RuntimeError if every attempt died on a network or
    rate-limit error - the caller takes that as "stop now" rather than plough
    on and end up with a biased subset of the test set.
    """
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            result = translator.translate(text)
            if not result:
                # Google replied but with nothing - the input itself is the
                # problem, not the connection, so retrying won't help.
                return None
            return result
        except Exception as e:
            last_error = e
            msg = str(e).lower()
            transient = any(s in msg for s in
                            ['timed out', 'timeout', 'max retries', 'connection',
                             'too many requests', '429', 'temporarily'])
            if not transient:
                return None
            if attempt < MAX_RETRIES - 1:
                wait = BACKOFF_BASE ** (attempt + 1)
                print(f"  retry {attempt + 1}/{MAX_RETRIES - 1} in {wait:.0f}s ({e})")
                time.sleep(wait)

    raise RuntimeError(f"translation blocked after {MAX_RETRIES} attempts: {last_error}")


def load_data():
    """Returns the mapped dataframe with 'text' and 'mapped_priority' columns."""
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    print(f"Total rows in CSV: {len(df)}")

    # We only run the category mapping to drop non-IT tickets
    df['mapped_category'] = df.apply(map_to_category, axis=1)
    df = df[df['mapped_category'].notna()].copy()

    df['mapped_priority'] = df['priority'].apply(map_priority)

    # text is subject + body, lowercased, like everywhere else
    df['text'] = (
        df['subject'].fillna('').astype(str) + ' ' + df['body'].fillna('').astype(str)
    ).str.strip().str.lower()
    df = df[df['text'] != ''].copy().reset_index(drop=True)

    print(f"Rows after category mapping: {len(df)}")
    return df


def main():
    started_at = datetime.now().isoformat()
    df = load_data()

    # Priority training and testing is English-only, same as TrainModel.py
    # (7,780 train / 1,946 test).
    df_en = df[df['language'] == 'en'].reset_index(drop=True)
    print(f"English rows: {len(df_en)}")

    train_en, test_en = train_test_split(
        df_en, test_size=0.20, random_state=42, stratify=df_en['mapped_priority']
    )
    print(f"English train: {len(train_en)}  |  English test: {len(test_en)}")

    train_texts = train_en['text'].tolist()
    y_train = train_en['mapped_priority'].tolist()

    # TF-IDF plus the 10 urgency features, identical to TrainModel.py
    vectorizer = TfidfVectorizer(
        max_features=2000,
        ngram_range=(1, 3),
        stop_words='english',
        min_df=1,
        max_df=0.90,
        sublinear_tf=True
    )
    X_train_tfidf = vectorizer.fit_transform(train_texts)
    X_train = hstack([X_train_tfidf, csr_matrix(priority_features(train_texts))])
    print(f"Feature matrix shape: {X_train.shape}")

    # SMOTE touches the training split only, never the test split
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
    print("Model trained: TF-IDF + Random Forest + SMOTE (English-only)")

    # German rows from the test split of the full multilingual set - same split
    # call as EvalGermanTranslated.py so the rows match up.
    _, test_all = train_test_split(
        df, test_size=0.20, random_state=42, stratify=df['mapped_category']
    )
    test_de = test_all[test_all['language'] == 'de'].reset_index(drop=True)
    print(f"\nGerman test rows: {len(test_de)}")
    if len(test_de) == 0:
        print("No German rows in the test split — nothing to evaluate.")
        return

    # Translate each one, skip failures. Finished translations go to a disk
    # cache so a run killed by a rate limit resumes instead of starting over.
    translator = GoogleTranslator(source='de', target='en')
    translator.proxies = {}
    cache = load_cache()
    translated_texts = []
    translated_labels = []
    skipped = 0
    from_cache = 0
    blocked = False

    print("Translating German tickets to English...")
    total = len(test_de)
    for i, (text, label) in enumerate(zip(test_de['text'], test_de['mapped_priority']), 1):
        key = _cache_key(text)

        if key in cache:
            entry = cache[key]
            from_cache += 1
            if entry is None:
                skipped += 1
            else:
                translated_texts.append(entry)
                translated_labels.append(label)
            continue

        try:
            result = translate_with_retry(translator, text)
        except RuntimeError as e:
            # Rate limited. Stop - carrying on would drop a whole run of test
            # rows at the end and skew the numbers.
            print(f"\n  ABORTED at ticket {i}/{total}: {e}")
            blocked = True
            break

        cache[key] = result
        if result is None:
            skipped += 1
            print(f"  skipped (translation failed): {text[:80]}...")
        else:
            translated_texts.append(result)
            translated_labels.append(label)

        if i % 50 == 0:
            save_cache(cache)
            print(f"  ...{i}/{total} ({len(translated_texts)} ok, {skipped} skipped)")

        time.sleep(REQUEST_DELAY)

    save_cache(cache)

    attempted = len(translated_texts) + skipped
    print(f"\nTranslated: {len(translated_texts)}  |  Skipped: {skipped}"
          f"  |  From cache: {from_cache}")

    if blocked:
        print("=" * 55)
        print(f"RUN INCOMPLETE - {attempted}/{total} tickets processed.")
        print(f"Progress is cached in {CACHE_PATH}.")
        print("Rerun this script later to resume; no results written.")
        print("=" * 55)
        return

    if len(translated_texts) == 0:
        print("All translations failed — cannot compute metrics.")
        return

    # Same fitted vectorizer, same features, same model - just fed the
    # translated text instead of English originals.
    X_test_tfidf = vectorizer.transform(translated_texts)
    X_test = hstack([X_test_tfidf, csr_matrix(priority_features(translated_texts))])
    y_pred = model.predict(X_test)

    accuracy = float(accuracy_score(translated_labels, y_pred))
    macro_f1 = float(f1_score(translated_labels, y_pred, average='macro', zero_division=0))
    class_names = sorted(set(translated_labels))
    per_class_f1_arr = f1_score(translated_labels, y_pred, average=None,
                                labels=class_names, zero_division=0)
    per_class_f1 = {cls: round(float(s), 4) for cls, s in zip(class_names, per_class_f1_arr)}

    print("\n" + "=" * 55)
    print("RESULT - German tickets translated to English (priority)")
    print("=" * 55)
    print(f"Evaluated tickets: {len(translated_texts)}  (skipped {skipped})")
    print(f"Accuracy:  {accuracy * 100:.2f}%")
    print(f"Macro F1:  {macro_f1 * 100:.2f}%")
    print("\nClassification Report:")
    print(classification_report(translated_labels, y_pred, zero_division=0))

    results = {
        "model": "TF-IDF + Random Forest + SMOTE (English-trained)",
        "task": "priority_classification",
        "dataset": os.path.basename(CSV_PATH),
        "language_filter": "trained on English-only; tested on German translated to English",
        "translator": "deep_translator GoogleTranslator (de -> en)",
        "split": {
            "test_size": 0.2,
            "random_state": 42,
            "stratified": True
        },
        "smote": {
            "applied_to": "training_split_only",
            "k_neighbors": 3,
            "random_state": 42
        },
        "hyperparameters": {
            "tfidf_max_features": 2000,
            "tfidf_ngram_range": [1, 3],
            "tfidf_min_df": 1,
            "tfidf_max_df": 0.90,
            "tfidf_sublinear_tf": True,
            "engineered_features": 10,
            "n_estimators": 100,
            "max_depth": 10,
            "min_samples_split": 5,
            "min_samples_leaf": 2,
            "class_weight": "balanced",
            "random_state": 42
        },
        "train_samples": len(train_en),
        "train_samples_after_smote": int(X_train_bal.shape[0]),
        "test_samples": len(translated_texts),
        "skipped_translations": skipped,
        "num_classes": len(class_names),
        "classes": class_names,
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(float(f1_score(translated_labels, y_pred,
                                            average='weighted', zero_division=0)), 4),
        "per_class_f1": per_class_f1,
        "evaluated_at": started_at,
        "completed_at": datetime.now().isoformat(),
    }

    with open(RESULTS_PATH, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {os.path.abspath(RESULTS_PATH)}")


if __name__ == "__main__":
    main()
