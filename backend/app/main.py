from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import csv
import io

from app.database import engine, get_db
from app.models import Base
from app import crud, schemas

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
# Allows React frontend to talk to backend

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# ROOT
# =============================================================================

@app.get("/")
def root():
    return {
        "message": "Election AI Backend Running"
    }

# =============================================================================
# TEST DATABASE
# =============================================================================

@app.get("/test-db")
def test_db(db: Session = Depends(get_db)):
    return {
        "status": "database connected"
    }

# =============================================================================
# START CAMPAIGN
# =============================================================================

@app.post("/campaign/start")
async def start_campaign(
    campaign_name: str = Form(...),
    description: str = Form(...),
    script: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    1. Create campaign
    2. Read uploaded CSV
    3. Create voters
    4. Return summary
    """

    try:

        # ---------------------------------------------------------------------
        # CREATE CAMPAIGN
        # ---------------------------------------------------------------------

        campaign = crud.create_campaign(
            db=db,
            name=campaign_name,
            script_text=script
        )

        # ---------------------------------------------------------------------
        # READ CSV
        # ---------------------------------------------------------------------

        contents = await file.read()

        decoded = contents.decode("utf-8")

        csv_reader = csv.DictReader(io.StringIO(decoded))

        total_contacts = 0
        created_voters = []

        # ---------------------------------------------------------------------
        # PROCESS ROWS
        # ---------------------------------------------------------------------

        for row in csv_reader:

            name = row.get("name")
            phone = row.get("phone")
            area = row.get("area")

            if not name or not phone:
                continue

            voter = crud.create_voter(
                db=db,
                name=name.strip(),
                phone=str(phone).strip(),
                constituency=area
            )

            created_voters.append(voter)

            total_contacts += 1

        # ---------------------------------------------------------------------
        # START CAMPAIGN STATUS
        # ---------------------------------------------------------------------

        crud.start_campaign(
            db=db,
            campaign_id=campaign.id
        )

        return {
            "success": True,
            "campaign_id": campaign.id,
            "campaign_name": campaign.name,
            "total_contacts": total_contacts,
            "message": "Campaign started successfully"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

# =============================================================================
# GET ALL CAMPAIGNS
# =============================================================================

@app.get("/campaigns")
def get_campaigns(db: Session = Depends(get_db)):

    campaigns = crud.get_all_campaigns(db)

    result = []

    for c in campaigns:

        total_calls = len(c.call_logs)

        completed_calls = len([
            log for log in c.call_logs
            if log.status == "completed"
        ])

        result.append({
            "id": c.id,
            "name": c.name,
            "status": c.status,
            "total": total_calls,
            "completed": completed_calls,
            "date": c.created_at.strftime("%Y-%m-%d")
            if c.created_at else "N/A"
        })

    return result

# =============================================================================
# DASHBOARD SUMMARY
# =============================================================================

@app.get("/dashboard/summary")
def dashboard_summary(
    campaign_id: int = None,
    db: Session = Depends(get_db)
):

    summary = crud.get_dashboard_summary(
        db=db,
        campaign_id=campaign_id
    )

    return summary

# =============================================================================
# GET CALL LOGS
# =============================================================================

@app.get("/calls")
def get_calls(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):

    calls = crud.get_all_calls(
        db=db,
        skip=skip,
        limit=limit
    )

    result = []

    for call in calls:

        result.append({
            "id": call.id,
            "voter_name": call.voter.name if call.voter else None,
            "phone": call.voter.phone if call.voter else None,
            "campaign": call.campaign.name if call.campaign else None,
            "status": call.status,
            "duration_sec": call.duration_sec,
            "created_at": call.created_at
        })

    return result

# =============================================================================
# PAUSE CAMPAIGN
# =============================================================================

@app.post("/campaign/pause")
def pause_campaign():
    return {
        "success": True,
        "message": "Campaign paused"
    }

# =============================================================================
# RESUME CAMPAIGN
# =============================================================================

@app.post("/campaign/resume")
def resume_campaign():
    return {
        "success": True,
        "message": "Campaign resumed"
    }

# =============================================================================
# STOP CAMPAIGN
# =============================================================================

@app.post("/campaign/stop")
def stop_campaign():
    return {
        "success": True,
        "message": "Campaign stopped"
    }