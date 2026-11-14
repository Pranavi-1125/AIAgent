from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)

from sqlalchemy.orm import Session

from app.database import get_db

from app.schemas import (
    SignupSchema,
    LoginSchema,
    TokenResponse
)

from app.crud import (
    get_user_by_email,
    create_user
)

from app.auth import (
    hash_password,
    verify_password,
    create_access_token
)


router = APIRouter()


@router.post(
    "/signup",
    response_model=TokenResponse
)
def signup(
    payload: SignupSchema,
    db: Session = Depends(get_db)
):

    existing_user = get_user_by_email(
        db,
        payload.email
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already exists"
        )

    hashed_password = hash_password(
        payload.password
    )

    user = create_user(
        db=db,
        name=payload.name,
        email=payload.email,
        password=hashed_password
    )

    token = create_access_token({
    "sub": user.email,
    "user_id": user.id
})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }


@router.post(
    "/login",
    response_model=TokenResponse
)
def login(
    payload: LoginSchema,
    db: Session = Depends(get_db)
):

    user = get_user_by_email(
        db,
        payload.email
    )
    print("USER FOUND:", user)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )
    print("HASH IN DB:", user.hashed_password)
    valid_password = verify_password(
        payload.password,
        user.hashed_password
    )

    print("PASSWORD VALID:", valid_password)

    if not valid_password:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    token = create_access_token({
        "sub": user.email,
        "user_id": user.id
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }