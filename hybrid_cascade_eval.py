"""
hybrid_cascade_eval.py

Takes ~75 real ticket bodies from the held-out test split
(backend/Ml_Service/aa_dataset-tickets-multi-lang-5-2-50-version.csv) and runs
them through the live chatbot cascade by POSTing to /chatbot on the Node
backend. The split is the same 80/20 stratified one used for category
classification (seed 42, stratify on queue), so these really are unseen rows.

Before running, you need all of this up:
  1. Node backend:   cd backend && node server.js                     (port 5000)
  2. Flask chatbot:  cd ChatbotService && python ChatBot_Services.py  (port 5005)
  3. Ollama
  Redis isn't needed - Node falls back to in-memory on its own.

To run:
  1. Fill in LOGIN_EMAIL / LOGIN_PASSWORD below, or drop a JWT into JWT_TOKEN.
  2. python hybrid_cascade_eval.py
  3. Output prints as it goes and lands in hybrid_eval_results.csv here.

Afterwards, look up the session IDs it prints (or just the newest N rows by
timestamp) in llama_logs to work out the Table 5 numbers: validation_failed %,
resolution %, false_refusal %, hallucination rate, escalation %.
"""

import requests
import pandas as pd
import time
import csv
import sys

from sklearn.model_selection import train_test_split

# Config - set these before running
LOGIN_EMAIL    = "admin@test.com"   # <-- change me
LOGIN_PASSWORD = "admin123"           # <-- change me
JWT_TOKEN      = None  # paste a valid JWT here to skip the login call entirely

BACKEND_URL   = "http://localhost:5000"
CSV_PATH      = "backend/Ml_Service/aa_dataset-tickets-multi-lang-5-2-50-version.csv"
TEXT_COL      = "body"
STRAT_COL     = "queue"   # what the ML pipeline stratifies its split on
RANDOM_SEED   = 42
TEST_SIZE     = 0.2
N_SAMPLE      = 75
DELAY_SEC     = 1.5       # pause between requests so Ollama isn't hammered
OUTPUT_CSV    = "hybrid_eval_results.csv"


def login(email: str, password: str) -> str:
    resp = requests.post(f"{BACKEND_URL}/auth/login", json={"userEmail": email, "userPassword": password}, timeout=15)
    resp.raise_for_status()
    body = resp.json()
    token = body.get("token") or body.get("accessToken")
    if not token:
        raise RuntimeError(f"Login ok but no token in response: {body}")
    return token


def get_test_sample() -> list[str]:
    df = pd.read_csv(CSV_PATH)
    df = df[df[TEXT_COL].notna()]

    if STRAT_COL in df.columns:
        _, test_df = train_test_split(
            df, test_size=TEST_SIZE, random_state=RANDOM_SEED, stratify=df[STRAT_COL]
        )
    else:
        print(f"[warn] stratify column '{STRAT_COL}' not found - using plain split")
        _, test_df = train_test_split(df, test_size=TEST_SIZE, random_state=RANDOM_SEED)

    sample = test_df.sample(n=min(N_SAMPLE, len(test_df)), random_state=RANDOM_SEED)
    return sample[TEXT_COL].astype(str).tolist()


def reset_conversation(token: str) -> None:
    auth_header = token if token.lower().startswith("bearer ") else f"Bearer {token}"
    resp = requests.post(
        f"{BACKEND_URL}/debug/reset-conversation",
        headers={"Authorization": auth_header, "Content-Type": "application/json"},
        timeout=15,
    )
    resp.raise_for_status()


def send_message(token: str, message: str, session_id: str) -> dict:
    auth_header = token if token.lower().startswith("bearer ") else f"Bearer {token}"
    resp = requests.post(
        f"{BACKEND_URL}/chatbot",
        json={"message": message, "session_id": session_id},
        headers={"Authorization": auth_header, "Content-Type": "application/json"},
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    token = JWT_TOKEN or login(LOGIN_EMAIL, LOGIN_PASSWORD)
    print(f"Authenticated. Token prefix: {token[:25]}...")

    tickets = get_test_sample()
    print(f"Loaded {len(tickets)} ticket bodies from the held-out test split.\n")

    results = []
    for i, body_text in enumerate(tickets, start=1):
        reset_conversation(token)
        session_id = f"hybrid_eval_{int(time.time())}_{i}"
        truncated = body_text[:4000]

        print(f"[{i:02d}/{len(tickets)}] session={session_id}")
        print(f"  input: {truncated[:110]}{'...' if len(truncated) > 110 else ''}")

        try:
            data = send_message(token, truncated, session_id)
            reply               = data.get("reply", "")
            category            = data.get("category", "")
            should_create       = data.get("should_create_ticket", "")
            validation_failed   = data.get("validation_failed", "")

            print(f"  category={category}  should_create_ticket={should_create}  validation_failed={validation_failed}")
            print(f"  reply: {reply[:130]}{'...' if len(reply) > 130 else ''}")

            results.append({
                "session_id":          session_id,
                "input_text":          truncated,
                "category":            category,
                "reply":               reply,
                "should_create_ticket": should_create,
                "validation_failed":   validation_failed,
                "error":               "",
            })
        except Exception as exc:
            print(f"  ERROR: {exc}")
            results.append({
                "session_id":          session_id,
                "input_text":          truncated,
                "category":            "",
                "reply":               "",
                "should_create_ticket": "",
                "validation_failed":   "",
                "error":               str(exc),
            })

        time.sleep(DELAY_SEC)

    # write results
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)

    errors = sum(1 for r in results if r["error"])
    print(f"\nDone. {len(results)} requests sent, {errors} errors.")
    print(f"Local summary saved to: {OUTPUT_CSV}")

    print("\nSession IDs (cross-check against llama_logs):")
    for r in results:
        print(f"  {r['session_id']}")

    print(
        f"\nNEXT STEP: query llama_logs for these session IDs (or the newest "
        f"{len(results)} rows by timestamp) and compute:"
        "\n  • validation_failed %"
        "\n  • resolution %  (cascade handled without ticket creation)"
        "\n  • false_refusal %  (valid ticket refused)"
        "\n  • escalation %  (should_create_ticket=true)"
        "\n  • hallucination rate  (manual eyeball pass — same rubric as original n=15)"
    )


if __name__ == "__main__":
    main()
