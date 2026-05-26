# =============================================================================
# schemas.py — Pydantic Request/Response Schemas
# Owner: Pranavi
# =============================================================================
# WHY THIS FILE EXISTS:
# FastAPI uses Pydantic schemas to:
#
# 1. Validate incoming API request data
# 2. Structure outgoing API responses
# 3. Auto-generate Swagger API docs
# 4. Prevent frontend/backend mismatch
#
# SQLAlchemy models = database structure
# Pydantic schemas = API structure
# =============================================================================

from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime


# =============================================================================
# VOTER SCHEMAS
# =============================================================================

class VoterBase(BaseModel):
    name: str = Field(..., example="Ravi Kumar")
    phone: str = Field(..., example="+919876543210")

    constituency: Optional[str] = Field(
        default=None,
        example="Hyderabad"
    )

    ward: Optional[str] = Field(
        default=None,
        example="Ward 12"
    )

    segment: Optional[str] = Field(
        default=None,
        example="Youth"
    )

    consent: bool = True


class VoterCreate(VoterBase):
    pass


class VoterResponse(VoterBase):
    id: int
    status: str
    campaign_id: Optional[int]

    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# =============================================================================
# CAMPAIGN SCHEMAS
# =============================================================================

class CampaignBase(BaseModel):
    name: str = Field(
        ...,
        example="Election Awareness Drive"
    )

    script_text: str = Field(
        ...,
        example="Hello, we are calling regarding the upcoming elections."
    )

    language: str = Field(
        default="hi-IN",
        example="hi-IN"
    )

    created_by: Optional[str] = Field(
        default=None,
        example="Pranavi"
    )


class CampaignCreate(CampaignBase):
    pass


class CampaignResponse(CampaignBase):
    id: int

    status: str

    started_at: Optional[datetime]
    ended_at: Optional[datetime]

    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class CampaignStatusResponse(BaseModel):
    id: int
    name: str
    status: str

    total_contacts: int
    completed_calls: int
    pending_calls: int

    answer_rate: float

    class Config:
        from_attributes = True


# =============================================================================
# CALL LOG SCHEMAS
# =============================================================================

class CallLogBase(BaseModel):
    voter_id: int
    campaign_id: int


class CallLogCreate(CallLogBase):
    twilio_sid: Optional[str] = None


class CallLogResponse(CallLogBase):
    id: int

    twilio_sid: Optional[str]

    status: str
    live_status: Optional[str]

    duration_sec: Optional[int]

    attempt_number: int

    recording_url: Optional[str]

    full_transcript: Optional[str]

    started_at: Optional[datetime]
    ended_at: Optional[datetime]

    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# =============================================================================
# INTERACTION SCHEMAS
# =============================================================================

class InteractionBase(BaseModel):
    call_id: int

    turn_number: int

    speaker: str

    text: str

    audio_url: Optional[str] = None


class InteractionCreate(InteractionBase):
    pass


class InteractionResponse(InteractionBase):
    id: int

    timestamp: Optional[datetime]

    class Config:
        from_attributes = True


# =============================================================================
# ANALYSIS RESULT SCHEMAS
# =============================================================================

class AnalysisBase(BaseModel):
    sentiment: Optional[str] = None

    intent: Optional[str] = None

    issues_json: Optional[List[str]] = None

    confidence: Optional[float] = None

    summary: Optional[str] = None


class AnalysisCreate(AnalysisBase):
    call_id: int


class AnalysisResponse(AnalysisBase):
    id: int

    call_id: int

    llm_processed: bool

    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# =============================================================================
# DASHBOARD / ANALYTICS SCHEMAS
# =============================================================================

class DashboardSummary(BaseModel):
    total_calls: int

    answered_calls: int

    answer_rate: float

    avg_duration_sec: int

    sentiment: Dict[str, int]

    top_issues: List[dict]


# =============================================================================
# LIVE TRANSCRIPT SCHEMA
# =============================================================================

class LiveTranscriptMessage(BaseModel):
    call_id: int

    speaker: str

    text: str

    timestamp: Optional[datetime]


# =============================================================================
# CSV UPLOAD RESPONSE
# =============================================================================

class CSVUploadResponse(BaseModel):
    campaign_id: int

    total_contacts: int

    uploaded_contacts: int

    skipped_contacts: int

    message: str


# =============================================================================
# GENERIC API RESPONSE
# =============================================================================

class APIResponse(BaseModel):
    success: bool

    message: str