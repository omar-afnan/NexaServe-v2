import pandas as pd
import pickle
import os
import sys
import warnings
import numpy as np
from datetime import datetime
from scipy.sparse import hstack, csr_matrix

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV, StratifiedKFold
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix, f1_score
from sklearn.calibration import CalibratedClassifierCV
from imblearn.over_sampling import SMOTE

warnings.filterwarnings("ignore", category=FutureWarning)

CSV_PATH = "./aa_dataset-tickets-multi-lang-5-2-50-version.csv"
MODEL_DIR = "./models"




# Convert dataset fields into project ticket categories

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


def map_priority(priority_str):
    p = str(priority_str).strip().lower()
    if p == 'high':
        return 'High'
    if p == 'medium':
        return 'Medium'
    if p == 'low':
        return 'Low'
    if p == 'critical':
        return 'High'    # treat critical as high priority
    return 'Medium'


def load_tickets():
    print("Load Kaggle Dataset")

    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV file not found at: {CSV_PATH}")
        print("Make sure the file is in the same folder as TrainModel.py")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    print(f"Total rows in CSV: {len(df)}")

    # english tickets 
    df = df[df['language'] == 'en'].copy()
    print(f"English rows only: {len(df)}")

   
    df['mapped_category'] = df.apply(map_to_category, axis=1)

    # remove unmapped rows
    df = df[df['mapped_category'].notna()].copy()
    print(f"Rows after category mapping: {len(df)}")

   
    df['mapped_priority'] = df['priority'].apply(map_priority)

    # Build tickets list
    tickets = []
    for _, row in df.iterrows():
        title = str(row.get('subject', '') or '')
        description = str(row.get('body', '') or '')
        category = row['mapped_category']
        priority = row['mapped_priority']

        if title or description:
            tickets.append({
                'title': title,
                'description': description,
                'category': category,
                'priority': priority
            })

    print(f"prepare tickets for training: {len(tickets)}")
    return tickets


def preprocess(tickets):
    print("\nPreprocessing Data...")
    texts, categories, priorities = [], [], []

    for t in tickets:
        text = f"{t['title']} {t['description']}".strip().lower()
        texts.append(text)
        categories.append(t['category'])
        priorities.append(t['priority'])

    print("\nCategory Distribution:")
    cat_counts = {}
    for c in categories:
        cat_counts[c] = cat_counts.get(c, 0) + 1
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        pct = round(count / len(categories) * 100, 1)
        print(f"  {cat:<12} {count:>5} ({pct}%)")

    print("\nPriority Distribution:")
    pri_counts = {}
    for p in priorities:
        pri_counts[p] = pri_counts.get(p, 0) + 1
    for pri, count in sorted(pri_counts.items(), key=lambda x: -x[1]):
        pct = round(count / len(priorities) * 100, 1)
        print(f"  {pri:<12} {count:>5} ({pct}%)")

    return texts, categories, priorities




# additional features to capture urgency cues
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

    features = []
    for text in texts:
        t = text.lower()
        words = t.split()
        word_count = len(words)

        # Keyword hit counts
        high_score = sum(1 for kw in high_keywords if kw in t)
        low_score = sum(1 for kw in low_keywords if kw in t)
        medium_score = sum(1 for kw in medium_keywords if kw in t)

        # Punctuation signals exclamation = urgency, caps = shouting
        exclamation_count = t.count('!')
        question_count = t.count('?')
        caps_ratio = sum(1 for c in text if c.isupper()) / max(len(text), 1)

        # Length signals: very short = vague = often medium very long = detailed = often high
        is_short = 1 if word_count < 20 else 0
        is_long = 1 if word_count > 100 else 0

        # Negation near common actions (can't work, not working, won't open)
        negation_patterns = ["can't", "cannot", "won't", "not working", "doesn't work",
                              "unable to", "failed to", "no longer", "stopped working"]
        negation_score = sum(1 for p in negation_patterns if p in t)

        features.append([
            high_score,
            low_score,
            medium_score,
            exclamation_count,
            question_count,
            caps_ratio,
            word_count,
            is_short,
            is_long,
            negation_score
        ])

    return np.array(features, dtype=np.float32)


