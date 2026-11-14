# =============================================================================
# models.py — All 5 Database Tables (SQLAlchemy Models)
# Owner: Pranavi
# =============================================================================
# WHY THIS FILE EXISTS:
# Instead of writing raw SQL like "CREATE TABLE voters (...)", we define
# Python classes. SQLAlchemy reads these classes and creates the actual
# tables in PostgreSQL automatically. It also maps DB rows to Python objects
# so we can do voter.name instead of row[1].
#
# Each class = one table.
# Each Column() = one column in that table.
# Relationships let us do call_log.voter to get the voter object directly.
# =============================================================================

from groq import BaseModel
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Float,
    Boolean, ForeignKey, JSON, Enum as SAEnum, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey
from sqlalchemy.sql import func
import enum

from app.database import Base


# =============================================================================
# ENUM: Contact Status
# =============================================================================
# Using Python's enum + SQLAlchemy's Enum type creates a PostgreSQL ENUM
# column — the DB enforces that only these exact values can be stored.
# This prevents typos like "Completed" vs "completed" from slipping in.
class ContactStatus(str, enum.Enum):
    pending            = "pending"            # Not called yet (default)
    called             = "called"
    in_progress = "in_progress"
    completed          = "completed"          # Call connected and finished
    no_answer          = "no_answer"          # Phone rang, nobody picked up
    busy               = "busy"              # Line was busy
    not_interested     = "not_interested"     # Voter asked not to be called again
    callback_scheduled = "callback_scheduled" # Voter asked for a callback
    failed             = "failed"             # Technical error, call couldn't be placed


class CampaignStatus(str, enum.Enum):
    draft     = "draft"      # Created but not started yet
    running   = "running"    # Currently calling voters
    paused    = "paused"     # Temporarily stopped
    completed = "completed"  # All voters processed
    cancelled = "cancelled"  # Manually stopped

class SpeakerType(str, enum.Enum):
    agent = "agent"
    voter = "voter"


# =============================================================================
# TABLE 1: voters (called "users" in the DB to match the guide)
# =============================================================================
# Stores every voter contact that can be called.
# One row = one voter. Uploaded via CSV from the React dashboard.
# The `status` field tracks the outcome of our call attempts.
class Voter(Base):
    __tablename__ = "users"   # actual PostgreSQL table name

    # Primary key — auto-increments, unique identifier for every voter
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(
    Integer,
    ForeignKey("campaigns.id"),
    nullable=True,
    index=True
    )
    # Basic contact info
    name          = Column(String(200), nullable=False)
    phone         = Column(String(20),nullable=False, index=True)
    # unique=True: no two voters can share a phone number
    # index=True: makes lookups by phone fast

    # Geographic segmentation — used for targeting specific areas
    constituency  = Column(String(200), nullable=True)
    ward          = Column(String(200), nullable=True)
    segment       = Column(String(100), nullable=True)  # e.g. "Youth", "Senior", "Urban"

    # Consent tracking — important for compliance
    # True = voter has given consent to be called
    consent       = Column(Boolean, default=True, nullable=False)

    # Call outcome status — updated after every call attempt
    # Default is "pending" (not called yet)
    status        = Column(
        SAEnum(ContactStatus, name="contact_status_enum"),
        default=ContactStatus.pending,
        nullable=False
    )

    # Metadata
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
)

    # -------------------------------------------------------------------------
    # RELATIONSHIPS
    # This tells SQLAlchemy that a Voter can have MANY CallLogs.
    # After loading a voter, you can do: voter.call_logs → list of CallLog objects
    # back_populates="voter" means CallLog also has a .voter relationship pointing back.
    call_logs = relationship("CallLog", back_populates="voter", lazy="select")
    campaign = relationship("Campaign", back_populates="voters")

    def __repr__(self):
        return f"<Voter id={self.id} name={self.name} phone={self.phone} status={self.status}>"


