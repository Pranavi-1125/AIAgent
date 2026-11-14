import json
import os
import time
from datetime import datetime
from urllib import response
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from twilio.twiml.voice_response import VoiceResponse, Gather

from app.database import SessionLocal
from app.database import get_db
from app.models import Campaign, UserSettings, Voter, CallLog, Interaction, AnalysisResult, ContactStatus, CampaignStatus
from app.services.twilio_service import initiate_call
from app.services.llm_service import analyze_final_call
from app.services.agent_service import process_conversation_turn
from app.websocket.manager import manager
from app import crud

router = APIRouter()

@router.api_route("/webhook/twilio", methods=["GET", "POST"])
async def twilio_status_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Twilio Call status callback endpoint.
    Triggers final LLM analysis, saves logs, and dials next pending contact.
    """
    form_data = await request.form()
    twilio_sid = form_data.get("CallSid")
    call_status = form_data.get("CallStatus")
    duration_sec = form_data.get("CallDuration")

    call_log = db.query(CallLog).filter(CallLog.twilio_sid == twilio_sid).first()
    
    if not call_log:
        call_id = form_data.get("CallId")
        if call_id:
            call_log = db.query(CallLog).filter(CallLog.id == int(call_id)).first()

    if not call_log:
        return {"success": False, "message": "Call log not found"}

    call_log.status = call_status
    if duration_sec:
        call_log.duration_sec = int(duration_sec)

    call_log.webhook_payload = dict(form_data)
    await manager.broadcast({
        "type": "status",
        "message": f"Call ended with status: {call_status}"
    })

    if call_status in ("completed", "busy", "no-answer", "failed"):
        call_log.ended_at = datetime.utcnow()
        call_log.live_status = "ended"

        voter = call_log.voter
        if call_status == "completed":

            turns = crud.get_conversation(db, call_log.id)

            voter.status = (
                ContactStatus.completed
                if len(turns) >= 4
                else ContactStatus.failed
            )
        elif call_status == "busy":
            voter.status = ContactStatus.busy
        elif call_status in ("no-answer", "no_answer"):
            voter.status = ContactStatus.no_answer
        else:
            voter.status = ContactStatus.failed
        
        db.commit()
        db.refresh(voter)

        campaign = call_log.campaign  
        db.expire_all()
        completed_count = db.query(Voter).filter(
            Voter.campaign_id == campaign.id,
            Voter.status == ContactStatus.completed
        ).count()

        failed_count = db.query(Voter).filter(
            Voter.campaign_id == campaign.id,
            Voter.status.in_([
                ContactStatus.failed,
                ContactStatus.busy,
                ContactStatus.no_answer
            ])
        ).count()

        await manager.broadcast({
            "type": "campaign_update",
            "status": campaign.status.value,
            "completed": completed_count,
            "failed": failed_count,
            "currentContact": None
        })

        # Run final summary analysis
        turns = crud.get_conversation(db, call_log.id)
        if len(turns) > 1:
            transcript_text = "\n".join([
                f"{'Agent' if t.speaker == 'agent' else 'Voter'}: {t.text}"
                for t in turns
            ])
            
            analysis_data = await analyze_final_call(transcript_text)
            
            analysis = db.query(AnalysisResult).filter(AnalysisResult.call_id == call_log.id).first()
            if not analysis:
                analysis = AnalysisResult(
                    call_id=call_log.id,
                    sentiment="Neutral",
                    intent="Undecided",
                    issues_json=[],
                    confidence=analysis_data["confidence"],
                    summary=analysis_data["summary"],
                    llm_processed=True
                )
                db.add(analysis)
            else:
                analysis.summary = analysis_data["summary"]
                analysis.confidence = analysis_data["confidence"]
                analysis.llm_processed = True
            
            call_log.full_transcript = transcript_text
            db.commit()

        # Dial next pending contact in active campaign
        campaign = call_log.campaign
        if campaign.status == CampaignStatus.running:
            campaign_id = campaign.id
            next_voter = crud.get_next_pending_voter(db, campaign.id)
            print("NEXT VOTER:", next_voter)
            if next_voter:
                import asyncio
                async def dial_next():
                    await asyncio.sleep(2)
                    print("STARTING NEXT CALL")
                    db_next = SessionLocal()
                    try:
                        await start_campaign_calls(
                            campaign_id=campaign_id,
                            db=db_next
                        )
                        print("NEXT CALL STARTED")
                    except Exception as e:
                        print("DIAL NEXT ERROR:", e)
                    finally:
                        db_next.close()
                
                asyncio.create_task(dial_next())
            else:
                campaign.status = CampaignStatus.completed
                campaign.ended_at = datetime.utcnow()
                db.commit()
                await manager.broadcast({
                    "type": "campaign_update",
                    "status": "completed",
                    "currentContact": None
                })

        db.commit()
        return {"success": True}
    
@router.post("/start/{campaign_id}")
async def start_campaign_calls(campaign_id: int, db: Session = Depends(get_db)):
    """
    Triggers outbound calls for a campaign sequentially.
    Finds the first pending voter, creates a CallLog, and initiates the call.
    """
    voter = crud.get_next_pending_voter(db, campaign_id)
    if not voter:
        raise HTTPException(status_code=404, detail="No pending voters found for this campaign")
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id).first()
    campaign.status = CampaignStatus.running
    campaign.started_at = datetime.utcnow()
    db.commit()
    # Create CallLog
    call_log = crud.create_call_log(db, voter_id=voter.id, campaign_id=campaign_id)
    voter.status = ContactStatus.callback_scheduled
    # Update live status
    call_log.live_status = "ringing"
    db.commit()

    # Trigger Twilio Call
    twilio_sid = None
    try:
        twilio_sid = initiate_call(voter.phone, call_log.id)
        call_log.twilio_sid = twilio_sid
        db.commit()
    except Exception as e:
        print(f"Twilio call failed: {e}")
        # If Twilio is not configured, we keep the call log for simulated dialing!
        call_log.twilio_sid = f"SIM-{call_log.id}"
        db.commit()

    # Broadcast websocket update
    await manager.broadcast({
        "type": "campaign_update",
        "status": "running",
        "currentContact": {
            "name": voter.name,
            "phone": voter.phone
        }
    })

    # return {
    #     "success": True,
    #     "message": "Call initiated",
    #     "call_log_id": call_log.id,
    #     "twilio_sid": twilio_sid or f"SIM-{call_log.id}"
    # }
    return {
    "success": twilio_sid is not None,
    "message": "Call initiated" if twilio_sid else "Call failed",
    "call_log_id": call_log.id,
    "twilio_sid": twilio_sid
    }

@router.post("/test-agent/{call_log_id}")
async def test_agent(
    call_log_id: int,
    payload: dict,
    db: Session = Depends(get_db)
):

    call_log = db.query(CallLog).filter(
        CallLog.id == call_log_id
    ).first()

    if not call_log:
        raise HTTPException(
            status_code=404,
            detail="Call log not found"
        )

    result = await process_conversation_turn(
        db=db,
        call_log=call_log,
        voter_text=payload["text"]
    )

    return result

@router.api_route("/twiml/{call_log_id}", methods=["GET", "POST"])
async def generate_twiml(call_log_id: int, db: Session = Depends(get_db)):
    """
    Twilio voice call starting webhook.
    Greets the voter and gathers speech response.
    """
    call_log = db.query(CallLog).filter(CallLog.id == call_log_id).first()
    if not call_log:
        raise HTTPException(status_code=404, detail="Call log not found")

    call_log.live_status = "connected"
    call_log.status = "in-progress"
    db.commit()

    # Broadcast to websocket
    await manager.broadcast({
        "type": "status",
        "message": f"Call connected to {call_log.voter.name}"
    })

    campaign = call_log.campaign
    script_text = campaign.script_text
    settings = db.query(UserSettings).filter(
    UserSettings.user_id == campaign.user_id
    ).first()

    voice = (
        settings.voice
        if settings and settings.voice
        else "Polly.Aditi"
    )
    
    # Personalize opening script
    voter_name = call_log.voter.name
    personalized_script = script_text.replace("[Contact Name]", voter_name)

    # Save turn 1
    crud.save_interaction(
        db=db,
        call_id=call_log_id,
        turn_number=1,
        speaker="agent",
        text=personalized_script
    )

    # Broadcast AI opening response
    await manager.broadcast({
        "type": "ai_response",
        "text": personalized_script,
        "sentiment": "Neutral",
        "issue": "None"
    })

    base_url = os.getenv("BASE_URL", "http://localhost:8000")

    twiml_response = VoiceResponse()

    gather = twiml_response.gather(
        input="speech",
        action=f"{base_url}/calls/respond/{call_log_id}",
        method="POST",
        speechTimeout="auto",
        timeout=3,
        language="en-IN"
    )

    gather.say(
        personalized_script,
        voice=voice,
        language="en-IN"
    )

    twiml_response.say(
        "We did not receive any response.",
        voice=voice,
        language="en-IN"
    )

    print("TWIML ROUTE HIT")

    return Response(
        content=str(twiml_response),
        media_type="application/xml"
    )


@router.api_route("/respond/{call_log_id}", methods=["GET", "POST"])
async def respond_webhook(call_log_id: int, request: Request, db: Session = Depends(get_db)):
    """
    Handles voter speech transcripts, asks Groq for next response,
    updates live sentiment analysis, and keeps the dialog going.
    """
    print("RESPOND ROUTE HIT")
    print("CALL LOG:", call_log_id)
    call_log = db.query(CallLog).filter(CallLog.id == call_log_id).first()
    if not call_log:
        raise HTTPException(status_code=404, detail="Call log not found")

    form_data = await request.form()
    print("FORM DATA:", form_data)
    speech_result = form_data.get("SpeechResult", "")
    print("USER SAID:", speech_result)

    base_url = os.getenv("BASE_URL", "http://localhost:8000")

    campaign = call_log.campaign

    settings = db.query(UserSettings).filter(
        UserSettings.user_id == campaign.user_id
    ).first()

    voice = (
        settings.voice
        if settings and settings.voice
        else "Polly.Aditi"
    )

    twiml_response = VoiceResponse()

    if not speech_result:
        # Fallback if silence
        fallback_msg = "Sorry, I didn't catch that. Could you please repeat?"
        twiml_response.say(fallback_msg, voice=voice, language="en-IN")
        twiml_response.gather(
            input="speech",
            action=f"{base_url}/calls/respond/{call_log_id}",
            method="POST",
            speechTimeout="auto",
            language="en-IN"
        )
        return Response(content=str(twiml_response), media_type="application/xml")

    # Save Voter turn
    turns = crud.get_conversation(db, call_log_id)
    voter_turn_num = len(turns) + 1
    crud.save_interaction(
        db=db,
        call_id=call_log_id,
        turn_number=voter_turn_num,
        speaker="voter",
        text=speech_result
    )

    # Broadcast Voter speech transcript
    await manager.broadcast({
        "type": "transcript",
        "text": speech_result
    })

    try:
        start = time.time()
        agent_result = await process_conversation_turn(
            db=db,
            call_log=call_log,
            voter_text=speech_result
        )
        print("LLM TIME:", time.time() - start)

    except Exception as e:

        import traceback

        print("AI ERROR:", e)
        traceback.print_exc()

        fallback = VoiceResponse()

        fallback.say(
            "Sorry, our system is busy right now.",
            voice=voice,
            language="en-IN"
        )

        fallback.hangup()

        # return Response(
        #     content=str(fallback),
        #     media_type="application/xml"
        # )

    if agent_result["should_end"]:

        twiml_response.say(
            agent_result["response"],
            voice=voice,
            language="en-IN"
        )

        twiml_response.hangup()

    else:

        gather = twiml_response.gather(
            input="speech",
            action=f"{base_url}/calls/respond/{call_log_id}",
            method="POST",
            speechTimeout="auto",
            timeout=3,
            language="en-IN"
        )

        gather.say(
            agent_result["response"],
            voice=voice,
            language="en-IN"
        )

        twiml_response.say(
            "I couldn't hear you.",
            voice=voice,
            language="en-IN"
        )

    return Response(content=str(twiml_response), media_type="application/xml")