def train_models(X_train, X_test, y_train, y_test, task_name):
    print(f"\nTraining Baseline Models - {task_name}")

    y_train_array = np.asarray(y_train)
    unique_classes, class_counts = np.unique(y_train_array, return_counts=True)
    min_class_count = int(np.min(class_counts))

    print(f"Class distribution in training set:")
    for cls, count in zip(unique_classes, class_counts):
        print(f"  {cls}: {count} samples")

    baselines = {
        'Logistic Regression': LogisticRegression(
            max_iter=1000,
            solver='lbfgs',
            C=0.5,
            class_weight='balanced',
            random_state=42
        ),
        'Random Forest': RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_split=5,
            min_samples_leaf=2,
            class_weight='balanced',
            random_state=42
        )
    }

    if min_class_count >= 5:
        baselines['Linear SVM'] = LinearSVC(
            max_iter=2000,
            C=0.5,
            class_weight='balanced',
            random_state=42,
            dual="auto"
        )

    results = {}

    for name, model in baselines.items():
        print(f"\nTraining: {name}...")

        if name == 'Linear SVM':
            calibrated = CalibratedClassifierCV(model, cv=3, method='sigmoid')
            calibrated.fit(X_train, y_train)
            model = calibrated
        else:
            model.fit(X_train, y_train)

        y_pred = model.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        f1 = f1_score(y_test, y_pred, average='macro', zero_division=0)
        results[name] = (model, acc, y_pred, f1)
        print(f"  Accuracy: {acc * 100:.2f}%  |  Macro F1: {f1 * 100:.2f}%")

    print(f"\n{'Model':<25} {'Accuracy':>10} {'Macro F1':>10}")

    for name, (model, acc, _, f1) in sorted(results.items(), key=lambda x: -x[1][1]):
        marker = "  best" if acc == max(r[1] for r in results.values()) else ""
        print(f"{name:<25} {acc * 100:>9.2f}% {f1 * 100:>9.2f}%{marker}")

    return results


def tune_model(X_train, y_train, best_name, task_name):
    print(f"\nHyperparameter Tuning - {task_name}")
    print(f"Tuning: {best_name}")

    if best_name == 'Logistic Regression':
        param_grid = {
            'C': [0.01, 0.1, 0.5, 1.0, 2.0],
            'solver': ['lbfgs', 'saga'],
            'class_weight': ['balanced'],
            
        }
        base_model = LogisticRegression(max_iter=1000)

    elif best_name == 'Linear SVM':
        param_grid = {
            'C': [0.1, 0.5, 1.0],
            'class_weight': ['balanced']
        }
        base_model = LinearSVC(max_iter=2000, random_state=42, dual=True)

    elif best_name == 'Random Forest':
        param_grid = {
            'n_estimators': [100, 200],
            'max_depth': [10, None],
            'class_weight': ['balanced']
        }
        base_model = RandomForestClassifier(random_state=42)
    else:
        print(f"No tuning grid for {best_name}, skipping.")
        return None, {}

    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)

    # use macro F1 for class imbalance
    scoring = 'f1_macro' if 'Priority' in task_name else 'accuracy'

    grid_search = GridSearchCV(
        base_model, param_grid, cv=cv, scoring=scoring, n_jobs=-1, verbose=0
    )
    grid_search.fit(X_train, y_train)

    print(f"\nBest parameters: {grid_search.best_params_}")
    print(f"Best CV accuracy: {grid_search.best_score_ * 100:.2f}%")

    best_model = grid_search.best_estimator_

    if best_name == 'Linear SVM':
        calibrated = CalibratedClassifierCV(best_model, cv=3, method='sigmoid')
        calibrated.fit(X_train, y_train)
        best_model = calibrated

    return best_model, grid_search.best_params_


def model_eval(model, X_test, y_test, task_name, label_names=None, test_texts=None):
    print(f"\nFinal Evaluation - {task_name}")
    print("=" * 50)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1_macro = f1_score(y_test, y_pred, average='macro', zero_division=0)

    print(f"Final Accuracy: {acc * 100:.2f}%")
    print(f"Macro F1 Score: {f1_macro * 100:.2f}%")
    print(f"\nClassification Report:")
    print(classification_report(y_test, y_pred, zero_division=0))

    labels = label_names or sorted(set(y_test))
    cm = confusion_matrix(y_test, y_pred, labels=labels)

    print("Confusion Matrix:")
    header = "  " + " " * 12 + "".join(f"{l:>10}" for l in labels)
    print(header)
    for i, label in enumerate(labels):
        row_vals = "".join(f"{cm[i][j]:>10}" for j in range(len(labels)))
        print(f"  {label:>10} |{row_vals}")

    # show misclassified examples
    y_test_arr = np.asarray(y_test)
    y_pred_arr = np.asarray(y_pred)
    wrong_preds = np.where(y_test_arr != y_pred_arr)[0]

    if len(wrong_preds) > 0:
        print(f"\nError Analysis: {len(wrong_preds)} misclassified ({len(wrong_preds)/len(y_test_arr)*100:.1f}%)")
        rng = np.random.RandomState(42)
        sample_idx = rng.choice(wrong_preds, size=min(10, len(wrong_preds)), replace=False)
        print(f"Showing {min(10, len(wrong_preds))} misclassified samples:")
        for idx in sample_idx:
            text_preview = test_texts[idx][:80] + "..." if test_texts is not None and idx < len(test_texts) else "N/A"
            print(f"  True: {y_test_arr[idx]:<12} Predicted: {y_pred_arr[idx]:<12} | {text_preview}")

    return acc, f1_macro, y_pred

