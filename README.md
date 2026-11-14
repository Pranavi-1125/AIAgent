backend/
│
├── app/
│ │
│ ├── main.py
│ ├── database.py
│ ├── models.py
│ ├── schemas.py
│ ├── crud.py
│ ├── auth.py
│ │
│ ├── api/
│ │ ├── campaign_routes.py
│ │ ├── call_routes.py
│ │ └── auth_routes.py
│ │
│ ├── services/
│ │ ├── twilio_service.py
│ │ ├── llm_service.py
│ │ ├── campaign_runner.py
│ │ ├── agent_service.py
│ │ └── csv_service.py
│ │
│ └── websocket/
│ └── manager.py
│
├── requirements.txt
├── .env
└── .env.example

frontend/
│
├── src/
│ │
│ ├── api.js
│ ├── App.css
│ ├── App.jsx
│ ├── index.css
│ ├── main.jsx
│ │
│ ├── components/
│ │ ├── Sidebar.jsx
│ │ ├── StatCard.jsx
│ │ └── Topbar.jsx
│ │
│ ├── pages/
│ │ ├── Agent.jsx
│ │ ├── Analytics.jsx
│ │ ├── Calls.jsx
│ │ ├── Campaigns.jsx
│ │ ├── Dashboard.jsx
│ │ └── Settings.jsx
│ │
│ └── data/
│ └── data.js
│
├── .env.example
├── index.html
├── eslint.config.js
├── package-lock.json
├── package.json
├── postcss.config.js
└── tailwind.config.js

# Terminal 1: To run the backend

cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Terminal 2: To the run GROK

cd backend
C:ngrok/ngrok.exe http 8000

# Terminal 3: To run the frontend

cd frontend
npm run dev
