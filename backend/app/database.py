# =============================================================================
# database.py
# =============================================================================

import os

from dotenv import load_dotenv

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker


# Load .env variables
load_dotenv()


# =============================================================================
# DATABASE URL
# =============================================================================

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")


# =============================================================================
# SQLAlchemy Engine
# =============================================================================

engine = create_engine(
    DATABASE_URL,

    # Verifies connection before using it
    pool_pre_ping=True,

    # Connection pool settings
    pool_size=10,
    max_overflow=20,

    # Recommended for PostgreSQL
    pool_recycle=3600,

    # Debug SQL queries
    echo=False
)


# =============================================================================
# Session Factory
# =============================================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# =============================================================================
# Base Class for Models
# =============================================================================

Base = declarative_base()


# =============================================================================
# FastAPI Dependency
# =============================================================================

def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()