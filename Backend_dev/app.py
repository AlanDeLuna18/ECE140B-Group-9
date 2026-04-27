import os
import time
import uuid
from contextlib import asynccontextmanager

import bcrypt
import mysql.connector
from fastapi import Cookie, Depends, FastAPI, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from dotenv import load_dotenv

load_dotenv()

IS_PROD = os.environ.get("ENV") == "production"


class PlantCreate(BaseModel):
    name: str
    watering_interval_hours: int


class PasswordUpdate(BaseModel):
    new_password: str


def make_connection():
    return mysql.connector.connect(
        host=os.environ["DB_HOST"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
    )


def get_db():
    conn = make_connection()
    try:
        yield conn
    finally:
        conn.close()


def get_current_user(
    session_token: str | None = Cookie(None),
    conn=Depends(get_db),
):
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT users.id, users.username FROM sessions "
        "JOIN users ON sessions.user_id = users.id "
        "WHERE sessions.session_token = %s",
        (session_token,),
    )
    user = cursor.fetchone()
    cursor.close()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


@asynccontextmanager
async def lifespan(app: FastAPI):
    for _ in range(30):
        try:
            conn = make_connection()
            cursor = conn.cursor()
            with open("init.sql") as f:
                for statement in f.read().split(";"):
                    statement = statement.strip()
                    if statement:
                        cursor.execute(statement)
            conn.commit()
            cursor.close()
            conn.close()
            break
        except mysql.connector.Error:
            time.sleep(1)
    yield


app = FastAPI(lifespan=lifespan)
templates = Jinja2Templates(directory="templates")


@app.get("/", response_class=HTMLResponse)
def home(request: Request, session_token: str | None = Cookie(None), conn=Depends(get_db)):
    if session_token:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT users.id FROM sessions "
            "JOIN users ON sessions.user_id = users.id "
            "WHERE sessions.session_token = %s",
            (session_token,),
        )
        user = cursor.fetchone()
        cursor.close()
        if user:
            return RedirectResponse(url="/dashboard", status_code=303)
    return templates.TemplateResponse("home.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request, conn=Depends(get_db), current_user=Depends(get_current_user)):
    return templates.TemplateResponse("dashboard.html", {"request": request, "username": current_user["username"]})


@app.post("/register")
def register(username: str = Form(...), password: str = Form(...), conn=Depends(get_db)):
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s)",
            (username, hashed.decode()),
        )
        conn.commit()
    except mysql.connector.IntegrityError:
        cursor.close()
        raise HTTPException(status_code=409, detail="Username already exists")
    user_id = cursor.lastrowid
    session_token = str(uuid.uuid4())
    cursor.execute(
        "INSERT INTO sessions (user_id, session_token) VALUES (%s, %s)",
        (user_id, session_token),
    )
    conn.commit()
    cursor.close()
    response = RedirectResponse(url="/dashboard", status_code=303)
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=IS_PROD)
    return response


@app.post("/login")
def login(username: str = Form(...), password: str = Form(...), conn=Depends(get_db)):
    # Look up user by username
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()
    cursor.close()

    # Verify user exists and password matches
    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Create a new session
    session_token = str(uuid.uuid4())
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (user_id, session_token) VALUES (%s, %s)",
        (user["id"], session_token),
    )
    conn.commit()
    cursor.close()

    # Set cookie and redirect
    response = RedirectResponse(url="/dashboard", status_code=303)
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=IS_PROD)
    return response


@app.post("/logout")
def logout(session_token: str | None = Cookie(None), conn=Depends(get_db)):
    if session_token:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE session_token = %s", (session_token,))
        conn.commit()
        cursor.close()
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie("session_token")
    return response


@app.get("/me")
def user_info(conn=Depends(get_db), current_user=Depends(get_current_user)):
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, username FROM users WHERE id = %s", (current_user["id"],))
    user = cursor.fetchone()
    cursor.close()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.put("/me/password")
def update_password(
    password_update: PasswordUpdate,
    conn=Depends(get_db),
    current_user=Depends(get_current_user),
):
    hashed = bcrypt.hashpw(password_update.new_password.encode(), bcrypt.gensalt())
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (hashed.decode(), current_user["id"]),
    )
    conn.commit()
    cursor.close()
    return {"detail": "Password updated successfully"}


@app.post("/plants")
def create_plant(plant: PlantCreate, conn=Depends(get_db), current_user=Depends(get_current_user)):
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO plants (user_id, name, watering_interval_hours) VALUES (%s, %s, %s)",
        (current_user["id"], plant.name, plant.watering_interval_hours),
    )
    conn.commit()
    plant_id = cursor.lastrowid
    cursor.close()
    return {"id": plant_id, "user_id": current_user["id"], "name": plant.name, "watering_interval_hours": plant.watering_interval_hours}


@app.get("/plants")
def list_plants(conn=Depends(get_db), current_user=Depends(get_current_user)):
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM plants WHERE user_id = %s", (current_user["id"],))
    plants = cursor.fetchall()
    cursor.close()
    return plants


@app.get("/plants/{plant_id}")
def get_plant(plant_id: int, conn=Depends(get_db), current_user=Depends(get_current_user)):
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM plants WHERE id = %s AND user_id = %s", (plant_id, current_user["id"]))
    plant = cursor.fetchone()
    cursor.close()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return plant


@app.put("/plants/{plant_id}")
def update_plant(plant_id: int, plant: PlantCreate, conn=Depends(get_db), current_user=Depends(get_current_user)):
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM plants WHERE id = %s AND user_id = %s", (plant_id, current_user["id"]))
    existing = cursor.fetchone()
    if not existing:
        cursor.close()
        raise HTTPException(status_code=404, detail="Plant not found")
    cursor.execute(
        "UPDATE plants SET name = %s, watering_interval_hours = %s WHERE id = %s",
        (plant.name, plant.watering_interval_hours, plant_id),
    )
    conn.commit()
    cursor.close()
    return {"id": plant_id, "user_id": current_user["id"], "name": plant.name, "watering_interval_hours": plant.watering_interval_hours}


@app.delete("/plants/{plant_id}")
def delete_plant(plant_id: int, conn=Depends(get_db), current_user=Depends(get_current_user)):
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM plants WHERE id = %s AND user_id = %s", (plant_id, current_user["id"]))
    existing = cursor.fetchone()
    if not existing:
        cursor.close()
        raise HTTPException(status_code=404, detail="Plant not found")
    cursor.execute("DELETE FROM plants WHERE id = %s", (plant_id,))
    conn.commit()
    cursor.close()
    return {"detail": "Plant removed"}