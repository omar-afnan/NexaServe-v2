# Nexa Serve: Intelligent IT Support Platform

## Project Overview

Nexa Serve is a web-based Help Desk Support System designed to help organizations manage IT and customer support requests efficiently. The system combines traditional ticket management with an integrated AI chatbot that provides instant assistance and automatic ticket prioritization.

Users can create and track support tickets, while support staff manage and resolve issues through a centralized dashboard enhanced with machine learning analytics.

---

## Features

### Ticket Management

* Create, view, update, and close support tickets
* Automatic AI-based priority assignment (Low, Medium, High, Critical)
* Ticket status tracking (Open, In Progress, Resolved)
* Staff assignment and workflow management

### AI Chatbot

* Natural language chatbot for common support queries
* Ticket creation through conversational input
* Integrated with AI prioritization model

### Dashboard & Analytics

* Ticket statistics and trends visualization
* Staff workload monitoring
* AI priority distribution analytics

### Notifications

* Alerts for ticket updates
* High-priority issue notifications

---

## Technology Stack

**Frontend**

* React (Vite)

**Backend**

* Node.js (Express)

**Database**

* SQLite

**AI & Machine Learning**

* Python
* ChatterBot
* scikit-learn (Logistic Regression, Random Forest, Linear SVM)

**Testing**

* Jest

---

## Project Structure

```
nexa-serve/
│
├── src/                   React application
├── backend/               Node.js API server
│   ├── Ml_Service/        Machine learning services
│   ├── tests/             Jest tests
│   └── tickets.db         SQLite database
│
├── ChatbotService/        Python chatbot service
└── README.md
```

---

## System Architecture & Ports

| Service           | Command                    | URL                   | Port |
| ----------------- | -------------------------- | --------------------- | ---- |
| Frontend          | npm run dev                | http://localhost:5173 | 5173 |
| Backend API       | node backend/server.js     | http://localhost:5000 | 5000 |
| Chatbot Service   | python ChatBot_Services.py | http://localhost:5005 | 5005 |
| ML Prediction API | python PredictionApi.py    | http://localhost:5006 | 5006 |

---

## Installation & Setup

### Prerequisites

* Node.js (v18 or later)
* Python 3.10+
* npm
* pip
* virtualenv (recommended)

---

### 1. Frontend Setup

```
cd frontend
npm install
npm run dev
```

Runs at:
http://localhost:5173

---

### 2. Backend Setup

Install dependencies (includes SQLite):

```
npm install
```

Then start the server:

```
node backend/server.js
```

Runs at:
http://localhost:5000

---

### 3. Chatbot Service Setup

```
cd ChatbotService
python -m venv venv
venv\Scripts\activate
pip install chatterbot==1.0.4 chatterbot-corpus flask flask-cors nltk
python ChatBot_Services.py
```

Runs at:
http://localhost:5005

---

### 4. Machine Learning Service Setup

```
cd backend/Ml_Service
python -m venv venv
venv\Scripts\activate
pip install -r req.txt
```

Run training first:

```
python TrainModel.py
```

Then start prediction API:

```
python PredictionApi.py
```

Runs at:
http://localhost:5006

---

## Test Accounts

The system includes preconfigured accounts for evaluation.

### Admin

Email: [admin@test.com]
Password: admin123

### Support Operator

Email: [support123@gmail.com]
Password: 123456

### User

Email: [omar@example.com]
Password: omar123

---

## Authentication

Authentication uses JWT Bearer Tokens.

Example endpoint:

```
POST http://localhost:5000/auth/signup
```

Protected routes require a Bearer token in request headers.

---

## Running Tests

```
cd backend
cd tests
npm test
```

Jest is used for backend unit and integration testing.

---

## Database Cleanup (Testing)

To remove test accounts:

```
node CleanUp.js
```

---

## Code Ownership and Provenance

The following components were developed by the author:

* React frontend interface
* Node.js REST API
* Ticket management logic
* Dashboard analytics
* Machine learning prioritization models
* Chatbot integration

Third-party libraries used via official package managers include:

* React
* Express.js
* SQLite
* ChatterBot
* scikit-learn
* Jest

No external source code was directly copied outside standard libraries.

---

## Use of Generative AI

Generative AI tools were used for:

* creating synthetic data for chatterbot class 
* used ai to make read me file

---
## Datasets

Large datasets are not included in this archive.

Training data used for machine learning models can be recreated by running:

```
python TrainModel.py
```
---

## Version Control

This submission includes the full Git repository, including the `.git` folder, to preserve development history and commit progression.

---
"# NexaServe-v2" 
