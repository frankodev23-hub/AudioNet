import asyncio
import logging
import math
import os
import re
import tempfile
import time

import httpx

import credits

from pathlib import Path
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from io import BytesIO
from urllib.parse import quote

from dotenv import load_dotenv

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
    Query,
    Depends,
    Response,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel, Field

from exports import generate_txt, generate_docx, generate_pdf

from storage import (
    upload_audio,
    generate_download_url,
    delete_audio
)

from database import (
    supabase,
    create_transcription,
    complete_transcription,
    fail_transcription,
    record_usage,
    register_transcription_job,
    claim_transcription_jobs,
    finish_transcription_job,
    get_user_usage,
    save_segments,
    get_transcriptions,
    get_transcription,
    delete_transcription,
    update_transcription_text,

    # Carpetas
    create_folder,
    get_folders,
    update_folder,
    delete_folder,
    move_transcription_to_folder,
    get_folder_transcriptions,

    # Categorías
    create_category,
    get_categories,
    update_category,
    delete_category,
    set_transcription_category,

    # Etiquetas
    create_tag,
    get_tags,
    update_tag,
    delete_tag,
    add_tag_to_transcription,
    remove_tag_from_transcription,

    # Duplicación
    duplicate_transcription,

    # Versiones
    get_transcription_versions,
    get_transcription_version,
    restore_transcription_version,
    compare_transcription_versions,

    # Papelera
    get_deleted_transcriptions,
    restore_transcription,
    permanently_delete_transcription,
    empty_trash
)


# =====================================================
# CONFIGURACIÓN
# =====================================================

load_dotenv(Path(__file__).parent / ".env")

ASYNC_JOBS_ENABLED = os.getenv("AUDIONET_ASYNC_JOBS", "false").lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not ASYNC_JOBS_ENABLED:
        yield
        return

    async with httpx.AsyncClient(timeout=12) as client:
        task = asyncio.create_task(poll_transcription_jobs(client))
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(
    title="AudioNet API",
    description="Plataforma de transcripción de audio",
    version="1.5.0",
    lifespan=lifespan,
)

logger = logging.getLogger(__name__)

DEFAULT_CORS_ORIGINS = (
    "http://localhost:3200,http://127.0.0.1:3200,"
    "http://localhost:3000,http://127.0.0.1:3000,"
    "https://musical-flan-ee1cd7.netlify.app"
)
CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(512 * 1024 * 1024)))
if MAX_AUDIO_BYTES <= 0:
    raise RuntimeError("MAX_AUDIO_BYTES must be a positive integer")


ALLOWED_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".m4a",
    ".flac",
    ".ogg",
    ".mp4"
}

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

RUNPOD_BASE_URL = (
    f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}"
)

security = HTTPBearer(auto_error=False)


# =====================================================
# MODELOS
# =====================================================

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str


class TranscriptionUpdate(BaseModel):
    transcript_text: str


class FolderCreate(BaseModel):
    name: str
    description: str | None = None


class FolderUpdate(BaseModel):
    name: str
    description: str | None = None


class CategoryCreate(BaseModel):
    name: str
    color: str = "#64748b"


class CategoryUpdate(BaseModel):
    name: str
    color: str = "#64748b"


class TagCreate(BaseModel):
    name: str
    color: str = "#64748b"


class TagUpdate(BaseModel):
    name: str
    color: str = "#64748b"


class MoveFolderRequest(BaseModel):
    folder_id: str | None = None


class SetCategoryRequest(BaseModel):
    category_id: str | None = None


class AddTagRequest(BaseModel):
    tag_id: str


class DuplicateRequest(BaseModel):
    title: str | None = None


class RestoreVersionRequest(BaseModel):
    version_id: str


class CompareVersionsRequest(BaseModel):
    version_a_id: str
    version_b_id: str


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


