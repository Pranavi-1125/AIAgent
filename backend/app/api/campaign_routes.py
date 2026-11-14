import os
import shutil

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Campaign, User
from app.schemas import CampaignCreate, CampaignResponse
from app.services.csv_service import process_voter_csv
from app.auth import get_current_user


router = APIRouter()


@router.post("/", response_model=CampaignResponse)
def create_campaign(payload: CampaignCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    campaign = Campaign(
    name=payload.name,
    script_text=payload.script_text,
    user_id=current_user.id,
    language=payload.language,
    created_by=payload.created_by
    )
    print("CREATE CAMPAIGN HIT")
    print(payload)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    return campaign


@router.post("/{campaign_id}/upload-voters")
def upload_voters(
    campaign_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    print("UPLOAD HIT")
    print("FILE NAME:", file.filename)
    campaign = db.query(Campaign).filter(
    Campaign.id == campaign_id,
    Campaign.user_id == current_user.id
    ).first()

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    os.makedirs("uploads", exist_ok=True)

    file_path = f"uploads/{file.filename}"

    print("FILE PATH:", file_path)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        voters = process_voter_csv(file_path, campaign_id, db)
        print("VOTERS CREATED:", len(voters))

    except Exception as e:
        print("UPLOAD ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "message": "Voters uploaded successfully",
        "count": len(voters)
    }


