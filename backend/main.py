import os
import asyncio
import tempfile
import httpx
import re
import time

from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from datetime import datetime, timezone
from io import BytesIO
from urllib.parse import quote
from fastapi.responses import StreamingResponse

from exports import generate_txt, generate_docx, generate_pdf

from fastapi import (
    FastAPI, UploadFile, File, HTTPException, Query, Depends
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv

from storage import upload_audio, generate_download_url, delete_audio

from database import (
    create_transcription, complete_transcription, fail_transcription,
    record_usage, get_user_usage, save_segments, get_transcriptions,
    get_transcription, delete_transcription, update_transcription_text
)

load_dotenv(Path(__file__).parent / ".env")

app = FastAPI(
    title="AudioNet API",
    description="Plataforma de transcripcion de audio",
    version="1.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://musical-flan-ee1cd7.netlify.app"
    ],
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".mp4"}

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
RUNPOD_BASE_URL = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}"

security = HTTPBearer(auto_error=False)


# =========================================
# AUTHENTICATION
# =========================================

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase authentication is not configured"
        )

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {credentials.credentials}"
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers=headers
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or expired session"
                )

            user = response.json()
            if not user.get("id"):
                raise HTTPException(status_code=401, detail="Invalid user session")
            return user

    except HTTPException:
        raise
    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable"
        )


@app.post("/auth/login")
async def login(data: LoginRequest):
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase authentication is not configured"
        )

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                headers=headers,
                json={"email": data.email, "password": data.password}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid email or password"
                )
            return response.json()

    except HTTPException:
        raise
    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable"
        )


@app.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user.get("email")
    }


@app.get("/usage/me")
def my_usage(current_user: dict = Depends(get_current_user)):
    try:
        return get_user_usage(current_user["id"])
    except Exception:
        raise HTTPException(status_code=500, detail="Usage retrieval error")


@app.post("/auth/register")
async def register(data: RegisterRequest):
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase authentication is not configured"
        )

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "email": data.email.strip().lower(),
        "password": data.password,
        "data": {"full_name": data.full_name.strip()}
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{SUPABASE_URL}/auth/v1/signup",
                headers=headers,
                json=payload
            )

            if response.status_code not in (200, 201):
                raise HTTPException(
                    status_code=400,
                    detail="No se pudo crear la cuenta. Verifica los datos."
                )

            result = response.json()
            return {
                "message": "Cuenta creada. Revisa tu correo para verificarla.",
                "user": result.get("user")
            }

    except HTTPException:
        raise
    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable"
        )


# =========================================
# GENERAL
# =========================================

@app.get("/")
def home():
    return {"application": "AudioNet", "status": "online"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# =========================================
# RUNPOD TRANSCRIPTION
# =========================================

async def execute_transcription(audio_url: str, language: str):
    if not RUNPOD_API_KEY or not RUNPOD_ENDPOINT_ID:
        raise HTTPException(status_code=500, detail="Missing Runpod credentials")

    headers = {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {"input": {"audio_url": audio_url, "language": language}}

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{RUNPOD_BASE_URL}/run",
            json=payload,
            headers=headers
        )
        response.raise_for_status()
        job_id = response.json()["id"]

        for _ in range(1800):
            await asyncio.sleep(2)
            status_response = await client.get(
                f"{RUNPOD_BASE_URL}/status/{job_id}",
                headers=headers
            )
            status_response.raise_for_status()
            result = status_response.json()
            status = result.get("status")

            if status == "COMPLETED":
                return result.get("output", {})
            if status in {"FAILED", "CANCELLED", "TIMED_OUT"}:
                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "Runpod transcription failed",
                        "result": result
                    }
                )

        raise HTTPException(status_code=504, detail="Transcription timeout")


# =========================================
# UPLOAD AND TRANSCRIBE
# =========================================

@app.post("/upload-and-transcribe")
async def upload_and_transcribe(
    file: UploadFile = File(...),
    language: str = "es",
    current_user: dict = Depends(get_current_user)
):
    # Incluye lectura del archivo, subida a R2 y espera del worker Runpod.
    processing_start = time.perf_counter()
    user_id = current_user["id"]
    filename = file.filename or "audio"
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Audio format not allowed")

    temp_path = None
    transcription_id = None
    object_key = None

    try:
        transcription = create_transcription({
            "user_id": user_id,
            "filename": filename,
            "language": language,
            "status": "processing"
        })
        transcription_id = transcription["id"]

        with tempfile.NamedTemporaryFile(
            suffix=extension,
            delete=False
        ) as temp_file:
            temp_path = temp_file.name
            while chunk := await file.read(1024 * 1024):
                temp_file.write(chunk)

        object_key = upload_audio(temp_path, filename)
        audio_url = generate_download_url(object_key, expiration=3600)
        output = await execute_transcription(audio_url, language)

        segments = output.get("segments", []) or []
        transcript_text = output.get("text", "") or ""
        audio_duration = float(output.get("duration") or 0)

        clean_text = transcript_text.strip()
        paragraph_count = len([
            paragraph
            for paragraph in re.split(r"\n\s*\n", clean_text)
            if paragraph.strip()
        ]) if clean_text else 0

        # El cronÃ³metro se detiene al terminar la transcripciÃ³n del worker.
        processing_time = time.perf_counter() - processing_start

        report = {
            "processing_time_seconds": round(processing_time, 3),
            "character_count": len(transcript_text),
            "character_count_no_whitespace": len(
                "".join(transcript_text.split())
            ),
            "word_count": len(transcript_text.split()),
            "paragraph_count": paragraph_count,
            "segment_count": len(segments),
            "processing_speed": (
                round(audio_duration / processing_time, 2)
                if processing_time > 0 else 0
            )
        }

        save_segments(transcription_id, user_id, segments)

        completed_at = datetime.now(timezone.utc).isoformat()
        complete_transcription(
            transcription_id,
            user_id,
            {
                "storage_key": object_key,
                "language": output.get("language"),
                "duration": audio_duration,
                "transcript_text": transcript_text,
                "status": "completed",
                "completed_at": completed_at,
                **report
            }
        )

        record_usage(
            user_id=user_id,
            transcription_id=transcription_id,
            duration_seconds=audio_duration
        )

        return {
            "id": transcription_id,
            "status": "completed",
            "filename": filename,
            "storage_key": object_key,
            "language": output.get("language"),
            "duration": audio_duration,
            "completed_at": completed_at,
            "segments": segments,
            "text": transcript_text,
            "report": report
        }

    except httpx.HTTPStatusError as e:
        error_message = f"Runpod communication error: {e.response.text}"
        if transcription_id:
            fail_transcription(transcription_id, user_id, error_message)
        raise HTTPException(status_code=502, detail=error_message)

    except HTTPException as e:
        if transcription_id:
            fail_transcription(transcription_id, user_id, str(e.detail))
        raise

    except Exception as e:
        if transcription_id:
            try:
                fail_transcription(transcription_id, user_id, str(e))
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        await file.close()