def save_models(cat_vectorizer, cat_model, cat_accuracy, cat_f1, cat_params,
                pri_vectorizer, pri_model, pri_accuracy, pri_f1, pri_params):
    print(f"\nSaving Models...")

    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR)

    with open(f"{MODEL_DIR}/category_vectorizer.pkl", 'wb') as f:
        pickle.dump(cat_vectorizer, f)
    with open(f"{MODEL_DIR}/category_model.pkl", 'wb') as f:
        pickle.dump(cat_model, f)

    with open(f"{MODEL_DIR}/priority_vectorizer.pkl", 'wb') as f:
        pickle.dump(pri_vectorizer, f)
    with open(f"{MODEL_DIR}/priority_model.pkl", 'wb') as f:
        pickle.dump(pri_model, f)

    # Label mappings — which classes the model knows
    cat_classes = list(cat_model.classes_) if hasattr(cat_model, 'classes_') else []
    pri_classes = list(pri_model.classes_) if hasattr(pri_model, 'classes_') else []

    metadata = {
        'trained_at': datetime.now().isoformat(),
        'category_accuracy': cat_accuracy,
        'category_f1_macro': cat_f1,
        'priority_accuracy': pri_accuracy,
        'priority_f1_macro': pri_f1,
        'categories': cat_classes,
        'priorities': pri_classes,
        'category_label_mapping': {i: label for i, label in enumerate(cat_classes)},
        'priority_label_mapping': {i: label for i, label in enumerate(pri_classes)},
        'category_best_params': cat_params,
        'priority_best_params': pri_params,
        'category_vectorizer_config': {
            'max_features': cat_vectorizer.max_features,
            'ngram_range': cat_vectorizer.ngram_range,
            'min_df': cat_vectorizer.min_df,
            'max_df': cat_vectorizer.max_df,
            'sublinear_tf': cat_vectorizer.sublinear_tf
        },
        'priority_vectorizer_config': {
            'max_features': pri_vectorizer.max_features,
            'ngram_range': pri_vectorizer.ngram_range,
            'min_df': pri_vectorizer.min_df,
            'max_df': pri_vectorizer.max_df,
            'sublinear_tf': pri_vectorizer.sublinear_tf
        },
        'priority_engineered_features': [
            'high_score', 'low_score', 'medium_score', 'exclamation_count',
            'question_count', 'caps_ratio', 'word_count', 'is_short', 'is_long', 'negation_score'
        ],
        'data_source': 'Kaggle - Multilingual Customer Support Tickets English subset'
    }
    with open(f"{MODEL_DIR}/metadata.pkl", 'wb') as f:
        pickle.dump(metadata, f)

    print(f"Saved to: {os.path.abspath(MODEL_DIR)}/")
    print(f"  Metadata includes: label mappings, vectorizer configs, F1 scores")