# =====================================================
# AUTENTICACIÓN
# =====================================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

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

            if response.status_code >= 500 or response.status_code == 429:
                raise HTTPException(
                    status_code=503,
                    detail="Authentication service unavailable"
                )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or expired session"
                )

            user = response.json()

            if not user.get("id"):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid user session"
                )

            try:
                blocked = await asyncio.to_thread(
                    lambda: supabase.rpc(
                        "an_customer_blocked", {"p_target": user["id"]}
                    ).execute().data
                )
            except Exception as error:
                raise HTTPException(
                    status_code=503, detail="Account status temporarily unavailable"
                ) from error

            if blocked is not False:
                raise HTTPException(status_code=403, detail="AudioNet account blocked")

            return user

    except HTTPException:
        raise

    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable"
        )


# =====================================================
# AUTENTICACIÓN - ENDPOINTS
# =====================================================

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
                json={
                    "email": data.email,
                    "password": data.password
                }
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
        "data": {
            "full_name": data.full_name.strip()
        }
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


app.include_router(credits.build_credits_router(get_current_user))


@app.get("/auth/me")
async def get_me(
    current_user: dict = Depends(get_current_user)
):
    return {
        "id": current_user["id"],
        "email": current_user.get("email")
    }


@app.get("/usage/me")
def my_usage(
    current_user: dict = Depends(get_current_user)
):
    try:
        return get_user_usage(current_user["id"])

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Usage retrieval error"
        )


# =====================================================
# GENERAL
# =====================================================

