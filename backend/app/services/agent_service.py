import os
import uuid
import asyncio
from gtts import gTTS

from app.services.llm_service import generate_campaign_turn
from app.websocket.manager import manager

# =============================================================================
# TEXT TO SPEECH
# =============================================================================

async def generate_tts_audio(
    text: str,
    language: str = "en"
):

    filename = f"tts_{uuid.uuid4()}.mp3"

    output_dir = "generated_audio"

    os.makedirs(output_dir, exist_ok=True)

    filepath = os.path.join(output_dir, filename)

    tts = gTTS(
        text=text,
        lang=language
    )

    tts.save(filepath)

    return filepath


# =============================================================================
# MAIN AGENT ORCHESTRATION
# =============================================================================

async def process_conversation_turn(
    db,
    call_log,
    voter_text: str
):

    from app import crud
    from app.models import AnalysisResult

    # ---------------------------------------------------------
    # SAVE VOTER MESSAGE
    # ---------------------------------------------------------

    turns = crud.get_conversation(
        db,
        call_log.id
    )

    voter_turn_number = len(turns) + 1

    crud.save_interaction(
        db=db,
        call_id=call_log.id,
        turn_number=voter_turn_number,
        speaker="voter",
        text=voter_text
    )

    # ---------------------------------------------------------
    # WEBSOCKET TRANSCRIPT UPDATE
    # ---------------------------------------------------------

    await manager.broadcast({
        "type": "transcript",
        "speaker": "voter",
        "text": voter_text
    })

    # ---------------------------------------------------------
    # GET FULL HISTORY
    # ---------------------------------------------------------

    updated_turns = crud.get_conversation(
        db,
        call_log.id
    )

    # ---------------------------------------------------------
    # ASK LLM
    # ---------------------------------------------------------

    ai_data = await generate_campaign_turn(
        updated_turns,
        call_log.campaign.script_text
    )

    ai_response = ai_data["response"]

    # ---------------------------------------------------------
    # SAVE AGENT RESPONSE
    # ---------------------------------------------------------

    agent_turn_number = voter_turn_number + 1

    crud.save_interaction(
        db=db,
        call_id=call_log.id,
        turn_number=agent_turn_number,
        speaker="agent",
        text=ai_response
    )

    # ---------------------------------------------------------
    # UPDATE ANALYTICS LIVE
    # ---------------------------------------------------------

    analysis = db.query(AnalysisResult).filter(
        AnalysisResult.call_id == call_log.id
    ).first()

    if not analysis:

        analysis = AnalysisResult(
            call_id=call_log.id
        )

        db.add(analysis)

    analysis.sentiment = ai_data["sentiment"]
    analysis.intent = ai_data["intent"]

    if ai_data["issue"] != "None":
        analysis.issues_json = [ai_data["issue"]]

    analysis.summary = "Live conversation ongoing"
    analysis.confidence = 0.90

    db.commit()

    # ---------------------------------------------------------
    # WEBSOCKET AI RESPONSE
    # ---------------------------------------------------------

    await manager.broadcast({
        "type": "ai_response",
        "text": ai_response,
        "sentiment": ai_data["sentiment"],
        "intent": ai_data["intent"],
        "issue": ai_data["issue"]
    })

    # ---------------------------------------------------------
    # GENERATE AI VOICE
    # ---------------------------------------------------------

    audio_path = await generate_tts_audio(
        ai_response,
        language="en"
    )

    return {
        "response": ai_response,
        "audio_path": audio_path,
        "sentiment": ai_data["sentiment"],
        "intent": ai_data["intent"],
        "issue": ai_data["issue"],
        "should_end": ai_data["should_end"]
    }