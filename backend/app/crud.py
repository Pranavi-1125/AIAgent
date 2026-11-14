# =============================================================================
# crud.py — All Database Read/Write Operations
# Owner: Pranavi
# =============================================================================
# CRUD = Create, Read, Update, Delete
# This file is the ONLY place we touch the database.
# FastAPI routes call functions from here — they never write SQL directly.
# This keeps things clean: if the DB logic changes, we change it here only.
#
# Every function takes `db: Session` as the first argument.
# `db` is injected by FastAPI's Depends(get_db) — we never create sessions here.
# =============================================================================
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional, List
import datetime

from app.models import CampaignStatus, Voter, Campaign, CallLog, Interaction, AnalysisResult, ContactStatus
from app.models import User
from app.auth import hash_password


# =============================================================================
# VOTER CRUD
# =============================================================================

def create_voter(db: Session, name: str, phone: str, constituency: str = None,
                 ward: str = None, segment: str = None, consent: bool = True) -> Voter:
    """
    Create a new voter record.
    Called when the admin uploads a CSV — we loop through each row and call this.
    If a voter with the same phone already exists, we skip (no duplicates).
    """
    # Check if voter already exists (phone is unique)
    existing = db.query(Voter).filter(Voter.phone == phone).first()
    if existing:
        return existing  # Return existing record, don't duplicate

    voter = Voter(
        name=name,
        phone=phone,
        constituency=constituency,
        ward=ward,
        segment=segment,
        consent=consent,
        status=ContactStatus.pending  # Always starts as pending
    )
    db.add(voter)         # Stage the INSERT
    db.commit()           # Execute the INSERT in the DB
    db.refresh(voter)     # Reload from DB so voter.id is populated
    return voter


def get_next_pending_voter(db: Session, campaign_id: int) -> Optional[Voter]:
    """
    Get the next voter who hasn't been called yet in this campaign.
    FastAPI calls this to pick who to call next in the calling loop.

    Logic: find voters with status=pending who don't already have a call_log
    entry for this specific campaign.
    """
    # Subquery: voter IDs that already have a call attempt in this campaign
    already_called = select(CallLog.voter_id).where(
        CallLog.campaign_id == campaign_id
    )
    # Find first pending voter not in the already_called list
    voter = db.query(Voter).filter(
        Voter.campaign_id == campaign_id,
        Voter.status == ContactStatus.pending,
        Voter.consent == True,
        ~Voter.id.in_(already_called)  # ~ means NOT IN
    ).first()

    return voter  # Returns None if all voters have been called


def update_voter_status(db: Session, voter_id: int, status: ContactStatus) -> Voter:
    """
    Update a voter's status after a call attempt.
    Called after the call ends with the outcome: completed, no_answer, busy, etc.
    """
    voter = db.query(Voter).filter(Voter.id == voter_id).first()
    if not voter:
        raise ValueError(f"Voter {voter_id} not found")

    voter.status = status
    db.commit()
    db.refresh(voter)
    return voter


def get_voter_by_phone(db: Session, phone: str) -> Optional[Voter]:
    """Look up a voter by phone number. Used during Twilio webhook processing."""
    return db.query(Voter).filter(Voter.phone == phone).first()


def get_voters_for_campaign(db: Session, campaign_id: int) -> List[Voter]:
    """Get all voters who have been called in a campaign (for reporting)."""
    return db.query(Voter).join(CallLog).filter(
        CallLog.campaign_id == campaign_id
    ).all()


# =============================================================================
# CAMPAIGN CRUD
# =============================================================================

