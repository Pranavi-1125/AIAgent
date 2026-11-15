import csv
import io
import json
import os
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import engine, get_db, SessionLocal
from app.models import Base, UserSettings, Voter, Campaign, CallLog, AnalysisResult, ContactStatus, CampaignStatus, User
from app import crud, schemas
from app.api import call_routes
from app.websocket.manager import manager
from app.api.auth_routes import router as auth_router
from app.auth import get_current_user
from app.schemas import SettingsSave

# =============================================================================
# CREATE DATABASE TABLES
# =============================================================================

Base.metadata.create_all(bind=engine)

# =============================================================================
# FASTAPI APP
# =============================================================================

app = FastAPI(
    title="Election AI Backend",
    version="1.0.0"
)

# =============================================================================
# CORS
# =============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://localhost:5174"
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Calls API Router
app.include_router(call_routes.router, prefix="/calls", tags=["Calls"])

# =============================================================================
# ROOT & SYSTEM HEALTH
# =============================================================================

@app.get("/")
def root():
    return {
        "message": "Election AI Backend Running"
    }


@app.get("/test-db")
def test_db(db: Session = Depends(get_db)):
    return {
        "status": "database connected"
    }

# =============================================================================
# WEBSOCKET
# =============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket, "default")

    page = "default"

    try:
        while True:
            message = await websocket.receive_text()

            if message == "ping":
                continue

            try:
                data = json.loads(message)

                if "page" in data:
                    page = data["page"]
                    manager.update_page(websocket, page)
                    continue

            except:
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket)

    except Exception:
        manager.disconnect(websocket)

# =============================================================================
# START CAMPAIGN
# =============================================================================

from app.api.campaign_routes import router as campaign_router

app.include_router(
    campaign_router,
    prefix="/campaigns",
    tags=["Campaigns"]
)

# =============================================================================
# GET ALL CAMPAIGNS
# =============================================================================

@app.get("/campaigns")
def get_campaigns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    campaigns = db.query(Campaign).filter(
        Campaign.user_id == current_user.id
    ).all()

    result = []

    for c in campaigns:
        total = len(c.voters)
        completed = len([v for v in c.voters if v.status == ContactStatus.completed])
        failed = len([v for v in c.voters if v.status != ContactStatus.completed])

        result.append({
            "id": c.id,
            "name": c.name,
            "status": c.status,
            "date": c.created_at,
            "total": total,
            "completed": completed,
            "failed": failed
        })

    return result


# @app.get("/campaigns")
# def get_campaigns(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_user)
# ):
#     campaigns = db.query(Campaign).filter(
#     Campaign.user_id == current_user.id
# ).all()
#     result = []

#     for c in campaigns:
#         total_calls = len(c.call_logs)
#         completed_calls = len([
#             log for log in c.call_logs
#             if log.status == "completed"
#         ])

#         result.append({
#             "id": c.id,
#             "name": c.name,
#             "status": c.status.value if hasattr(c.status, "value") else c.status,
#             "total": total_calls,
#             "completed": completed_calls,
#             "date": c.created_at.strftime("%Y-%m-%d") if c.created_at else "N/A"
#         })

#     return result

# =============================================================================
# CAMPAIGN CONTROLS
# =============================================================================

@app.post("/campaign/pause")
def pause_campaign(db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.status == CampaignStatus.running).first()
    if campaign:
        campaign.status = CampaignStatus.paused
        db.commit()
    return {
        "success": True,
        "message": "Campaign paused"
    }


@app.post("/campaign/resume")
def resume_campaign(db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.status == CampaignStatus.paused).first()
    if campaign:
        campaign.status = CampaignStatus.running
        db.commit()

        # Trigger sequence dialing of next pending voter
        next_voter = crud.get_next_pending_voter(db, campaign.id)
        if next_voter:
            import asyncio
            async def trigger_dialing():
                db_dial = SessionLocal()
                try:
                    await call_routes.start_campaign_calls(campaign_id=campaign.id, db=db_dial)
                finally:
                    db_dial.close()
            asyncio.create_task(trigger_dialing())

    return {
        "success": True,
        "message": "Campaign resumed"
    }


@app.post("/campaign/stop")
def stop_campaign(db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.status.in_([CampaignStatus.running, CampaignStatus.paused])).first()
    if campaign:
        campaign.status = CampaignStatus.cancelled
        campaign.ended_at = datetime.utcnow()
        db.commit()
    return {
        "success": True,
        "message": "Campaign stopped"
    }

