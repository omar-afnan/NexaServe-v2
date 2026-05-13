
from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import os
import sqlite3
from collections import Counter
import numpy as np
from scipy.sparse import hstack, csr_matrix
from datetime import datetime, timedelta
import torch
from transformers import BertTokenizer, BertForSequenceClassification

try:
    from langdetect import detect as langdetect_detect
    LANGDETECT_AVAILABLE = True
except ImportError:
    LANGDETECT_AVAILABLE = False

try:
    from deep_translator import GoogleTranslator
    DEEP_TRANSLATOR_AVAILABLE = True
except ImportError:
    DEEP_TRANSLATOR_AVAILABLE = False


def detect_and_translate(text):
    """
    Returns (detected_language, translated_text).
    Falls back to ('en', original text) on any failure.
    """
    detected_lang = 'en'
    translated = text

    if not LANGDETECT_AVAILABLE or not DEEP_TRANSLATOR_AVAILABLE:
        return detected_lang, translated

    try:
        detected_lang = langdetect_detect(text)
    except Exception:
        return 'en', text

    if detected_lang == 'en':
        return detected_lang, text

    try:
        translated = GoogleTranslator(source=detected_lang, target='en').translate(text)
        if not translated:
            translated = text
    except Exception:
        translated = text

    return detected_lang, translated

app = Flask(__name__)
CORS(app)  # allow frontend requests

MODEL_DIR = "./models"
DATABASE_PATH = "../tickets.db"  # sqlite database path 

category_vectorizer = None
category_model = None
priority_vectorizer = None
priority_model = None
model_metadata = None
mbert_tokenizer = None
mbert_model = None
mbert_label_encoder = None
mbert_metadata = None
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

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
        high_score = sum(1 for kw in high_keywords if kw in t)
        low_score = sum(1 for kw in low_keywords if kw in t)
        medium_score = sum(1 for kw in medium_keywords if kw in t)
        exclamation_count = t.count('!')
        question_count = t.count('?')
        caps_ratio = sum(1 for c in text if c.isupper()) / max(len(text), 1)
        is_short = 1 if word_count < 20 else 0
        is_long = 1 if word_count > 100 else 0
        negation_patterns = ["can't", "cannot", "won't", "not working", "doesn't work",
                              "unable to", "failed to", "no longer", "stopped working"]
        negation_score = sum(1 for p in negation_patterns if p in t)
        features.append([high_score, low_score, medium_score, exclamation_count,
                         question_count, caps_ratio, word_count, is_short, is_long, negation_score])
    return np.array(features, dtype=np.float32)


def load_models():
    global category_vectorizer, category_model
    global priority_vectorizer, priority_model
    global model_metadata
    global mbert_tokenizer, mbert_model, mbert_label_encoder, mbert_metadata

    try:
        print("loading ml models")

        with open(f"{MODEL_DIR}/category_vectorizer.pkl", 'rb') as f:
            category_vectorizer = pickle.load(f)
        with open(f"{MODEL_DIR}/category_model.pkl", 'rb') as f:
            category_model = pickle.load(f)

        with open(f"{MODEL_DIR}/priority_vectorizer.pkl", 'rb') as f:
            priority_vectorizer = pickle.load(f)
        with open(f"{MODEL_DIR}/priority_model.pkl", 'rb') as f:
            priority_model = pickle.load(f)

        with open(f"{MODEL_DIR}/metadata.pkl", 'rb') as f:
            model_metadata = pickle.load(f)

        mbert_tokenizer = BertTokenizer.from_pretrained(f"{MODEL_DIR}/mbert_category")
        mbert_model = BertForSequenceClassification.from_pretrained(f"{MODEL_DIR}/mbert_category")
        mbert_model.to(device)
        mbert_model.eval()
        mbert_label_encoder = pickle.load(open(f"{MODEL_DIR}/mbert_label_encoder.pkl", 'rb'))
        with open(f"{MODEL_DIR}/mbert_metadata.pkl", 'rb') as f:
            mbert_metadata = pickle.load(f)

        print("models loaded")
        print(f"priorities: {model_metadata.get('priorities', [])}")
        
        print(f"priority accuracy: {round(model_metadata.get('priority_accuracy', 0) * 100, 2)}%")

        return True

    except FileNotFoundError as e:
        print(f"Model files not found: {e}")
        print("run TrainModel.py first")
        return False
    except Exception as e:
        print(f"Error loading models: {e}")
        return False

