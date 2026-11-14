from datetime import datetime, timedelta, UTC
from jose import jwt, JWTError
from passlib.context import CryptContext
import os
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException
from app.database import get_db 
from app.models import User 
from sqlalchemy.orm import Session

load_dotenv()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login"
)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY is missing in .env")
ALGORITHM = "HS256"

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

ACCESS_TOKEN_EXPIRE_MINUTES = 4320

def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(
    plain_password,
    hashed_password
):
    return pwd_context.verify(
        plain_password,
        hashed_password
    )


def create_access_token(data: dict):

    to_encode = data.copy()

    expire = datetime.now(UTC) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode.update({
        "exp": expire
    })

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

def decode_access_token(token: str):
    return jwt.decode(
        token,
        SECRET_KEY,
        algorithms=[ALGORITHM]
    )

# def get_current_user(
#     token: str = Depends(oauth2_scheme),
#     db: Session = Depends(get_db)
# ):

#     credentials_exception = HTTPException(
#         status_code=401,
#         detail="Could not validate credentials"
#     )

#     try:

#         payload = jwt.decode(
#             token,
#             SECRET_KEY,
#             algorithms=[ALGORITHM]
#         )

#         user_id = payload.get("user_id")

#         if user_id is None:
#             raise credentials_exception

#     except JWTError:

#         raise credentials_exception

#     user = db.query(User).filter(
#         User.id == user_id
#     ).first()

#     if user is None:
#         raise credentials_exception

#     return user

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):

    print("TOKEN:", token)

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        print("PAYLOAD:", payload)

        user_id = payload.get("user_id")
        print("USER_ID:", user_id)

    except JWTError as e:
        print("JWT ERROR:", e)
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials"
        )

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    print("DB USER:", user)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials"
        )

    return user