# =============================================================================
# TABLE 2: campaigns
# =============================================================================
# One campaign = one batch of calls with a shared script and goal.
# Example: "Constituency 4 — April Drive"
# The script_text is what the AI agent says as its opening message.
class Campaign(Base):
    __tablename__ = "campaigns"

    __table_args__ = (
    Index("idx_campaign_status", "status"),
    )

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column( Integer, ForeignKey("admin_users.id") )
    
    name        = Column(String(300), nullable=False)

    # The opening script the AI says when the voter picks up.
    # Example: "Hello! I'm calling on behalf of candidate Ramesh Naidu..."
    script_text = Column(Text, nullable=False)

    # Optional: language for TTS ("hi-IN" for Hindi, "te-IN" for Telugu, etc.)
    language    = Column(String(20), default="hi-IN")

    # Timestamps for when the campaign ran
    started_at  = Column(DateTime(timezone=True), nullable=True)
    ended_at    = Column(DateTime(timezone=True), nullable=True)

    # Running status
    status      = Column(
        SAEnum(CampaignStatus, name="campaign_status_enum"),
        default=CampaignStatus.draft,
        nullable=False
    )

    # Who created this campaign (could be an admin user ID or name)
    created_by  = Column(String(200), nullable=True)

    # Metadata
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships — one campaign has many call logs
    call_logs = relationship("CallLog", back_populates="campaign", lazy="select")
    voters = relationship("Voter", back_populates="campaign")
    user = relationship( "User", back_populates="campaigns" )

    def __repr__(self):
        return f"<Campaign id={self.id} name={self.name} status={self.status}>"


# =============================================================================
# TABLE 3: call_logs
# =============================================================================
# One row per CALL ATTEMPT. A voter might be attempted multiple times
# (e.g., first attempt = no_answer, second attempt = completed).
# Twilio's call SID (twilio_sid) is Twilio's unique identifier for the call —
# we use it to look up the call in Twilio's system later.
class CallLog(Base):
    __tablename__ = "call_logs"

    id           = Column(Integer, primary_key=True, index=True)

    # Foreign Keys — link this call to the specific voter and campaign
    voter_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    campaign_id  = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)

    # Twilio's unique call identifier — returned when we make the outbound call.
    # Format: "CA1234567890abcdef..."
    # We store this so we can look up the call in Twilio Console for debugging.
    twilio_sid   = Column(String(100), unique=True, nullable=True, index=True)

    # Call metrics
    duration_sec = Column(Integer, nullable=True)    # How long the call lasted in seconds
    status       = Column(String(50), nullable=True) # Twilio's status: completed/no-answer/busy/failed
    live_status = Column(String(50), nullable=True) # initiated ringing,connected, ai_speaking, user_speaking,transcribing, analyzing, ended
    attempt_number = Column(Integer, default=1)

    # Timestamps — recorded by Twilio webhook callbacks
    started_at   = Column(DateTime(timezone=True), nullable=True)
    ended_at     = Column(DateTime(timezone=True), nullable=True)

    # Audio recording URL (if recording is enabled in Twilio)
    recording_url = Column(String(500), nullable=True)
    full_transcript = Column(Text, nullable=True)
    webhook_payload = Column(JSON, nullable=True)

    # Metadata
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    # -------------------------------------------------------------------------
    # RELATIONSHIPS
    # voter: access the Voter object for this call → call_log.voter.name
    # campaign: access the Campaign object → call_log.campaign.script_text
    # interactions: all the conversation turns in this call → call_log.interactions
    # analysis: the LLM analysis result → call_log.analysis
    voter        = relationship("Voter", back_populates="call_logs")
    campaign     = relationship("Campaign", back_populates="call_logs")
    interactions = relationship("Interaction", back_populates="call_log", lazy="select",
                                order_by="Interaction.turn_number")
    analysis     = relationship("AnalysisResult", back_populates="call_log",
                                uselist=False)  # one-to-one

    def __repr__(self):
        return f"<CallLog id={self.id} voter_id={self.voter_id} status={self.status} duration={self.duration_sec}s>"


