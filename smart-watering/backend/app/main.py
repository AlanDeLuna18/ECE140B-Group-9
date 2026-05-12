import os
import uuid
import bcrypt
from fastapi import FastAPI, Cookie, Depends, Form, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from pydantic import BaseModel

# Imports from HER project structure
from app.database import create_tables, engine
from app.routes.devices import router as devices_router
from app.routes.plant_groups import router as plant_groups_router
from app.routes.plant_types import router as plant_types_router
from app.routes.sensor import router as sensor_router
from app.routes.watering import router as watering_router

app = FastAPI(
    title="Smart Watering Backend",
    description="API for smart watering settings and plant sensor readings.",
    version="0.1.0",
)

IS_PROD = os.environ.get("ENV") == "production"

# --- CORS SETUP ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class PlantCreate(BaseModel):
    name: str
    watering_interval_hours: int

class PasswordUpdate(BaseModel):
    new_password: str

# --- AUTH DEPENDENCY ---
def get_current_user(session_token: str | None = Cookie(None)):
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    with engine.connect() as conn:
        user = conn.execute(
            text("""
                SELECT users.id, users.username FROM sessions 
                JOIN users ON sessions.user_id = users.id 
                WHERE sessions.session_token = :st
            """),
            {"st": session_token}
        ).mappings().first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user

# --- AUTH ROUTES ---

@app.post("/api/register")
def register(username: str = Form(...), password: str = Form(...)):
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    session_token = str(uuid.uuid4())
    
    with engine.begin() as conn:
        try:
            conn.execute(
                text("INSERT INTO users (username, password_hash) VALUES (:u, :p)"),
                {"u": username, "p": hashed.decode()}
            )
            user_id = conn.execute(text("SELECT last_insert_rowid()")).scalar()
            conn.execute(
                text("INSERT INTO sessions (user_id, session_token) VALUES (:uid, :st)"),
                {"uid": user_id, "st": session_token}
            )
        except Exception:
            raise HTTPException(status_code=409, detail="Username already exists")

    response = Response(content='{"message": "success"}', media_type="application/json")
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=IS_PROD, samesite="lax")
    return response

@app.post("/login")
def login(username: str = Form(...), password: str = Form(...)):
    with engine.connect() as conn:
        user = conn.execute(text("SELECT * FROM users WHERE username = :u"), {"u": username}).mappings().first()
        if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        session_token = str(uuid.uuid4())
        with engine.begin() as t_conn:
            t_conn.execute(
                text("INSERT INTO sessions (user_id, session_token) VALUES (:uid, :st)"),
                {"uid": user["id"], "st": session_token}
            )

    response = Response(content='{"message": "success"}', media_type="application/json")
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=IS_PROD, samesite="lax")
    return response

@app.post("/logout")
def logout(session_token: str | None = Cookie(None)):
    if session_token:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM sessions WHERE session_token = :st"), {"st": session_token})
    
    response = Response(content='{"message": "success"}', media_type="application/json")
    response.delete_cookie("session_token")
    return response

@app.get("/me")
def user_info(current_user=Depends(get_current_user)):
    return {"id": current_user["id"], "username": current_user["username"]}

@app.put("/me/password")
def update_password(password_update: PasswordUpdate, current_user=Depends(get_current_user)):
    hashed = bcrypt.hashpw(password_update.new_password.encode(), bcrypt.gensalt())
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET password_hash = :p WHERE id = :id"),
            {"p": hashed.decode(), "id": current_user["id"]}
        )
    return {"detail": "Password updated successfully"}

# --- YOUR PLANT METHODS (ADAPTED FOR SQLITE) ---

@app.post("/plants")
def create_plant(plant: PlantCreate, current_user=Depends(get_current_user)):
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO plants (user_id, name, watering_interval_hours) VALUES (:uid, :n, :w)"),
            {"uid": current_user["id"], "n": plant.name, "w": plant.watering_interval_hours}
        )
        plant_id = conn.execute(text("SELECT last_insert_rowid()")).scalar()
    return {"id": plant_id, "user_id": current_user["id"], "name": plant.name}

@app.get("/plants")
def list_plants(current_user=Depends(get_current_user)):
    with engine.connect() as conn:
        plants = conn.execute(
            text("SELECT * FROM plants WHERE user_id = :uid"),
            {"uid": current_user["id"]}
        ).mappings().all()
    return plants

@app.delete("/plants/{plant_id}")
def delete_plant(plant_id: int, current_user=Depends(get_current_user)):
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM plants WHERE id = :pid AND user_id = :uid"),
            {"pid": plant_id, "uid": current_user["id"]}
        )
    return {"detail": "Plant removed"}

# --- STARTUP & ROUTERS ---

@app.on_event("startup")
def on_startup() -> None:
    create_tables()

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(sensor_router)
app.include_router(plant_types_router)
app.include_router(plant_groups_router)
app.include_router(devices_router)
app.include_router(watering_router)