# =============================================================================
# SETTINGS API
# =============================================================================

@app.get("/settings")
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == current_user.id
    ).first()

    if not settings:
        return {
            "twilio": {
                "sid": "",
                "token": "",
                "phone": ""
            },
            "groq": {
                "key": "",
                "model": "llama-3.3-70b-versatile"
            },
            "script": ""
        }

    return {
    "twilio": {
        "sid": "",
        "token": "",
        "phone": settings.twilio_phone
    },
    "groq": {
        "key": "",
        "model": settings.groq_model
    },
    "script": settings.default_script,
    "voice": settings.voice
}


@app.post("/settings/save")
def save_settings(
    payload: schemas.SettingsSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == current_user.id
    ).first()

    if not settings:
        settings = UserSettings(
            user_id=current_user.id
        )
        db.add(settings)

    if payload.twilio_sid:
        settings.twilio_sid = payload.twilio_sid

    if payload.twilio_token:
        settings.twilio_token = payload.twilio_token

    if payload.twilio_phone:
        settings.twilio_phone = payload.twilio_phone

    if payload.groq_key:
        settings.groq_key = payload.groq_key

    if payload.groq_model:
        settings.groq_model = payload.groq_model

    settings.default_script = payload.script
    settings.voice = payload.voice

    db.commit()

    return {
        "success": True,
        "message": "Settings saved successfully"
    }


@app.post("/settings/test-twilio")
def test_twilio():
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    if not sid or not token or "AC" not in sid:
        return {"ok": False, "error": "Invalid/Empty Twilio settings"}
    try:
        from twilio.rest import Client
        c = Client(sid, token)
        c.api.v2010.accounts(sid).fetch()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/settings/test-groq")
def test_groq():
    key = os.getenv("GROQ_API_KEY")
    if not key or "gsk" not in key:
        return {"ok": False, "error": "Invalid/Empty Groq API key"}
    try:
        from groq import Groq
        c = Groq(api_key=key)
        c.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            messages=[{"role": "user", "content": "hello"}],
            max_tokens=5
        )
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/dashboard/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total = db.query(CallLog).join(Campaign).filter(
    Campaign.user_id == current_user.id
).count()
    completed = db.query(CallLog).join(Campaign).filter(
    Campaign.user_id == current_user.id,
    CallLog.status == "completed"
).count()
    connect_rate = f"{round((completed / total * 100), 1)}%" if total > 0 else "0%"
    active = db.query(Campaign).filter(
        Campaign.user_id == current_user.id
    ).count()
    
    avg_dur = db.query(func.avg(CallLog.duration_sec))\