# =========================================
# TRANSCRIPTION HISTORY
# =========================================

@app.get("/transcriptions")
def list_transcriptions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    try:
        records = get_transcriptions(current_user["id"], limit, offset)
        return {
            "total": len(records),
            "limit": limit,
            "offset": offset,
            "transcriptions": records
        }
    except Exception:
        raise HTTPException(status_code=500, detail="History retrieval error")


@app.get("/transcriptions/{transcription_id}")
def transcription_detail(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        transcription = get_transcription(transcription_id, current_user["id"])
        if not transcription:
            raise HTTPException(status_code=404, detail="Transcription not found")
        return transcription
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Transcription retrieval error")


# =========================================
# UPDATE TRANSCRIPTION
# =========================================

class TranscriptionUpdate(BaseModel):
    transcript_text: str


from pydantic import BaseModel, Field

class ExportOptions(BaseModel):
    format: str
    document_type: str = "standard"

    title: str = "Transcripción"
    header: str = ""
    subtitle: str = ""
    author: str = ""

    include_date: bool = True
    include_audio_info: bool = True
    include_timestamps: bool = False
    include_page_numbers: bool = True

    # Información judicial
    country: str = ""
    jurisdiction: str = ""
    court: str = ""
    case_number: str = ""
    proceeding_type: str = ""
    parties: str = ""
    judge: str = ""
    prosecutor: str = ""
    attorneys: str = ""
    clerk: str = ""
    hearing_date: str = ""
    hearing_location: str = ""
    hearing_number: str = ""
    transcriber: str = ""

    participants: list[str] = Field(default_factory=list)
    include_line_numbers: bool = False
    include_participant_index: bool = False


@app.patch("/transcriptions/{transcription_id}")
def update_transcription(
    transcription_id: str,
    data: TranscriptionUpdate,
    current_user: dict = Depends(get_current_user)
):
    try:
        transcription = update_transcription_text(
            transcription_id,
            current_user["id"],
            data.transcript_text
        )
        if not transcription:
            raise HTTPException(status_code=404, detail="Transcription not found")
        return {"status": "updated", "transcription": transcription}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Transcription update error")


# =========================================
# EXPORT TRANSCRIPTION
# =========================================

@app.post("/transcriptions/{transcription_id}/export")
def export_transcription(
    transcription_id: str,
    options: ExportOptions,
    current_user: dict = Depends(get_current_user)
):
    try:
        transcription = get_transcription(transcription_id, current_user["id"])
        if not transcription:
            raise HTTPException(status_code=404, detail="Transcription not found")
        if transcription.get("status") != "completed":
            raise HTTPException(status_code=400, detail="Transcription is not completed")

        export_format = options.format.lower().strip()
        generators = {
            "txt": (generate_txt, "text/plain; charset=utf-8"),
            "docx": (
                generate_docx,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "pdf": (generate_pdf, "application/pdf")
        }
        if export_format not in generators:
            raise HTTPException(status_code=400, detail="Unsupported export format")

        generator, media_type = generators[export_format]
        file_content = generator(transcription, options.model_dump())
        filename = f"transcription_{transcription_id}.{export_format}"
        encoded_filename = quote(filename)

        return StreamingResponse(
            BytesIO(file_content),
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            }
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Transcription export error")


# =========================================
# AUDIO DOWNLOAD
# =========================================

@app.get("/transcriptions/{transcription_id}/download")
def download_transcription_audio(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        transcription = get_transcription(transcription_id, current_user["id"])
        if not transcription:
            raise HTTPException(status_code=404, detail="Transcription not found")

        storage_key = transcription.get("storage_key")
        if not storage_key:
            raise HTTPException(status_code=404, detail="Audio file not found")

        return {
            "filename": transcription["filename"],
            "download_url": generate_download_url(storage_key, expiration=3600),
            "expires_in": 3600
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Audio download error")


# =========================================
# DELETE TRANSCRIPTION
# =========================================

@app.delete("/transcriptions/{transcription_id}")
def remove_transcription(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        transcription = get_transcription(transcription_id, current_user["id"])
        if not transcription:
            raise HTTPException(status_code=404, detail="Transcription not found")

        storage_key = transcription.get("storage_key")
        if storage_key:
            delete_audio(storage_key)

        delete_transcription(transcription_id, current_user["id"])
        return {
            "status": "deleted",
            "id": transcription_id,
            "filename": transcription["filename"]
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Transcription deletion error")