@app.get("/")
def home():
    return {
        "application": "AudioNet",
        "status": "online",
        "version": app.version
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


# =====================================================
# RUNPOD
# =====================================================

def runpod_headers():
    if not RUNPOD_API_KEY or not RUNPOD_ENDPOINT_ID:
        raise HTTPException(status_code=500, detail="Missing Runpod credentials")
    return {"Authorization": f"Bearer {RUNPOD_API_KEY}"}


async def submit_runpod_job(client, audio_url, language):
    response = await client.post(
        f"{RUNPOD_BASE_URL}/run",
        json={"input": {"audio_url": audio_url, "language": language}},
        headers=runpod_headers(),
    )
    response.raise_for_status()
    job_id = response.json()["id"]
    if not isinstance(job_id, str) or not job_id:
        raise ValueError("Missing Runpod job ID")
    return job_id


async def execute_transcription(audio_url: str, language: str):
    async with httpx.AsyncClient(timeout=60) as client:
        job_id = await submit_runpod_job(client, audio_url, language)

        for _ in range(1800):

            await asyncio.sleep(2)

            status_response = await client.get(
                f"{RUNPOD_BASE_URL}/status/{quote(job_id, safe='')}",
                headers=runpod_headers()
            )

            status_response.raise_for_status()

            result = status_response.json()
            status = result.get("status")

            if status == "COMPLETED":
                return result.get("output", {})

            if status in {
                "FAILED",
                "CANCELLED",
                "TIMED_OUT"
            }:
                logger.warning("RunPod job %s ended with status %s", job_id, status)
                raise HTTPException(
                    status_code=502,
                    detail="Transcription provider could not process the audio"
                )

        raise HTTPException(
            status_code=504,
            detail="Transcription timeout"
        )


# =====================================================
# SUBIR Y TRANSCRIBIR
# =====================================================

def transcription_result(output, processing_time):
    if not isinstance(output, dict) or output.get("error"):
        raise ValueError("Transcription provider returned an error")
    segments = output.get("segments") or []
    transcript_text = output.get("text") or ""
    if not transcript_text.strip() and segments:
        segment_texts = ((segment.get("text") or "").strip() for segment in segments)
        transcript_text = " ".join(text for text in segment_texts if text)
    audio_duration = float(output.get("duration") or 0)
    if not math.isfinite(audio_duration) or audio_duration < 0:
        raise ValueError("Invalid audio duration")

    report = {
        "processing_time_seconds": round(processing_time, 3),
        "character_count": len(transcript_text),
        "character_count_no_whitespace": len("".join(transcript_text.split())),
        "word_count": len(transcript_text.split()),
        "paragraph_count": sum(bool(paragraph.strip()) for paragraph in re.split(r"\n\s*\n", transcript_text)),
        "segment_count": len(segments),
        "processing_speed": round(audio_duration / processing_time, 2) if processing_time > 0 else 0,
    }
    return {
        "language": output.get("language"),
        "duration": audio_duration,
        "transcript_text": transcript_text,
        **report,
    }, segments, report


async def poll_transcription_job(client, job):
    try:
        job_id = quote(job["provider_job_id"], safe="")
        response = await client.get(f"{RUNPOD_BASE_URL}/status/{job_id}", headers=runpod_headers())
        if response.status_code == 404:
            await asyncio.to_thread(finish_transcription_job, job, error="Runpod job expired or was removed")
            return
        response.raise_for_status()
        data = response.json()
        status = data.get("status")
        if status == "COMPLETED":
            try:
                elapsed = (float(data.get("delayTime") or 0) + float(data.get("executionTime") or 0)) / 1000
                result, segments, _ = transcription_result(data["output"], elapsed)
                if not isinstance(segments, list) or any(not isinstance(segment, dict) for segment in segments):
                    raise ValueError("Invalid segments")
                for segment in segments:
                    if any(not math.isfinite(float(segment.get(field) or 0)) for field in ("start", "end")):
                        raise ValueError("Invalid segment time")
            except (AttributeError, KeyError, TypeError, ValueError):
                await asyncio.to_thread(finish_transcription_job, job, error="Invalid transcription result")
                return
            await asyncio.to_thread(finish_transcription_job, job, result, segments)
        elif status in {"FAILED", "CANCELLED", "TIMED_OUT"}:
            await asyncio.to_thread(
                finish_transcription_job, job, error="Transcription provider could not process the audio"
            )
    except Exception as error:
        logger.warning("Could not check transcription %s (%s)", job["transcription_id"], type(error).__name__)


async def poll_transcription_jobs(client):
    next_cleanup = 0.0
    while True:
        try:
            if credits.CREDITS_MODE != "disabled" and time.monotonic() >= next_cleanup:
                next_cleanup = time.monotonic() + 300
                await asyncio.to_thread(credits.expire_unsubmitted)
            jobs = await asyncio.to_thread(claim_transcription_jobs)
            await asyncio.gather(*(poll_transcription_job(client, job) for job in jobs))
        except Exception as error:
            logger.warning("Could not check pending transcriptions (%s)", type(error).__name__)
        await asyncio.sleep(5)


@app.post("/upload-and-transcribe")
async def upload_and_transcribe(
    response: Response,
    file: UploadFile = File(...),
    language: str = "es",
    background: bool = False,
    current_user: dict = Depends(get_current_user)
):

    processing_start = time.perf_counter()

    user_id = current_user["id"]
    filename = file.filename or "audio"
    extension = Path(filename).suffix.lower()

    temp_path = None
    transcription_id = None
    object_key = None
    provider_submission_started = False

    try:
        if credits.CREDITS_MODE != "disabled":
            background = True
        if background and not ASYNC_JOBS_ENABLED:
            raise HTTPException(status_code=503, detail="Background transcription is disabled")

        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Audio format not allowed")

        if file.size is not None and file.size > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio file exceeds the size limit")

        audio_bytes = 0
        with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as temp_file:
            temp_path = temp_file.name
            while chunk := await file.read(1024 * 1024):
                audio_bytes += len(chunk)
                if audio_bytes > MAX_AUDIO_BYTES:
                    raise HTTPException(status_code=413, detail="Audio file exceeds the size limit")
                await asyncio.to_thread(temp_file.write, chunk)

        if audio_bytes == 0:
            raise HTTPException(status_code=400, detail="Audio file is empty")

        if credits.CREDITS_MODE != "disabled":
            seconds = await asyncio.to_thread(credits.measure_audio_seconds, temp_path)
            transcription_id = await asyncio.to_thread(
                credits.reserve_transcription, user_id, filename, language, seconds,
            )
            if not transcription_id:
                raise HTTPException(status_code=402, detail="Insufficient credit balance")
        else:
            transcription = await asyncio.to_thread(create_transcription, {
                "user_id": user_id,
                "filename": filename,
                "language": language,
                "status": "processing"
            })
            transcription_id = transcription["id"]

        object_key = await asyncio.to_thread(upload_audio, temp_path, filename)

        audio_url = generate_download_url(
            object_key,
            expiration=21600 if background else 3600,
        )

        try:
            if background:
                async with httpx.AsyncClient(timeout=20) as client:
                    provider_submission_started = True
                    job_id = await submit_runpod_job(client, audio_url, language)
            else:
                output = await execute_transcription(audio_url, language)
        except httpx.HTTPError as error:
            status = error.response.status_code if isinstance(error, httpx.HTTPStatusError) else None
            logger.warning(
                "RunPod request failed for transcription %s (%s, status %s)",
                transcription_id, type(error).__name__, status,
            )
            raise HTTPException(status_code=502, detail="Transcription provider unavailable") from None

        if background:
            registered = await asyncio.to_thread(
                register_transcription_job, transcription_id, user_id, job_id, object_key,
            )
            if not registered:
                raise HTTPException(status_code=409, detail="Transcription is no longer active")
            response.status_code = 202
            response.headers["Location"] = f"/transcriptions/{transcription_id}"
            return {"id": transcription_id, "status": "processing", "filename": filename}

        result, segments, report = transcription_result(output, time.perf_counter() - processing_start)
        audio_duration = result["duration"]
        transcript_text = result["transcript_text"]

        await asyncio.to_thread(
            save_segments,
            transcription_id,
            user_id,
            segments
        )

        completed_at = datetime.now(
            timezone.utc
        ).isoformat()

        completed = await asyncio.to_thread(
            complete_transcription,
            transcription_id,
            user_id,
            {
                "storage_key": object_key,
                **result,
                "status": "completed",
                "completed_at": completed_at,
            }
        )

        if not completed:
            raise HTTPException(status_code=409, detail="Transcription is no longer active")

        await asyncio.to_thread(
            record_usage,
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

    except (Exception, asyncio.CancelledError) as error:
        if isinstance(error, HTTPException):
            public_error = error
        else:
            logger.error(
                "Transcription %s failed (%s)",
                transcription_id, type(error).__name__,
            )
            public_error = HTTPException(status_code=500, detail="Could not process the audio")

        if transcription_id:
            try:
                await asyncio.to_thread(
                    fail_transcription,
                    transcription_id,
                    user_id,
                    public_error.detail,
                )
            except Exception as persistence_error:
                logger.error(
                    "Could not record failure for transcription %s (%s)",
                    transcription_id, type(persistence_error).__name__,
                )

        if object_key and not provider_submission_started and background:
            try:
                await asyncio.to_thread(delete_audio, object_key)
            except Exception:
                logger.warning("Could not remove audio for failed upload %s", transcription_id)

        if public_error is error or isinstance(error, asyncio.CancelledError):
            raise
        raise public_error from None

    finally:
        try:
            if temp_path:
                Path(temp_path).unlink(missing_ok=True)
        finally:
            await file.close()


# =====================================================
# HISTORIAL DE TRANSCRIPCIONES
# =====================================================

@app.get("/transcriptions")
def list_transcriptions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user)
):

    try:

        records = get_transcriptions(
            current_user["id"],
            limit,
            offset
        )

        return {
            "total": len(records),
            "limit": limit,
            "offset": offset,
            "transcriptions": records
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="History retrieval error"
        )


