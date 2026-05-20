from fastapi import Cookie, HTTPException
from sqlalchemy import text

from app.database import engine


def get_current_user(session_token: str | None = Cookie(None)):
    """Return the logged-in dashboard user from the session cookie."""

    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    with engine.connect() as conn:
        user = conn.execute(
            text(
                """
                SELECT users.id, users.username FROM sessions
                JOIN users ON sessions.user_id = users.id
                WHERE sessions.session_token = :st
                """
            ),
            {"st": session_token},
        ).mappings().first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user
