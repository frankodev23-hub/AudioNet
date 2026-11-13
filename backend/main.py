import os
import asyncio
import tempfile
import httpx
import re
import time

from pathlib import Path
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
    Depends
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
    create_transcription,
    complete_transcription,
    fail_transcription,
    record_usage,
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

app = FastAPI(
    title="AudioNet API",
    description="Plataforma de transcripción de audio",
    version="1.3.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3200",
        "http://127.0.0.1:3200",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://musical-flan-ee1cd7.netlify.app"
    ],
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
# RESTAURACIÓN DE PUNTUACIÓN Y MAYÚSCULAS
# =====================================================

import threading

CAP_PUNCT_ENABLED = (
    os.getenv("CAP_PUNCT_ENABLED", "true").lower() == "true"
)

CAP_PUNCT_MODEL = "HiTZ/cap-punct-es"

_cap_punct_pipeline = None
_cap_punct_lock = threading.Lock()


def get_cap_punct_pipeline():
    global _cap_punct_pipeline

    if _cap_punct_pipeline is None:
        with _cap_punct_lock:
            if _cap_punct_pipeline is None:
                from transformers import pipeline

                print("Loading HiTZ Cap-Punct-ES model...")

                _cap_punct_pipeline = pipeline(
                    task="translation",
                    model=CAP_PUNCT_MODEL,
                    tokenizer=CAP_PUNCT_MODEL,
                    device=-1
                )

                print("Cap-Punct-ES model loaded successfully.")

    return _cap_punct_pipeline


def split_text_for_punctuation(
    text: str,
    max_chars: int = 1000
) -> list[str]:

    if not text:
        return []

    sentences = re.split(
        r'(?<=[.!?¿¡])\s+',
        text.strip()
    )

    chunks = []
    current = ""

    for sentence in sentences:

        sentence = sentence.strip()

        if not sentence:
            continue

        if len(sentence) > max_chars:

            if current:
                chunks.append(current)
                current = ""

            words = sentence.split()
            fragment = ""

            for word in words:

                candidate = (
                    f"{fragment} {word}".strip()
                )

                if len(candidate) > max_chars and fragment:
                    chunks.append(fragment)
                    fragment = word
                else:
                    fragment = candidate

            if fragment:
                current = fragment

            continue

        candidate = (
            f"{current} {sentence}".strip()
        )

        if len(candidate) > max_chars and current:
            chunks.append(current)
            current = sentence
        else:
            current = candidate

    if current:
        chunks.append(current)

    return chunks


def restore_punctuation(text: str) -> str:

    if not text or not text.strip():
        return text

    if not CAP_PUNCT_ENABLED:
        return text

    try:

        model = get_cap_punct_pipeline()

        chunks = split_text_for_punctuation(text)

        if not chunks:
            return text

        results = model(
            chunks,
            batch_size=4,
            truncation=True
        )

        corrected_chunks = [
            result.get("translation_text", "").strip()
            for result in results
        ]

        if (
            len(corrected_chunks) != len(chunks)
            or any(not chunk for chunk in corrected_chunks)
        ):
            print("Cap-Punct warning: incomplete result. Keeping original text.")
            return text

        return " ".join(corrected_chunks)

    except Exception as e:

        print(f"Cap-Punct warning: {e}")
        return text

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
        "version": "1.3.0"
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


# =====================================================
# RUNPOD
# =====================================================

async def execute_transcription(
    audio_url: str,
    language: str
):

    if not RUNPOD_API_KEY or not RUNPOD_ENDPOINT_ID:
        raise HTTPException(
            status_code=500,
            detail="Missing Runpod credentials"
        )

    headers = {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "input": {
            "audio_url": audio_url,
            "language": language
        }
    }

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

            if status in {
                "FAILED",
                "CANCELLED",
                "TIMED_OUT"
            }:
                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "Runpod transcription failed",
                        "result": result
                    }
                )

        raise HTTPException(
            status_code=504,
            detail="Transcription timeout"
        )


# =====================================================
# SUBIR Y TRANSCRIBIR
# =====================================================

@app.post("/upload-and-transcribe")
async def upload_and_transcribe(
    file: UploadFile = File(...),
    language: str = "es",
    current_user: dict = Depends(get_current_user)
):

    processing_start = time.perf_counter()

    user_id = current_user["id"]
    filename = file.filename or "audio"
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Audio format not allowed"
        )

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

        object_key = upload_audio(
            temp_path,
            filename
        )

        audio_url = generate_download_url(
            object_key,
            expiration=3600
        )

        output = await execute_transcription(
            audio_url,
            language
        )

        segments = output.get("segments", []) or []

        original_text = output.get("text", "") or ""

        transcript_text = await asyncio.to_thread(
            restore_punctuation,
            original_text
)

        audio_duration = float(output.get("duration") or 0)

        clean_text = transcript_text.strip()

        paragraph_count = len([
            paragraph
            for paragraph in re.split(r"\n\s*\n", clean_text)
            if paragraph.strip()
        ]) if clean_text else 0

        processing_time = (
            time.perf_counter() - processing_start
        )

        report = {
            "processing_time_seconds": round(
                processing_time,
                3
            ),
            "character_count": len(transcript_text),
            "character_count_no_whitespace": len(
                "".join(transcript_text.split())
            ),
            "word_count": len(transcript_text.split()),
            "paragraph_count": paragraph_count,
            "segment_count": len(segments),
            "processing_speed": (
                round(
                    audio_duration / processing_time,
                    2
                )
                if processing_time > 0 else 0
            )
        }

        save_segments(
            transcription_id,
            user_id,
            segments
        )

        completed_at = datetime.now(
            timezone.utc
        ).isoformat()

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

        error_message = (
            f"Runpod communication error: {e.response.text}"
        )

        if transcription_id:
            fail_transcription(
                transcription_id,
                user_id,
                error_message
            )

        raise HTTPException(
            status_code=502,
            detail=error_message
        )

    except HTTPException as e:

        if transcription_id:
            fail_transcription(
                transcription_id,
                user_id,
                str(e.detail)
            )

        raise

    except Exception as e:

        if transcription_id:
            try:
                fail_transcription(
                    transcription_id,
                    user_id,
                    str(e)
                )
            except Exception:
                pass

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    finally:

        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

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