def main():

    print("training ml model")
   
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    tickets = load_tickets()

    if len(tickets) < 50:
        print("WARNING: Very few tickets loaded. Check CSV path and mapping.")
        return

    texts, categories, priorities = preprocess(tickets)

    cat_vectorizer = TfidfVectorizer(
        max_features=3000,
        ngram_range=(1, 2),
        stop_words='english',
        min_df=3,
        max_df=0.9,
        sublinear_tf=True
    )
    X_cat = cat_vectorizer.fit_transform(texts)


    pri_vectorizer = TfidfVectorizer(
        max_features=2000,
        ngram_range=(1, 3),    #trigrams  cannot access at all, entire team affected
        stop_words='english',
        min_df=1,              #urgency keywords are rare but important  keep them
        max_df=0.90,
        sublinear_tf=True
    )
    X_pri_tfidf = pri_vectorizer.fit_transform(texts)

    #Stack handcrafted priority features alongside TF-IDF 
    print("\nBuilding priority feature matrix (TF-IDF + engineered features)")
    pri_extra = priority_features(texts)
    X_pri = hstack([X_pri_tfidf, csr_matrix(pri_extra)])
    print(f"Priority feature matrix shape: {X_pri.shape}")

    print(f"\nCategory features: {X_cat.shape[1]}")
    print(f"Priority features: {X_pri.shape[1]} (TF-IDF + {pri_extra.shape[1]} engineered)")

    test_size = 0.20  # 80/20 split

    # Split texts alongside features for error analysis
    X_cat_train, X_cat_test, y_cat_train, y_cat_test, texts_cat_train, texts_cat_test = train_test_split(
        X_cat, categories, texts, test_size=test_size, random_state=42, stratify=categories
    )
    X_pri_train, X_pri_test, y_pri_train, y_pri_test, texts_pri_train, texts_pri_test = train_test_split(
        X_pri, priorities, texts, test_size=test_size, random_state=42, stratify=priorities
    )

    print(f"\nTrain/test split: 80/20")
    print(f"Training samples: {X_cat_train.shape[0]}")
    print(f"Test samples:     {X_cat_test.shape[0]}")

    
    #balance priority classes using SMOTE
    
    print("\nApplying SMOTE to balance priority training classes")
    print("Priority class distribution BEFORE SMOTE:")
    unique, counts = np.unique(y_pri_train, return_counts=True)
    for cls, cnt in zip(unique, counts):
        print(f"  {cls}: {cnt}")

    smote = SMOTE(random_state=42, k_neighbors=3)
    X_pri_train_balanced, y_pri_train_balanced = smote.fit_resample(X_pri_train, y_pri_train)

    print("Priority class distribution AFTER SMOTE:")
    unique, counts = np.unique(y_pri_train_balanced, return_counts=True)
    for cls, cnt in zip(unique, counts):
        print(f"  {cls}: {cnt}")

    #category

    print("category classification")
    

    cat_results = train_models(X_cat_train, X_cat_test, y_cat_train, y_cat_test, "Category")
    best_cat_name = max(cat_results, key=lambda k: cat_results[k][1])
    print(f"\nBest baseline: {best_cat_name} ({cat_results[best_cat_name][1] * 100:.2f}%)")

    cat_tuned_model, cat_best_params = tune_model(X_cat_train, y_cat_train, best_cat_name, "Category")
    final_cat_model = cat_tuned_model if cat_tuned_model else cat_results[best_cat_name][0]
    if not cat_tuned_model:
        cat_best_params = {}

    cat_labels = sorted(set(categories))
    cat_accuracy, cat_f1, _ = model_eval(final_cat_model, X_cat_test, y_cat_test, "Category", cat_labels, texts_cat_test)

    #priority

    print("priority classification")


    pri_results = train_models(X_pri_train_balanced, X_pri_test, y_pri_train_balanced, y_pri_test, "Priority")
    best_pri_name = max(pri_results, key=lambda k: pri_results[k][1])
    print(f"\nBest baseline: {best_pri_name} ({pri_results[best_pri_name][1] * 100:.2f}%)")

    pri_tuned_model, pri_best_params = tune_model(X_pri_train_balanced, y_pri_train_balanced, best_pri_name, "Priority")
    final_pri_model = pri_tuned_model if pri_tuned_model else pri_results[best_pri_name][0]
    if not pri_tuned_model:
        pri_best_params = {}

    pri_labels = sorted(set(priorities))
    pri_accuracy, pri_f1, _ = model_eval(final_pri_model, X_pri_test, y_pri_test, "Priority", pri_labels, texts_pri_test)

    save_models(
        cat_vectorizer, final_cat_model, cat_accuracy, cat_f1, cat_best_params,
        pri_vectorizer, final_pri_model, pri_accuracy, pri_f1, pri_best_params
    )

    print("\n training has completed successfully ")
    print(f"Total tickets trained on: {len(tickets)}")
    print(f"Category accuracy: {cat_accuracy * 100:.2f}%  |  Macro F1: {cat_f1 * 100:.2f}%")
    print(f"Priority accuracy: {pri_accuracy * 100:.2f}%  |  Macro F1: {pri_f1 * 100:.2f}%")


if __name__ == "__main__":
    main()
