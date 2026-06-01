# Nexa Serve  AI-Powered IT Help Desk Platform

Nexa Serve is a full-stack help desk system that combines traditional ticket management with a multi-layered AI pipeline. Users raise IT support tickets directly or through a conversational chatbot; behind the scenes, machine-learning models classify each ticket's **category** and **priority**, a local LLM (Llama 3.2 via Ollama) re-checks low-confidence predictions and unhelpful chatbot answers, tickets are auto-assigned to the least-loaded support agent, and an AI "supervisor" periodically reviews agent workloads.

> **Status:** Final-year project. Runs entirely on a local machine — no cloud services required.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Running the Full Stack](#running-the-full-stack)
- [User Roles](#user-roles)
- [API Overview](#api-overview)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Utility Scripts](#utility-scripts)
- [Notes & Provenance](#notes--provenance)

---

## Key Features

### Ticket Management
- Create, view, update, comment on, and close tickets.
- Statuses: **Open → In Progress → Closed**.
- Priorities: **Low, Medium, High, Critical** (ordered in all listings).
- Categories: **Network, Software, Hardware, Password, Email, Other**.
- Role-scoped access — users see only their own tickets; support/admin see all.

### AI Ticket Triage
- **ML classification** (Flask API, port 5006): TF-IDF + scikit-learn models predict category and priority with confidence scores. An optional fine-tuned **mBERT** model provides multilingual classification.
- **Multilingual input**: non-English tickets are auto-detected (`langdetect`) and translated (`deep-translator`) before classification.
- **LLM priority correction**: when ML priority confidence falls below `0.5`, Llama 3.2 (Ollama) re-evaluates the ticket. The chosen source is recorded per ticket (`ml`, `fallback`, or `llama_correction`).

### Conversational Chatbot
- **ChatterBot** service (Flask, port 5005) answers common IT questions.
- The backend **validates ChatterBot replies with Ollama**; weak answers are replaced by an LLM-generated troubleshooting response.
- Detects dissatisfaction ("that didn't help") and escalates to the LLM, then **auto-creates a ticket after two failed attempts**.
- Natural-language ticket creation ("create me a ticket") using full conversation context for category/priority.
- Graceful fallback: if the Python services or Ollama are down, the Node backend uses built-in keyword-based category/priority detection.

### Automation & Oversight
- **Auto-assignment**: new tickets go to the support agent with the fewest open tickets.
- **Priority alerts**: High/Critical tickets notify all support staff and admins.
- **AI Agent Supervisor**: every 30 minutes, an Ollama-driven cycle reviews each agent's workload and flags `normal` / `overloaded` / `underperforming`, logging its reasoning.
- **Audit logs**: every significant action (create, status/priority change, comment, profile/password change, delete) is recorded.

### Dashboards & Analytics
- Separate dashboards for **Admin**, **Support**, and **User** roles.
- Chart.js visualizations: ticket trends, status/priority/category breakdowns, and agent performance.
- Notifications, reports, and audit-log views.

---

## Architecture

```
                         ┌─────────────────────────────┐
                         │   React + Vite Frontend      │
                         │   http://localhost:5173      │
                         └──────────────┬──────────────┘
                                        │ JWT (Bearer)
                                        ▼
                         ┌─────────────────────────────┐
                         │   Node.js / Express API      │
                         │   http://localhost:5000      │
                         │   (SQLite + Redis cache*)    │
                         └───┬───────────┬───────────┬──┘
                             │           │           │
              ┌──────────────┘           │           └──────────────┐
              ▼                          ▼                          ▼
   ┌────────────────────┐   ┌────────────────────────┐   ┌────────────────────┐
   │  ChatterBot (Flask)│   │  ML Prediction (Flask) │   │   Ollama / Llama3.2 │
   │  :5005  /chat      │   │  :5006  /predict       │   │   :11434 (optional) │
   └────────────────────┘   │  TF-IDF + mBERT models │   └────────────────────┘
                            └────────────────────────┘
```

\* Redis is **optional** — the backend falls back to in-memory maps for conversation/session state when Redis is unavailable. Ollama is also optional; without it, ML/keyword results are used directly.

| Service             | Command                                       | URL                     | Port  |
| ------------------- | --------------------------------------------- | ----------------------- | ----- |
| Frontend            | `npm run dev`                                 | http://localhost:5173   | 5173  |
| Backend API         | `node backend/server.js`                      | http://localhost:5000   | 5000  |
| Chatbot Service     | `python ChatBot_Services.py`                  | http://localhost:5005   | 5005  |
| ML Prediction API   | `python PredictionApi.py`                     | http://localhost:5006   | 5006  |
| Ollama (optional)   | `ollama run llama3.2`                         | http://localhost:11434  | 11434 |
| Redis (optional)    | `redis-server`                                | redis://localhost:6379  | 6379  |

---

## Tech Stack

**Frontend** — React 19, Vite 7, React Router 7, Chart.js (`react-chartjs-2`), Lucide / React Icons

**Backend** — Node.js, Express 5, SQLite (`sqlite3`), JWT (`jsonwebtoken`), bcryptjs, ioredis, nanoid

**AI / ML** — Python, Flask, scikit-learn (Logistic Regression, Linear SVM, Random Forest, calibrated probabilities), imbalanced-learn (SMOTE), Hugging Face Transformers + PyTorch (mBERT), ChatterBot, langdetect, deep-translator, and Ollama (Llama 3.2) for LLM correction/validation

**Testing** — Jest + Supertest

---

## Project Structure

```
NEXA-SERVE-V2/
├── index.html                  Vite entry
├── package.json                Frontend + backend (Node) dependencies & scripts
├── vite.config.js
├── src/                        React application
│   ├── api/                    API client + authenticated fetch wrapper
│   ├── components/             Sidebars, chat box, ticket table, charts/
│   ├── pages/                  Admin / Support / User pages + CSS/
│   └── utils/                  Auth helpers
├── backend/                    Node.js / Express API server
│   ├── server.js               Main server (chatbot, tickets, notifications, etc.)
│   ├── app.js                  Slim Express app used by the test suite
│   ├── AuthController.js        Signup / login
│   ├── auth.js                 JWT + role-based authorization middleware
│   ├── database.js             SQLite schema, migrations, seed backfill
│   ├── autoAssign.js           Least-loaded agent assignment
│   ├── priorityCorrection.js   Ollama-based priority re-evaluation
│   ├── agentSupervisor.js      Periodic AI workload supervisor
│   ├── CleanUp.js              Remove test accounts
│   ├── scripts/                DB checks, evaluation & workload-simulation tools
│   ├── tests/                  Jest tests (auth, profile, tickets)
│   └── Ml_Service/             Python ML service
│       ├── TrainModel.py       Train TF-IDF category/priority models
│       ├── TrainMBERT.py       Fine-tune multilingual mBERT classifier
│       ├── PredictionApi.py    Flask /predict endpoint
│       ├── Eval*.py            Evaluation scripts
│       ├── models/             Saved .pkl models + mbert_category/
│       └── req.txt             Python deps for the ML service
└── ChatbotService/             Python ChatterBot service
    ├── ChatBot_Services.py     Flask /chat endpoint
    └── requirements.txt
```

---

## Prerequisites

- **Node.js** v18 or later, with **npm**
- **Python** 3.10 or 3.11 (the bundled virtual environments target 3.11)
- **pip** and `virtualenv` / `venv`
- *(Optional)* **Ollama** with the `llama3.2` model pulled — enables LLM validation, priority correction, and the agent supervisor
- *(Optional)* **Redis** — enables persistent conversation/session caching

---

## Installation & Setup

### 1. Clone & configure environment

```bash
git clone <repo-url>
cd NEXA-SERVE-V2
cp .env.example .env      # then edit .env and set a real JWT_SECRET
```

### 2. Frontend + Node backend dependencies

Both the React app and the Express server share the root `package.json`:

```bash
npm install
```

### 3. ML Prediction service

```bash
cd backend/Ml_Service
python -m venv venv
venv\Scripts\activate          # Windows  (use: source venv/bin/activate on macOS/Linux)
pip install -r req.txt
```

Train the classic ML models (required before first prediction run):

```bash
python TrainModel.py
```

*(Optional)* fine-tune the multilingual mBERT model:

```bash
python TrainMBERT.py
```

### 4. ChatterBot service

```bash
cd ChatbotService
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```





## Running the Full Stack

Open separate terminals (start the Python services first so the backend can reach them):

```bash
# Terminal 1 — ML Prediction API (port 5006)
cd backend/Ml_Service && venv\Scripts\activate && python PredictionApi.py

# Terminal 2 — ChatterBot service (port 5005)
cd ChatbotService && venv\Scripts\activate && python ChatBot_Services.py

# Terminal 3 — Backend API (port 5000)
node backend/server.js

# Terminal 4 — Frontend (port 5173)
npm run dev
```

*(Optional)* start Ollama and Redis in their own terminals to enable LLM correction and persistent caching. Both services degrade gracefully if absent.

Then open **http://localhost:5173**.

---

## User Roles

| Role        | Capabilities                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| **User**    | Create tickets (form or chatbot), view/comment on own tickets, manage profile |
| **Support** | View/manage all tickets, update status & priority, get assigned tickets, view performance |
| **Admin**   | Everything support can do, plus audit logs, LLM logs, supervisor logs, all-user/ticket views |

Authentication uses **JWT Bearer tokens** (9-hour expiry). Protected routes require an `Authorization: Bearer <token>` header; role-restricted routes are enforced by the `authorizeRoles` middleware.

---

## API Overview

Base URL: `http://localhost:5000`

**Auth**
- `POST /auth/signup` — register (`userName`, `userEmail`, `userPassword`, optional `role`)
- `POST /auth/login` — returns a JWT

**Chatbot**
- `POST /chatbot` — conversational endpoint (handles replies, escalation, and ticket creation)

**Tickets**
- `POST /tickets` — create a ticket (runs ML + LLM triage)
- `GET /tickets` — list (scoped by role) · `GET /tickets/me` · `GET /tickets/all` *(admin/support)*
- `PUT /tickets/:id` — update status · `PATCH /tickets/:id` — update status + solution
- `PUT /tickets/:id/priority` — update priority *(admin/support)*
- `DELETE /tickets/:id` — delete (owner or admin/support)
- `POST /tickets/:id/comments` · `GET /tickets/:id/comments`

**Notifications**
- `GET /notifications` · `PUT /notifications/:id/read` · `PUT /notifications/mark-all-read`
- `DELETE /notifications/:id` · `DELETE /notifications/delete-all`

**Users**
- `GET /users/me` · `PUT /users/me` · `PUT /users/me/password`
- `GET /users/all` *(admin)*

**Admin / Oversight**
- `GET /audit-logs` *(admin)* · `GET /llama-logs` *(admin)*
- `GET /supervisor-logs` *(admin/support)* · `POST /supervisor-run` *(admin/support)*

**ML Service** (`http://localhost:5006`)
- `POST /predict` — `{ title, description }` → `{ category, priority, category_confidence, priority_confidence }`

**ChatterBot Service** (`http://localhost:5005`)
- `POST /chat` — `{ message }` → `{ reply, ... }`

---

## Database Schema

SQLite database at `backend/tickets.db` (WAL mode, foreign keys on). Tables are created and migrated automatically on backend startup.

- **users** — `userId`, `name`, `email`, `password` (bcrypt), `role`, `created_at`
- **tickets** — `ticket_id`, `title`, `description`, `category`, `priority`, `status`, `created_by`, `assigned_to`, `solution`, `category_confidence`, `priority_confidence`, `priority_source`, timestamps
- **comments** — threaded comments per ticket
- **notifications** — per-user alerts (`comment`, `priority_alert`, …)
- **llama_logs** — every LLM fallback (trigger reason, resolution, linked ticket)
- **supervisor_logs** — agent workload reviews with `flag` and Ollama reasoning
- **auditLogs** — full action audit trail (user, role, action, IP, user-agent)

---

## Testing

Jest + Supertest cover authentication, profile, and ticket flows against the slim `backend/app.js` server.

```bash
npm test
```

Test files live in `backend/tests/` (`auth.test.js`, `profile.test.js`, `tickets.test.js`).

---

## Utility Scripts

Located in `backend/` and `backend/scripts/` (run with `node <file>` or the ML venv):

- `CleanUp.js` — remove seeded/test accounts
- `scripts/dbCheck.js`, `scripts/checkTicket.js`, `scripts/listTickets.js` — DB inspection
- `scripts/fixRole.js` — repair a user's role
- `scripts/evaluateWorkload.js`, `scripts/evaluateCascade.js` — strategy evaluation
- `Ml_Service/EvalWorkloadSim.py`, `Ml_Service/Eval*.py` — ML and workload-simulation evaluation

---

## Notes & Provenance

- Author-developed: React frontend, Express REST API, ticket/auth logic, dashboards & analytics, ML training and prediction pipeline, chatbot integration, and the LLM/supervisor orchestration.
- Third-party libraries are used via their official package managers (React, Express, SQLite, scikit-learn, Transformers, ChatterBot, Jest, etc.).
- Large training datasets are **not** bundled. The ML models can be recreated by running `TrainModel.py` (and optionally `TrainMBERT.py`) against the included dataset CSV in `backend/Ml_Service/`.
- Generative AI assisted with synthetic chatbot training data and parts of this documentation.
- The full Git history is preserved in this repository.
