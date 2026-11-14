from sqlalchemy.orm import Session
from app.websocket.manager import manager
from app import crud
from app.services.twilio_service import initiate_call
from app.models import ContactStatus
import asyncio

WEBHOOK_URL = "https://your-ngrok-url.ngrok-free.app/webhooks/voice"


def run_campaign(
    db: Session,
    campaign_id: int
):
    """
    Starts processing voters one by one.
    """

    while True:

        voter = crud.get_next_pending_voter(
            db,
            campaign_id
        )

        if not voter:
            break

        try:

            twilio_sid = initiate_call(
            voter.phone,
            call_log.id
            )

            crud.create_call_log(
                db=db,
                voter_id=voter.id,
                campaign_id=campaign_id,
                twilio_sid=twilio_call.sid
            )

            # crud.update_voter_status(
            #     db,
            #     voter.id,
            #     ContactStatus.completed
            # )
            asyncio.create_task(manager.broadcast({
                "type": "campaign_update",
                "campaign_id": campaign_id,
                "completed": crud.get_completed_count(db, campaign_id),
                "failed": crud.get_failed_count(db, campaign_id)
            }))

        except Exception as e:

            # crud.update_voter_status(
            #     db,
            #     voter.id,
            #     ContactStatus.failed
            # )

            print(f"Call failed: {e}")

            asyncio.create_task(manager.broadcast({
                "type": "campaign_update",
                "campaign_id": campaign_id,
                "completed": crud.get_completed_count(db, campaign_id),
                "failed": crud.get_failed_count(db, campaign_id)
            }))