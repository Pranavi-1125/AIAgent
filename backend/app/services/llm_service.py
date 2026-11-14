import json
import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# We initialize lazily or handle empty key gracefully
def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or "gsk_xxxx" in api_key or api_key == "your_groq_api_key":
        return None
    try:
        return Groq(api_key=api_key)
    except Exception:
        return None


async def generate_campaign_turn(history: list, script: str) -> dict:
    """
    Generate the next AI response, sentiment, intent, issue, and end state.
    Uses Groq LLM to analyze the voter input and output a structured JSON response.
    """
    client = get_groq_client()
    if not client:
        # Fallback Mock response for local testing without api keys
        voter_input = history[-1].text if history else ""
        return {
            "response": f"Thank you for sharing that. Your feedback about '{voter_input}' is very valuable to our election campaign. Do you have any other concerns?",
            "sentiment": "Neutral",
            "intent": "Undecided",
            "issue": "None",
            "should_end": False
        }

    # Format the message history
    formatted_messages = [
        {
    "role": "system",
    "content": f"""
You are a professional AI political campaign calling agent.

Campaign Context:
{script}

Your job:
1. Talk naturally with voters.
2. Understand voter opinion.
3. Detect support/opposition/issues.
4. Keep replies short and conversational.
5. Never sound robotic or overly formal.

Analyze the latest voter response carefully.

Return ONLY valid raw JSON.

Classification Rules:

Sentiment:
- Positive
- Neutral
- Negative

Intent:
- Supporter
- Interested
- Opposed
- Complaint
- Undecided
- Do Not Contact

Issues:
- Roads
- Water Supply
- Jobs
- Healthcare
- Education
- Electricity
- Corruption
- None

Intent Definitions:
- Supporter = voter clearly supports campaign/candidate
- Interested = voter wants more information or sounds open-minded
- Opposed = voter disagrees or rejects campaign
- Complaint = voter raises civic/public issue
- Undecided = unclear or uncertain response
- Do Not Contact = voter asks to stop calls/contact

Set should_end=true if:
- voter says goodbye
- voter asks to stop calls
- voter is angry
- conversation naturally ends

Examples:

User: "I support your campaign"
Output:
{{
  "response": "Thank you so much for your support. We're committed to bringing positive change.",
  "sentiment": "Positive",
  "intent": "Supporter",
  "issue": "None",
  "should_end": false
}}

User: "Please stop calling me"
Output:
{{
  "response": "Understood. We will not contact you again. Thank you for your time.",
  "sentiment": "Negative",
  "intent": "Do Not Contact",
  "issue": "None",
  "should_end": true
}}

User: "Roads in our area are terrible"
Output:
{{
  "response": "Thank you for raising this issue. Improving roads is an important concern and your feedback has been recorded.",
  "sentiment": "Negative",
  "intent": "Complaint",
  "issue": "Roads",
  "should_end": false
}}

Now return JSON only.
"""
}
    ]

    for turn in history:
        role = "assistant" if turn.speaker == "agent" else "user"
        formatted_messages.append({"role": role, "content": turn.text})

    try:
        model = os.getenv("GROQ_MODEL", "llama3-70b-8192")
        completion = client.chat.completions.create(
            model=model,
            messages=formatted_messages,
            temperature=0.3,
            max_tokens=250,
            response_format={"type": "json_object"}
        )
        content = completion.choices[0].message.content
        parsed = json.loads(content)
        return {
            "response": parsed.get("response", "Thank you for your feedback."),
            "sentiment": parsed.get("sentiment", "Neutral"),
            "intent": parsed.get("intent", "Undecided"),
            "issue": parsed.get("issue", "None"),
            "should_end": parsed.get("should_end", False)
        }
    except Exception as e:
        print("GROQ ERROR:")
        print(str(e))
        return {
            "response": "I see. Thank you so much for sharing that with me. We are recording all feedback to improve our campaign.",
            "sentiment": "Neutral",
            "intent": "Undecided",
            "issue": "None",
            "should_end": False
        }


async def analyze_final_call(transcript: str) -> dict:
    """
    Perform final call analysis, generating a one-sentence summary and confidence score.
    """
    client = get_groq_client()
    if not client:
        return {
            "summary": "Completed voter outreach survey call.",
            "confidence": 0.90
        }

    try:
        model = os.getenv("GROQ_MODEL", "llama3-70b-8192")
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a survey data entry bot. Summarize this conversation in a single brief sentence. Also output a confidence score (0.0 to 1.0) based on how clearly the voter expressed their views. Return raw JSON ONLY in this EXACT format: { \"summary\": \"your summary text\", \"confidence\": 0.95 }"
                },
                {
                    "role": "user",
                    "content": transcript
                }
            ],
            temperature=0.1,
            max_tokens=150,
            response_format={"type": "json_object"}
        )
        parsed = json.loads(completion.choices[0].message.content)
        return {
            "summary": parsed.get("summary", "Outreach call completed successfully."),
            "confidence": float(parsed.get("confidence", 0.90))
        }
    except Exception as e:
        print(f"Error in final call analysis: {e}")
        return {
            "summary": "Voter outreach survey call completed.",
            "confidence": 0.85
        }


async def analyze_conversation(transcript: str):
    analysis = await analyze_final_call(transcript)
    return json.dumps({
        "sentiment": "Neutral",
        "intent": "Undecided",
        "issue": "None",
        "summary": analysis["summary"],
        "confidence_score": analysis["confidence"]
    })