# =====================================================
# PAPELERA
# IMPORTANTE: estas rutas deben estar antes de
# /transcriptions/{transcription_id}
# =====================================================

@app.get("/transcriptions/trash")
def list_trash(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user)
):

    try:

        records = get_deleted_transcriptions(
            current_user["id"],
            limit,
            offset
        )

        return {
            "total": len(records),
            "transcriptions": records
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Trash retrieval error"
        )


@app.post("/transcriptions/trash/empty")
def clear_trash(
    current_user: dict = Depends(get_current_user)
):

    try:

        deleted = get_deleted_transcriptions(
            current_user["id"],
            limit=100
        )

        for transcription in deleted:
            storage_key = transcription.get("storage_key")

            if storage_key:
                delete_audio(storage_key)

        result = empty_trash(current_user["id"])

        return {
            "status": "emptied",
            "deleted_count": len(result)
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not empty trash"
        )


@app.post("/transcriptions/{transcription_id}/restore")
def restore_project(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = restore_transcription(
            transcription_id,
            current_user["id"]
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Deleted transcription not found"
            )

        return {
            "status": "restored",
            "transcription": result
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not restore transcription"
        )


@app.delete("/transcriptions/{transcription_id}/permanent")
def permanently_delete_project(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        transcription = get_transcription(
            transcription_id,
            current_user["id"],
            include_deleted=True
        )

        if not transcription or not transcription.get("is_deleted"):
            raise HTTPException(
                status_code=404,
                detail="Transcription not found in trash"
            )

        storage_key = transcription.get("storage_key")

        result = permanently_delete_transcription(
            transcription_id,
            current_user["id"]
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Could not delete transcription"
            )

        if storage_key:
            delete_audio(storage_key)

        return {
            "status": "permanently_deleted",
            "id": transcription_id
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Permanent deletion error"
        )


# =====================================================
# CARPETAS
# =====================================================

@app.get("/folders")
def list_folders(
    current_user: dict = Depends(get_current_user)
):

    try:
        return {
            "folders": get_folders(current_user["id"])
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Folder retrieval error"
        )


@app.post("/folders")
def add_folder(
    data: FolderCreate,
    current_user: dict = Depends(get_current_user)
):

    try:

        folder = create_folder(
            current_user["id"],
            data.name,
            data.description
        )

        return {
            "status": "created",
            "folder": folder
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Folder creation error"
        )


@app.patch("/folders/{folder_id}")
def edit_folder(
    folder_id: str,
    data: FolderUpdate,
    current_user: dict = Depends(get_current_user)
):

    try:

        folder = update_folder(
            folder_id,
            current_user["id"],
            data.name,
            data.description
        )

        if not folder:
            raise HTTPException(
                status_code=404,
                detail="Folder not found"
            )

        return {
            "status": "updated",
            "folder": folder
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Folder update error"
        )


@app.delete("/folders/{folder_id}")
def remove_folder(
    folder_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = delete_folder(
            folder_id,
            current_user["id"]
        )

        return {
            "status": "deleted",
            "deleted": result
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Folder deletion error"
        )


@app.get("/folders/{folder_id}/transcriptions")
def list_folder_transcriptions(
    folder_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user)
):

    try:

        records = get_folder_transcriptions(
            folder_id,
            current_user["id"],
            limit,
            offset
        )

        return {
            "total": len(records),
            "transcriptions": records
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Folder transcription retrieval error"
        )


@app.patch("/transcriptions/{transcription_id}/folder")
def move_to_folder(
    transcription_id: str,
    data: MoveFolderRequest,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = move_transcription_to_folder(
            transcription_id,
            data.folder_id,
            current_user["id"]
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        return {
            "status": "moved",
            "transcription": result
        }

    except HTTPException:
        raise

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not move transcription"
        )


# =====================================================
# CATEGORÍAS
# =====================================================

@app.get("/categories")
def list_categories(
    current_user: dict = Depends(get_current_user)
):

    try:
        return {
            "categories": get_categories(current_user["id"])
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Category retrieval error"
        )


@app.post("/categories")
def add_category(
    data: CategoryCreate,
    current_user: dict = Depends(get_current_user)
):

    try:

        category = create_category(
            current_user["id"],
            data.name,
            data.color
        )

        return {
            "status": "created",
            "category": category
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Category creation error"
        )


@app.patch("/categories/{category_id}")
def edit_category(
    category_id: str,
    data: CategoryUpdate,
    current_user: dict = Depends(get_current_user)
):

    try:

        category = update_category(
            category_id,
            current_user["id"],
            data.name,
            data.color
        )

        if not category:
            raise HTTPException(
                status_code=404,
                detail="Category not found"
            )

        return {
            "status": "updated",
            "category": category
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Category update error"
        )


@app.delete("/categories/{category_id}")
def remove_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = delete_category(
            category_id,
            current_user["id"]
        )

        return {
            "status": "deleted",
            "deleted": result
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Category deletion error"
        )


@app.patch("/transcriptions/{transcription_id}/category")
def assign_category(
    transcription_id: str,
    data: SetCategoryRequest,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = set_transcription_category(
            transcription_id,
            data.category_id,
            current_user["id"]
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        return {
            "status": "updated",
            "transcription": result
        }

    except HTTPException:
        raise

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Category assignment error"
        )


# =====================================================
# ETIQUETAS
# =====================================================

@app.get("/tags")
def list_tags(
    current_user: dict = Depends(get_current_user)
):

    try:
        return {
            "tags": get_tags(current_user["id"])
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Tag retrieval error"
        )


@app.post("/tags")
def add_tag(
    data: TagCreate,
    current_user: dict = Depends(get_current_user)
):

    try:

        tag = create_tag(
            current_user["id"],
            data.name,
            data.color
        )

        return {
            "status": "created",
            "tag": tag
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Tag creation error"
        )


@app.patch("/tags/{tag_id}")
def edit_tag(
    tag_id: str,
    data: TagUpdate,
    current_user: dict = Depends(get_current_user)
):

    try:

        tag = update_tag(
            tag_id,
            current_user["id"],
            data.name,
            data.color
        )

        if not tag:
            raise HTTPException(
                status_code=404,
                detail="Tag not found"
            )

        return {
            "status": "updated",
            "tag": tag
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Tag update error"
        )


@app.delete("/tags/{tag_id}")
def remove_tag(
    tag_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = delete_tag(
            tag_id,
            current_user["id"]
        )

        return {
            "status": "deleted",
            "deleted": result
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Tag deletion error"
        )


@app.post("/transcriptions/{transcription_id}/tags")
def assign_tag(
    transcription_id: str,
    data: AddTagRequest,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = add_tag_to_transcription(
            transcription_id,
            data.tag_id,
            current_user["id"]
        )

        return {
            "status": "assigned",
            "tag": result
        }

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Tag assignment error"
        )


@app.delete("/transcriptions/{transcription_id}/tags/{tag_id}")
def unassign_tag(
    transcription_id: str,
    tag_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = remove_tag_from_transcription(
            transcription_id,
            tag_id,
            current_user["id"]
        )

        return {
            "status": "removed",
            "deleted": result
        }

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Tag removal error"
        )


# =====================================================
# DUPLICAR PROYECTOS
# =====================================================

@app.post("/transcriptions/{transcription_id}/duplicate")
def duplicate_project(
    transcription_id: str,
    data: DuplicateRequest,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = duplicate_transcription(
            transcription_id,
            current_user["id"],
            data.title
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        return {
            "status": "duplicated",
            "transcription": result
        }

    except HTTPException:
        raise

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not duplicate transcription"
        )


# =====================================================
# HISTORIAL DE VERSIONES
# =====================================================

@app.get("/transcriptions/{transcription_id}/versions")
def list_versions(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        versions = get_transcription_versions(
            transcription_id,
            current_user["id"]
        )

        if versions is None:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        return {
            "versions": versions,
            "total": len(versions)
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Version history retrieval error"
        )


@app.get("/transcriptions/{transcription_id}/versions/{version_id}")
def version_detail(
    transcription_id: str,
    version_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        version = get_transcription_version(
            version_id,
            current_user["id"]
        )

        if (
            not version
            or version.get("transcription_id") != transcription_id
        ):
            raise HTTPException(
                status_code=404,
                detail="Version not found"
            )

        return version

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Version retrieval error"
        )


@app.post("/transcriptions/{transcription_id}/versions/compare")
def compare_versions(
    transcription_id: str,
    data: CompareVersionsRequest,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = compare_transcription_versions(
            transcription_id,
            data.version_a_id,
            data.version_b_id,
            current_user["id"]
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        return result

    except HTTPException:
        raise

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Version comparison error"
        )


@app.post("/transcriptions/{transcription_id}/versions/restore")
def restore_version(
    transcription_id: str,
    data: RestoreVersionRequest,
    current_user: dict = Depends(get_current_user)
):

    try:

        result = restore_transcription_version(
            transcription_id,
            data.version_id,
            current_user["id"]
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Version or transcription not found"
            )

        return {
            "status": "restored",
            "transcription": result
        }

    except HTTPException:
        raise

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Version restoration error"
        )


# =====================================================
# DETALLE DE TRANSCRIPCIÓN
# =====================================================

@app.get("/transcriptions/{transcription_id}")
def transcription_detail(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        transcription = get_transcription(
            transcription_id,
            current_user["id"]
        )

        if not transcription:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        return transcription

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Transcription retrieval error"
        )


# =====================================================
# ACTUALIZAR TRANSCRIPCIÓN
# =====================================================

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
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        return {
            "status": "updated",
            "transcription": transcription
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Transcription update error"
        )


# =====================================================
# EXPORTAR TRANSCRIPCIÓN
# =====================================================

@app.post("/transcriptions/{transcription_id}/export")
def export_transcription(
    transcription_id: str,
    options: ExportOptions,
    current_user: dict = Depends(get_current_user)
):

    try:

        transcription = get_transcription(
            transcription_id,
            current_user["id"]
        )

        if not transcription:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        if transcription.get("status") != "completed":
            raise HTTPException(
                status_code=400,
                detail="Transcription is not completed"
            )

        export_format = options.format.lower().strip()

        generators = {
            "txt": (
                generate_txt,
                "text/plain; charset=utf-8"
            ),
            "docx": (
                generate_docx,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "pdf": (
                generate_pdf,
                "application/pdf"
            )
        }

        if export_format not in generators:
            raise HTTPException(
                status_code=400,
                detail="Unsupported export format"
            )

        generator, media_type = generators[export_format]

        file_content = generator(
            transcription,
            options.model_dump()
        )

        filename = (
            f"transcription_{transcription_id}.{export_format}"
        )

        encoded_filename = quote(filename)

        return StreamingResponse(
            BytesIO(file_content),
            media_type=media_type,
            headers={
                "Content-Disposition": (
                    f"attachment; filename*=UTF-8''{encoded_filename}"
                )
            }
        )

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Transcription export error"
        )


# =====================================================
# DESCARGAR AUDIO
# =====================================================

@app.get("/transcriptions/{transcription_id}/download")
def download_transcription_audio(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        transcription = get_transcription(
            transcription_id,
            current_user["id"]
        )

        if not transcription:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        storage_key = transcription.get("storage_key")

        if not storage_key:
            raise HTTPException(
                status_code=404,
                detail="Audio file not found"
            )

        return {
            "filename": transcription["filename"],
            "download_url": generate_download_url(
                storage_key,
                expiration=3600
            ),
            "expires_in": 3600
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Audio download error"
        )


# =====================================================
# ENVIAR A PAPELERA
# =====================================================

@app.delete("/transcriptions/{transcription_id}")
def remove_transcription(
    transcription_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:

        transcription = get_transcription(
            transcription_id,
            current_user["id"]
        )

        if not transcription:
            raise HTTPException(
                status_code=404,
                detail="Transcription not found"
            )

        if transcription["status"] == "processing" and credits.CREDITS_MODE != "disabled":
            raise HTTPException(status_code=409, detail="Wait for transcription to finish before deleting it")

        result = delete_transcription(
            transcription_id,
            current_user["id"]
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Could not move transcription to trash"
            )

        return {
            "status": "moved_to_trash",
            "id": transcription_id,
            "filename": transcription["filename"]
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Transcription deletion error"
        )