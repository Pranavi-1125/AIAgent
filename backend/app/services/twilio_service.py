import os
from dotenv import load_dotenv
from twilio.rest import Client

load_dotenv()
print("ENV SID:", repr(os.getenv("TWILIO_ACCOUNT_SID")))
print("ENV TOKEN:", repr(os.getenv("TWILIO_AUTH_TOKEN")))
print("ENV FILE LOADED FROM:", os.getcwd())

def get_twilio_client():
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    if not sid or not token or "AC" not in sid or sid == "your_twilio_account_sid":
        return None
    try:
        return Client(sid, token)
    except Exception as e:
        print(f"Error initializing Twilio Client: {e}")
        return None


def initiate_call(phone_number: str, call_log_id: int):
    client = get_twilio_client()
    if not client:
        raise ValueError("Twilio credentials are not configured or invalid.")

    twilio_phone = os.getenv("TWILIO_PHONE_NUMBER", "+1234567890")
    base_url = os.getenv("BASE_URL", "http://localhost:8000")

    print("CALLING:", phone_number)
    print("TWIML URL:", f"{base_url}/calls/twiml/{call_log_id}")
    try:
        print("CALLING NUMBER:", phone_number)
        call = client.calls.create(
            to=phone_number,
            from_=twilio_phone,
            url=f"{base_url}/calls/twiml/{call_log_id}",
            method="GET",
            record=True,
            timeout=25,
            machine_detection="Enable",
            status_callback=f"{base_url}/calls/webhook/twilio",
            status_callback_event=[
                "initiated",
                "ringing",
                "answered",
                "completed"
            ]
        )

        return call.sid
    except Exception as e:
        import traceback

        print("\n========== TWILIO ERROR ==========")
        print(str(e))
        traceback.print_exc()
        print("==================================\n")

        return None