def create_campaign(db: Session, name: str, script_text: str,
                    language: str = "hi-IN", created_by: str = None) -> Campaign:
    """
    Create a new campaign record.
    Called when admin clicks "Start Campaign" in the React dashboard.
    """
    campaign = Campaign(
        name=name,
        script_text=script_text,
        language=language,
        created_by=created_by
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


def start_campaign(db: Session, campaign_id: int) -> Campaign:
    """Mark campaign as running and record start time."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise ValueError(f"Campaign {campaign_id} not found")

    campaign.status = CampaignStatus.running
    campaign.started_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(campaign)
    return campaign


def end_campaign(db: Session, campaign_id: int) -> Campaign:
    """Mark campaign as completed and record end time."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise ValueError(f"Campaign {campaign_id} not found")

    campaign.status = CampaignStatus.completed
    campaign.ended_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(campaign)
    return campaign


def get_campaign(db: Session, campaign_id: int) -> Optional[Campaign]:
    return db.query(Campaign).filter(Campaign.id == campaign_id).first()


def get_all_campaigns(db: Session) -> List[Campaign]:
    return db.query(Campaign).order_by(desc(Campaign.created_at)).all()


# =============================================================================
# CALL LOG CRUD
# =============================================================================

def create_call_log(db: Session, voter_id: int, campaign_id: int,
                    twilio_sid: str = None) -> CallLog:
    """
    Create a call log entry as soon as Twilio initiates the call.
    We create it immediately so we can track the call from the start.
    twilio_sid is Twilio's unique call ID — we get it from Twilio's API response.
    """
    call_log = CallLog(
        voter_id=voter_id,
        campaign_id=campaign_id,
        twilio_sid=twilio_sid,
        status="initiated",
        started_at=datetime.datetime.utcnow()
    )
    db.add(call_log)
    db.commit()
    db.refresh(call_log)
    return call_log


def update_call_log(db: Session, call_id: int, status: str = None,
                    duration_sec: int = None, recording_url: str = None,
                    ended_at: datetime.datetime = None) -> CallLog:
    """
    Update a call log when the call ends.
    Twilio sends a webhook (POST /webhook/call-status) with the final
    status and duration — we update the record here.
    """
    call_log = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not call_log:
        raise ValueError(f"CallLog {call_id} not found")

    if status:
        call_log.status = status
    if duration_sec is not None:
        call_log.duration_sec = duration_sec
    if recording_url:
        call_log.recording_url = recording_url
    if ended_at:
        call_log.ended_at = ended_at
    else:
        call_log.ended_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(call_log)
    return call_log


def get_call_log_by_twilio_sid(db: Session, twilio_sid: str) -> Optional[CallLog]:
    """
    Look up a call by Twilio's SID.
    When Twilio sends a webhook, it includes the CallSid.
    We use this to find the matching call_log record.
    This is the most common lookup during a live call.
    """
    return db.query(CallLog).filter(CallLog.twilio_sid == twilio_sid).first()


def get_call_log(db: Session, call_id: int) -> Optional[CallLog]:
    return db.query(CallLog).filter(CallLog.id == call_id).first()


def get_all_calls(db: Session, skip: int = 0, limit: int = 50) -> List[CallLog]:
    """
    Paginated list of all calls — used by the React call logs table.
    skip=0, limit=50 means first page. skip=50, limit=50 means second page.
    Orders by most recent first (desc = descending).
    """
    return db.query(CallLog).order_by(
        desc(CallLog.created_at)
    ).offset(skip).limit(limit).all()


# =============================================================================
# INTERACTION CRUD
# =============================================================================

def save_interaction(db: Session, call_id: int, turn_number: int,
                     speaker: str, text: str, audio_url: str = None) -> Interaction:
    """
    Save one turn of the conversation.
    Called after every voter speech (after STT) and after every agent response.
    speaker must be "agent" or "voter".
    turn_number is the sequence: 1=agent opening, 2=voter reply, 3=agent response, etc.
    """
    if speaker not in ("agent", "voter"):
        raise ValueError(f"speaker must be 'agent' or 'voter', got '{speaker}'")

    interaction = Interaction(
        call_id=call_id,
        turn_number=turn_number,
        speaker=speaker,
        text=text,
        audio_url=audio_url
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction


def get_conversation(db: Session, call_id: int) -> List[Interaction]:
    """
    Get full conversation transcript for a call, in order.
    Used to build conversation history for the LLM context window.
    """
    return db.query(Interaction).filter(
        Interaction.call_id == call_id
    ).order_by(Interaction.turn_number).all()


# =============================================================================
# ANALYSIS RESULT CRUD
# =============================================================================

def save_analysis(db: Session, call_id: int, sentiment: str, intent: str,
                  issues: list, confidence: float, summary: str,
                  raw_json: dict = None) -> AnalysisResult:
    """
    Save the LLM analysis result after Sahithi's Groq prompt returns JSON.
    Called by FastAPI after analyze_with_llm() returns.
    issues is a Python list like ["Roads", "Water"] — stored as JSON in DB.
    """
    # If analysis already exists for this call, update it (idempotent)
    existing = db.query(AnalysisResult).filter(
        AnalysisResult.call_id == call_id
    ).first()

    if existing:
        existing.sentiment  = sentiment
        existing.intent     = intent
        existing.issues_json = issues
        existing.confidence = confidence
        existing.summary    = summary
        existing.raw_json   = raw_json
        db.commit()
        db.refresh(existing)
        return existing

    analysis = AnalysisResult(
        call_id=call_id,
        sentiment=sentiment,
        intent=intent,
        issues_json=issues,
        confidence=confidence,
        summary=summary,
        raw_json=raw_json
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


# =============================================================================
# DASHBOARD ANALYTICS QUERIES
# =============================================================================

def get_dashboard_summary(db: Session, campaign_id: int = None) -> dict:
    """
    Compute the aggregated stats shown on the React dashboard.
    Optionally filter by campaign_id. If None, returns stats across all campaigns.

    Returns a dict matching the API contract in the project guide:
    {
        "total_calls": 247,
        "answered_calls": 189,
        "answer_rate": 76.5,
        "avg_duration_sec": 84,
        "sentiment": {"Supporter": 112, "Neutral": 54, "Opposed": 23},
        "top_issues": [{"issue": "Roads", "count": 67}, ...]
    }
    """
    # Base query — optionally scoped to a campaign
    call_query = db.query(CallLog)
    if campaign_id:
        call_query = call_query.filter(CallLog.campaign_id == campaign_id)

    total_calls    = call_query.count()
    answered_calls = call_query.filter(CallLog.status == "completed").count()
    answer_rate    = round((answered_calls / total_calls * 100), 1) if total_calls > 0 else 0.0

    # Average duration (only for completed calls with a recorded duration)
    avg_duration = db.query(func.avg(CallLog.duration_sec)).filter(
        CallLog.status == "completed",
        CallLog.duration_sec.isnot(None)
    )
    if campaign_id:
        avg_duration = avg_duration.filter(CallLog.campaign_id == campaign_id)
    avg_duration_sec = int(avg_duration.scalar() or 0)

    # Sentiment distribution from analysis_results
    sentiment_query = db.query(
        AnalysisResult.sentiment,
        func.count(AnalysisResult.id).label("count")
    ).join(CallLog)
    if campaign_id:
        sentiment_query = sentiment_query.filter(CallLog.campaign_id == campaign_id)
    sentiment_rows = sentiment_query.group_by(AnalysisResult.sentiment).all()
    sentiment = {row.sentiment: row.count for row in sentiment_rows if row.sentiment}

    # Top issues — flatten JSON arrays and count each issue
    # Note: this requires PostgreSQL's JSON functions
    # We do it in Python here for simplicity (fine for <10k rows)
    analysis_rows = db.query(AnalysisResult.issues_json).join(CallLog)
    if campaign_id:
        analysis_rows = analysis_rows.filter(CallLog.campaign_id == campaign_id)

    issue_counts = {}
    for (issues_json,) in analysis_rows.all():
        if issues_json and isinstance(issues_json, list):
            for issue in issues_json:
                issue_counts[issue] = issue_counts.get(issue, 0) + 1

    top_issues = sorted(
        [{"issue": k, "count": v} for k, v in issue_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:10]  # top 10

    return {
        "total_calls":      total_calls,
        "answered_calls":   answered_calls,
        "answer_rate":      answer_rate,
        "avg_duration_sec": avg_duration_sec,
        "sentiment":        sentiment,
        "top_issues":       top_issues
    }



def create_user(
    db,
    name: str,
    email: str,
    password: str
):

    user = User(
        name=name,
        email=email,
        hashed_password=password
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user

def get_user_by_email(
    db,
    email: str
):
    return (
        db.query(User)
        .filter(User.email == email)
        .first()
    )