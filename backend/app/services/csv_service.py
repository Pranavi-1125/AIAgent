import pandas as pd
from sqlalchemy.orm import Session

from app.models import Voter, ContactStatus


def process_voter_csv(file_path: str, campaign_id: int, db: Session):

    df = pd.read_csv(file_path)

    # Clean column names
    df.columns = df.columns.str.strip().str.lower()

    print("CSV COLUMNS:", df.columns.tolist())

    created_voters = []

    for _, row in df.iterrows():

        print("ROW:", row.to_dict())

        name = row.get("name")

        phone = (
            row.get("phone")
            if "phone" in df.columns
            else row.get("phone_number")
        )

        constituency = (
            row.get("constituency")
            if "constituency" in df.columns
            else row.get("area")
        )

        ward = row.get("ward") if "ward" in df.columns else None

        segment = (
            row.get("segment")
            if "segment" in df.columns
            else row.get("voter_segment")
        )

        if pd.isna(name) or pd.isna(phone):
            print("SKIPPED EMPTY ROW")
            continue

        # Clean phone number
        cleaned_phone = str(phone).split(".")[0]
        cleaned_phone = ''.join(filter(str.isdigit, cleaned_phone))

        # Add country code if missing
        if not cleaned_phone.startswith("91"):
            cleaned_phone = "91" + cleaned_phone

        cleaned_phone = "+" + cleaned_phone

        print("CLEANED PHONE:", cleaned_phone)

        existing = db.query(Voter).filter(
            Voter.phone == cleaned_phone,
            Voter.campaign_id == campaign_id
        ).first()

        if existing:
            print("DUPLICATE FOUND:", cleaned_phone)
            continue

        voter = Voter(
            name=str(name).strip(),
            phone=cleaned_phone,
            constituency=str(constituency).strip() if pd.notna(constituency) else None,
            ward=str(ward).strip() if pd.notna(ward) else None,
            segment=str(segment).strip() if pd.notna(segment) else None,
            campaign_id=campaign_id,
            status=ContactStatus.pending
        )

        db.add(voter)
        db.flush()
        created_voters.append(voter)

    db.commit()

    for voter in created_voters:
        db.refresh(voter)

    print("TOTAL CREATED:", len(created_voters))

    return created_voters



# import pandas as pd
# from sqlalchemy.orm import Session

# from app.models import Voter, ContactStatus


# def process_voter_csv(file_path: str, campaign_id: int, db: Session):
#     df = pd.read_csv(file_path)

#     created_voters = []

#     for _, row in df.iterrows():
#         name = row.get("name")
#         phone = row.get("phone") if "phone" in df.columns else row.get("phone_number")
#         constituency = row.get("constituency") if "constituency" in df.columns else row.get("area")
#         ward = row.get("ward") if "ward" in df.columns else None
#         segment = row.get("segment") if "segment" in df.columns else row.get("voter_segment")

#         if pd.isna(name) or pd.isna(phone):
#             continue

#         voter = Voter(
#             name=str(name).strip(),
#             phone = str(phone).split(".")[0],
#             phone = ''.join(filter(str.isdigit, phone)),
#             constituency=str(constituency).strip() if pd.notna(constituency) else None,
#             ward=str(ward).strip() if pd.notna(ward) else None,
#             segment=str(segment).strip() if pd.notna(segment) else None,
#             campaign_id=campaign_id,
#             status=ContactStatus.pending
#         )
#         existing = db.query(Voter).filter(
#             Voter.phone == cleaned_phone
#         ).first()

#         if existing:
#             continue
#         db.add(voter)
#         created_voters.append(voter)

#     db.commit()

#     for voter in created_voters:
#         db.refresh(voter)

#     return created_voters