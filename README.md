backend/
│
├── app/
│ │
│ ├── main.py
│ ├── database.py
│ ├── models.py
│ ├── schemas.py
│ ├── crud.py
│ │
│ ├── api/
│ │ ├── campaign_routes.py
│ │ ├── call_routes.py
│ │ └── analytics_routes.py
│ │
│ ├── services/
│ │ ├── twilio_service.py
│ │ ├── llm_service.py
│ │ └── csv_service.py
│ │
│ └── websocket/
│ └── manager.py
│
├── requirements.txt
├── .env
└── run.py

cd election_ai_voice_mvpOG2/backend
python -m venv venv
source venv/bin/activate # Windows: venv\Scripts\activate
pip install -r requirements.txt