.join(Campaign)\
.filter(
    Campaign.user_id == current_user.id,
        CallLog.status == "completed", CallLog.duration_sec.isnot(None)
    ).scalar() or 0
    
    minutes = int(avg_dur // 60)
    seconds = int(avg_dur % 60)
    
    return {
        "total_calls": total,
        "connect_rate": connect_rate,
        "active_campaigns": active,
        "answered_calls": completed,
        "avg_duration": f"{minutes}m {seconds}s"
    }


@app.get("/dashboard/sentiment")
def get_dashboard_sentiment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rows = (
        db.query(
            AnalysisResult.sentiment,
            func.count(AnalysisResult.id).label("count")
        )
        .join(CallLog, AnalysisResult.call_id == CallLog.id)
        .join(Campaign, CallLog.campaign_id == Campaign.id)
        .filter(Campaign.user_id == current_user.id)
        .group_by(AnalysisResult.sentiment)
        .all()
    )

    print("ROWS =", rows)

    total = sum(r.count for r in rows)

    buckets = {
        "Positive": 0,
        "Neutral": 0,
        "Negative": 0
    }

    for r in rows:
        if r.sentiment in buckets:
            buckets[r.sentiment] = r.count

    if total == 0:
        return [
            {"name": "Supporters", "value": 0},
            {"name": "Neutral", "value": 0},
            {"name": "Opposed", "value": 0}
        ]

    return [
        {
            "name": "Supporters",
            "value": round(buckets["Positive"] / total * 100)
        },
        {
            "name": "Neutral",
            "value": round(buckets["Neutral"] / total * 100)
        },
        {
            "name": "Opposed",
            "value": round(buckets["Negative"] / total * 100)
        }
    ]


@app.get("/dashboard/issues")
def get_dashboard_issues(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rows = (
        db.query(AnalysisResult.issues_json)
        .join(CallLog, AnalysisResult.call_id == CallLog.id)
        .join(Campaign, CallLog.campaign_id == Campaign.id)
        .filter(Campaign.user_id == current_user.id)
        .all()
    )
    issues = {}
    for (iss_list,) in rows:
        if iss_list and isinstance(iss_list, list):
            for issue in iss_list:
                issues[issue] = issues.get(issue, 0) + 1
                
    sorted_iss = sorted(
        [{"name": k, "value": v} for k, v in issues.items() if k != "None"],
        key=lambda x: x["value"],
        reverse=True
    )[:5]
    return sorted_iss


@app.get("/dashboard/recent-calls")
def get_dashboard_recent_calls(
    limit: int = 4,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    calls = db.query(CallLog)\
.join(Campaign)\
.filter(Campaign.user_id == current_user.id)\
.order_by(CallLog.created_at.desc())\
.limit(limit)\
.all()
    result = []
    
    for c in calls:
        sentiment = c.analysis.sentiment if c.analysis else "Neutral"
        dt = c.created_at
        now = datetime.now(timezone.utc)
        diff = now - dt
        
        if diff.total_seconds() < 60:
            date_str = "just now"
        elif diff.total_seconds() < 3600:
            date_str = f"{int(diff.total_seconds() // 60)}m ago"
        elif diff.total_seconds() < 86400:
            date_str = f"{int(diff.total_seconds() // 3600)}h ago"
        else:
            date_str = dt.strftime("%b %d")
            
        result.append({
            "id": c.id,
            "name": c.voter.name if c.voter else "Unknown",
            "status": "Completed" if c.status == "completed" else "No Answer" if c.status in ("no-answer", "no_answer") else "Busy" if c.status == "busy" else "Failed" if c.status == "failed" else "Initiated",
            "sentiment": sentiment,
            "date": date_str
        })
        
    return result

# =============================================================================
# ANALYTICS ENDPOINTS
# =============================================================================

@app.get("/analytics/stats")
def get_analytics_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    print("CURRENT USER =", current_user)
    total = db.query(AnalysisResult)\
.join(CallLog)\
.join(Campaign)\
.filter(Campaign.user_id == current_user.id)\
.count()
    if total == 0:
        return {
            "supporters_pct": "0%",
            "neutral_pct": "0%",
            "opposed_pct": "0%",
            "avg_confidence": 0.0
        }
        
    supporters = (
        db.query(AnalysisResult)
        .join(CallLog)
        .join(Campaign)
        .filter(
            Campaign.user_id == current_user.id,
            AnalysisResult.sentiment == "Positive"
        )
        .count()
    )

    neutral = (
        db.query(AnalysisResult)
        .join(CallLog)
        .join(Campaign)
        .filter(
            Campaign.user_id == current_user.id,
            AnalysisResult.sentiment == "Neutral"
        )
        .count()
    )

    opposed = (
        db.query(AnalysisResult)
        .join(CallLog)
        .join(Campaign)
        .filter(
            Campaign.user_id == current_user.id,
            AnalysisResult.sentiment == "Negative"
        )
        .count()
    )

    avg_conf = (
        db.query(func.avg(AnalysisResult.confidence))
        .join(CallLog)
        .join(Campaign)
        .filter(Campaign.user_id == current_user.id)
        .scalar()
        or 0.0
    )
    print(
    db.query(
        AnalysisResult.sentiment,
        func.count(AnalysisResult.id)
    )
    .group_by(AnalysisResult.sentiment)
    .all()
)
    
    return {
        "supporters_pct": f"{int(round(supporters / total * 100))}%",
        "neutral_pct": f"{int(round(neutral / total * 100))}%",
        "opposed_pct": f"{int(round(opposed / total * 100))}%",
        "avg_confidence": round(float(avg_conf), 2)
    }


@app.get("/analytics/sentiment")
def get_analytics_sentiment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return get_dashboard_sentiment(db, current_user)


@app.get("/analytics/intent")
def get_analytics_intent(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rows = (
        db.query(
            AnalysisResult.intent,
            func.count(AnalysisResult.id).label("count")
        )
        .join(CallLog, AnalysisResult.call_id == CallLog.id)
        .join(Campaign, CallLog.campaign_id == Campaign.id)
        .filter(Campaign.user_id == current_user.id)
        .group_by(AnalysisResult.intent)
        .all()
    )
    
    total = sum([r.count for r in rows])
    buckets = {"Support": 0, "Complaint": 0, "Query": 0, "Undecided": 0}
    for r in rows:
        if r.intent in buckets:
            buckets[r.intent] = r.count
            
    if total == 0:
        return [
            {"name": "Support", "value": 0},
            {"name": "Complaint", "value": 0},
            {"name": "Query", "value": 0},
            {"name": "Other", "value": 0}
        ]
        
    return [
        {"name": "Support", "value": int(round(buckets["Support"] / total * 100))},
        {"name": "Complaint", "value": int(round(buckets["Complaint"] / total * 100))},
        {"name": "Query", "value": int(round(buckets["Query"] / total * 100))},
        {"name": "Other", "value": int(round(buckets["Undecided"] / total * 100))}
    ]


@app.get("/analytics/issues")
def get_analytics_issues(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return get_dashboard_issues(db, current_user)


@app.get("/analytics/trends")
def get_analytics_trends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    result = []

    for i, d in enumerate(days):
        result.append({
            "day": d,
            "calls": (
                db.query(CallLog)
                .join(Campaign)
                .filter(
                    Campaign.user_id == current_user.id,
                    func.extract('dow', CallLog.created_at) == (i + 1) % 7
                )
                .count()
            ),
            "completed": (
                db.query(CallLog)
                .join(Campaign)
                .filter(
                    Campaign.user_id == current_user.id,
                    CallLog.status == "completed",
                    func.extract('dow', CallLog.created_at) == (i + 1) % 7
                )
                .count()
            )
        })

    return result

# =============================================================================
# EXPORTS
# =============================================================================

@app.get("/calls/export/csv")
def export_calls_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    calls = (
        db.query(CallLog)
        .join(Campaign)
        .filter(Campaign.user_id == current_user.id)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Call ID", "Voter Name", "Phone", "Campaign", "Status", "Duration (Sec)", "Sentiment", "Summary", "Transcript"])

    for c in calls:
        anal = c.analysis
        writer.writerow([
            c.id,
            c.voter.name if c.voter else "",
            c.voter.phone if c.voter else "",
            c.campaign.name if c.campaign else "",
            c.status or "",
            c.duration_sec or 0,
            anal.sentiment if anal else "-",
            anal.summary if anal else "",
            c.full_transcript or ""
        ])

    output.seek(0)
    return StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=calls_export.csv"}
    )

# =============================================================================
# CALL HISTORY LIST
# =============================================================================

@app.get("/calls")
def get_calls(
    search: str = None,
    status: str = None,
    sentiment: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(CallLog)\
.join(Campaign)\
.filter(Campaign.user_id == current_user.id)
    
    if search:
        query = query.join(Voter).filter(Voter.name.ilike(f"%{search}%"))
        
    if status and status != "All":
        status_map = {
            "Completed": "completed",
            "Busy": "busy",
            "No Answer": "no-answer",
            "Failed": "failed"
        }
        db_status = status_map.get(status, status.lower())
        query = query.filter(CallLog.status == db_status)
        
    if sentiment and sentiment != "All":
        query = query.join(AnalysisResult).filter(AnalysisResult.sentiment == sentiment)
        
    calls = query.order_by(CallLog.created_at.desc()).offset(skip).limit(limit).all()
    result = []
    
    for c in calls:
        anal = c.analysis
        dur = "0m 0s"
        if c.duration_sec:
            dur = f"{c.duration_sec // 60}m {c.duration_sec % 60}s"
            
        result.append({
            "id": c.id,
            "name": c.voter.name if c.voter else "Unknown",
            "phone": c.voter.phone if c.voter else "",
            "campaign": c.campaign.name if c.campaign else "",
            "status": "Completed" if c.status == "completed" else "No Answer" if c.status in ("no-answer", "no_answer") else "Busy" if c.status == "busy" else "Failed" if c.status == "failed" else "Initiated",
            "sentiment": anal.sentiment if anal else "-",
            "intent": anal.intent if anal else "-",
            "issue": (anal.issues_json[0] if anal.issues_json else "None") if (anal and anal.issues_json) else "-",
            "duration": dur,
            "date": c.created_at.strftime("%d %b %Y %H:%M") if c.created_at else "N/A",
            "transcript": c.full_transcript or "",
            "confidence": anal.confidence if anal else None,
            "twilio_sid": c.twilio_sid or "",
            "ai_response": c.interactions[-1].text if (c.interactions and c.interactions[-1].speaker == "agent") else None
        })
        
    return result

app.include_router(
    auth_router,
    prefix="/auth",
    tags=["Authentication"]
)