@app.route('/health', methods=['GET'])
def health_check():
    models_loaded = category_model is not None and priority_model is not None
    
    return jsonify({
        'status': 'healthy' if models_loaded else 'models_not_loaded',
        'models_loaded': models_loaded,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        title = data.get('title', '')
        description = data.get('description', '')
        text = f"{title} {description}".strip().lower()
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400

        detected_language, translated_text = detect_and_translate(text)
        ml_text = translated_text

        # Category (mBERT)
        inputs = mbert_tokenizer(
            translated_text,
            return_tensors='pt',
            max_length=128,
            padding='max_length',
            truncation=True
        ).to(device)

        with torch.no_grad():
            outputs = mbert_model(**inputs)
            logits = outputs.logits
            probs = torch.softmax(logits, dim=-1)
            cat_idx = torch.argmax(probs, dim=-1).item()
            category_confidence = float(probs[0][cat_idx].item())

        cat_pred = mbert_label_encoder.inverse_transform([cat_idx])[0]
        cat_proba_tensor = probs[0].cpu().numpy()
        category_probabilities = {
            cls: float(cat_proba_tensor[i])
            for i, cls in enumerate(mbert_label_encoder.classes_)
        }

        # Priority
        X_tfidf = priority_vectorizer.transform([ml_text])
        X_extra = csr_matrix(priority_features([ml_text]))
        pri_vec = hstack([X_tfidf, X_extra])
        pri_pred = priority_model.predict(pri_vec)[0]
        if hasattr(priority_model, "predict_proba"):
            pri_proba = priority_model.predict_proba(pri_vec)[0]
        elif hasattr(priority_model, "decision_function"):
            scores = priority_model.decision_function(pri_vec)[0]
            scores = np.atleast_1d(scores)
            scores -= scores.max()
            exp_scores = np.exp(scores)
            pri_proba = exp_scores / exp_scores.sum()
        else:
            pri_proba = np.ones(len(priority_model.classes_)) / len(priority_model.classes_)
        
        
        priority_probabilities = {cls: float(pri_proba[i]) for i, cls in enumerate(priority_model.classes_)}

        return jsonify({
            'category': cat_pred,
            'category_confidence': round(category_confidence, 4),
            'category_probabilities': category_probabilities,
            'category_model': 'mbert',
            'priority': pri_pred,
            'priority_confidence': round(float(max(pri_proba)), 4),
            'priority_probabilities': priority_probabilities,
            'detected_language': detected_language,
            'translated_text': translated_text if detected_language != 'en' else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/stats', methods=['GET'])
def get_stats():
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT ticket_id, title, description, category, priority, status, created_at 
            FROM tickets """)
        tickets = cursor.fetchall()
        conn.close()

        total_tickets = len(tickets)

        if total_tickets == 0:
            return jsonify({
                'success': True,
                'total_tickets': 0,
                'message': 'No tickets in database'
            })

        categories = [t[3] for t in tickets if t[3]]
        category_counts = dict(Counter(categories))

        priorities = [t[4] for t in tickets if t[4]]
        priority_counts = dict(Counter(priorities))

        statuses = [t[5] for t in tickets if t[5]]
        status_counts = dict(Counter(statuses))

        now = datetime.now()  # naive local time, matches SQLite CURRENT_TIMESTAMP
        this_week_start = now - timedelta(days=7)
        last_week_start = now - timedelta(days=14)

        this_week_count = 0
        last_week_count = 0

        for ticket in tickets:
            try:
                date_str = ticket[6]
                if date_str:
                    date_str = date_str.strip().replace('Z', '').replace('+00:00', '')
                    # SQLite stores as "YYYY-MM-DD HH:MM:SS", normalize T-variant too
                    date_str = date_str.replace('T', ' ')
                    if '.' in date_str:
                        created = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S.%f')
                    else:
                        created = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')

                    if created >= this_week_start:
                        this_week_count += 1
                    elif created >= last_week_start:
                        last_week_count += 1
            except Exception:
                pass

        # Weekly trend by category
        weekly_category_trend = {}
        for ticket in tickets:
            try:
                date_str = ticket[6]
                if date_str:
                    date_str = date_str.strip().replace('Z', '').replace('+00:00', '')
                    date_str = date_str.replace('T', ' ')
                    if '.' in date_str:
                        created = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S.%f')
                    else:
                        created = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')

                    cat = ticket[3]
                    if cat:
                        if cat not in weekly_category_trend:
                            weekly_category_trend[cat] = {'this_week': 0, 'last_week': 0}
                        if created >= this_week_start:
                            weekly_category_trend[cat]['this_week'] += 1
                        elif created >= last_week_start:
                            weekly_category_trend[cat]['last_week'] += 1
            except Exception:
                pass

        # trends
        trends = []
        for cat, counts in weekly_category_trend.items():
            this_week = counts['this_week']
            last_week = counts['last_week']

            if last_week > 0:
                change_percent = round(((this_week - last_week) / last_week) * 100, 1)
            elif this_week > 0:
                change_percent = 100
            else:
                change_percent = 0

            trend = 'increasing' if change_percent > 20 else ('decreasing' if change_percent < -20 else 'stable')

            trends.append({
                'category': cat,
                'this_week': this_week,
                'last_week': last_week,
                'change_percent': change_percent,
                'trend': trend
            })

        trends.sort(key=lambda x: x['this_week'], reverse=True)


        stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
                      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
                      'could', 'should', 'may', 'might', 'must', 'can', 'need',
                      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
                      'as', 'into', 'through', 'and', 'but', 'or', 'not', 'no',
                      'my', 'your', 'this', 'that', 'it', 'i', 'me', 'we', 'you',
                      'create', 'ticket', 'please', 'help', 'issue', 'problem'}

        all_words = []
        for ticket in tickets:
            title = (ticket[1] or '').lower()
            words = ''.join(c if c.isalnum() or c.isspace() else ' ' for c in title).split()
            words = [w for w in words if len(w) > 2 and w not in stop_words]
            all_words.extend(words)

        word_counts = Counter(all_words).most_common(15)
        common_keywords = [{'word': w, 'count': c} for w, c in word_counts]

        insights = []

        if category_counts:
            top_category = max(category_counts, key=category_counts.get)
            top_count = category_counts[top_category]
            percent = round((top_count / total_tickets) * 100, 1)
            insights.append({
                'type': 'info',
                'title': 'Most Common Issue Category',
                'message': f'{top_category} accounts for {percent}% of all tickets ({top_count} tickets)'
            })

        high_priority = priority_counts.get('High', 0) + priority_counts.get('Critical', 0)
        if high_priority > 0:
            high_percent = round((high_priority / total_tickets) * 100, 1)
            if high_percent > 30:
                insights.append({
                    'type': 'warning',
                    'title': 'High Priority Alert',
                    'message': f'{high_percent}% of tickets are High/Critical priority ({high_priority} tickets)'
                })

        increasing = [t for t in trends if t['trend'] == 'increasing']
        if increasing:
            names = ', '.join([t['category'] for t in increasing[:3]])
            insights.append({
                'type': 'trend',
                'title': 'Rising Issue Trends',
                'message': f'{names} issues are increasing this week'
            })

        response = {
            'success': True,
            'total_tickets': total_tickets,
            'model_info': {
                'trained_at': model_metadata.get('trained_at') if model_metadata else None,
                'category_accuracy': round(mbert_metadata.get('accuracy', 0) * 100, 2) if mbert_metadata else None,
                'category_model': 'mbert',
                'priority_accuracy': round(model_metadata.get('priority_accuracy', 0) * 100, 2) if model_metadata else None,
                'categories': list(mbert_label_encoder.classes_) if mbert_label_encoder else [],
                'priorities': model_metadata.get('priorities', []) if model_metadata else []
            },
            'category_distribution': category_counts,
            'priority_distribution': priority_counts,
            'status_distribution': status_counts,
            'weekly_comparison': {
                'this_week': this_week_count,
                'last_week': last_week_count
            },
            'category_trends': trends,
            'common_keywords': common_keywords,
            'insights': insights
        }

        return jsonify(response)

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/retrain', methods=['POST'])
def retrain():
    try:
        import subprocess
        result = subprocess.run(['python', 'TrainModel.py'], capture_output=True, text=True)
        
        if result.returncode == 0:
            load_models()
            return jsonify({
                'success': True,
                'message': 'Model retrained successfully',
                'output': result.stdout
            })
        else:
            return jsonify({
                'success': False,
                'error': result.stderr
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    models_loaded = load_models()
    app.run(host='0.0.0.0', port=5006, debug=False)