# =============================================================================
# TABLE 4: interactions
# =============================================================================
# Every spoken turn in a conversation is one row here.
# turn_number tracks the order: turn 1 = agent opening, turn 2 = voter reply,
# turn 3 = agent response, turn 4 = voter reply, and so on.
# speaker column is either "agent" or "voter".
# text is the transcript of what was said.
class Interaction(Base):
    __tablename__ = "interactions"

    id          = Column(Integer, primary_key=True, index=True)

    # Foreign Key — every interaction belongs to a specific call
    call_id     = Column(Integer, ForeignKey("call_logs.id"), nullable=False, index=True)

    # Turn tracking
    turn_number = Column(Integer, nullable=False)   # 1, 2, 3, 4... in order
    speaker = Column(
    SAEnum(SpeakerType, name="speaker_type_enum"),
    nullable=False
    )

    # What was actually said (transcript)
    text        = Column(Text, nullable=False)

    # Audio URL — for voter turns, this is the Twilio recording URL
    # For agent turns, this is the TTS-generated audio URL
    audio_url   = Column(String(500), nullable=True)

    # When this turn happened
    timestamp   = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to the call log
    call_log    = relationship("CallLog", back_populates="interactions")

    def __repr__(self):
        return f"<Interaction call={self.call_id} turn={self.turn_number} speaker={self.speaker}>"


# =============================================================================
# TABLE 5: analysis_results
# =============================================================================
# Stores the LLM (Groq) analysis output for each call.
# One row per call — one-to-one relationship with call_logs.
# This is what Sahithi's LLM prompt generates and returns as JSON.
class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    __table_args__ = (
    Index("idx_analysis_sentiment", "sentiment"),
    )

    id         = Column(Integer, primary_key=True, index=True)

    # Foreign Key — one analysis per call (one-to-one)
    call_id    = Column(Integer, ForeignKey("call_logs.id"), nullable=False,
                        unique=True, index=True)

    # LLM Output Fields — matches Sahithi's JSON schema exactly:
    # { "sentiment": "...", "intent": "...", "issues": [...], "confidence": 0.87, "summary": "..." }

    # Sentiment: Supporter / Neutral / Opposed
    sentiment  = Column(String(50), nullable=True)

    # Intent: Complaint / Support / Query / Undecided
    intent     = Column(String(50), nullable=True)

    # Issues mentioned by the voter — stored as a JSON array
    # Example: ["Roads", "Water", "Jobs"]
    # JSON column lets us store a Python list directly — no need to serialize manually
    issues_json = Column(JSON, nullable=True)

    # How confident the LLM was in its analysis (0.0 to 1.0)
    confidence = Column(Float, nullable=True)

    # One-sentence summary of the voter's response
    summary    = Column(Text, nullable=True)

    # The full LLM analysis as raw JSON (backup — keeps everything)
    raw_json   = Column(JSON, nullable=True)
    llm_processed = Column(Boolean, default=False)

    # When this analysis was created
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to the call log
    call_log   = relationship("CallLog", back_populates="analysis")

    def __repr__(self):
        return f"<AnalysisResult call={self.call_id} sentiment={self.sentiment} confidence={self.confidence}>"
    
    
class User(Base):
    __tablename__ = "admin_users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String,
        nullable=False
    )

    email = Column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    hashed_password = Column(
    String,
    nullable=False
    )
    campaigns = relationship(
    "Campaign",
    back_populates="user"
    )

    settings = relationship(
    "UserSettings",
    back_populates="user",
    uselist=False
)

class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True)

    user_id = Column(
        Integer,
        ForeignKey("admin_users.id"),
        unique=True
    )

    twilio_sid = Column(String)
    twilio_token = Column(String)
    twilio_phone = Column(String)

    groq_key = Column(String)
    groq_model = Column(String)

    default_script = Column(Text)
    voice = Column(
    String,
    default="Polly.Aditi"
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    user = relationship(
    "User",
    back_populates="settings"
    )

class SettingsSave(BaseModel):
    twilio_sid: str
    twilio_token: str
    twilio_phone: str

    groq_key: str
    groq_model: str

    script: str

