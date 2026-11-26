import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client


# =====================================================
# CONFIGURACIÓN
# =====================================================

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing Supabase credentials")

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)


# =====================================================
# UTILIDADES
# =====================================================

def _first(data):
    return data[0] if data else None


def _require_user(user_id: str):
    if not user_id:
        raise ValueError("User ID is required")


def _get_owned_transcription(
    transcription_id: str,
    user_id: str,
    include_deleted: bool = False
):
    query = (
        supabase.table("transcriptions")
        .select("*")
        .eq("id", transcription_id)
        .eq("user_id", user_id)
    )

    if not include_deleted:
        query = query.eq("is_deleted", False)

    response = query.limit(1).execute()
    return _first(response.data)


def _get_next_version_number(transcription_id: str):
    response = (
        supabase.table("transcription_versions")
        .select("version_number")
        .eq("transcription_id", transcription_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        return 1

    return response.data[0]["version_number"] + 1


# =====================================================
# CONEXIÓN
# =====================================================

def test_connection():
    supabase.table("transcriptions").select("id").limit(1).execute()

    return {
        "connected": True,
        "message": "Supabase connection successful"
    }


# =====================================================
# TRANSCRIPCIONES
# =====================================================

def create_transcription(data: dict):
    if not data.get("user_id"):
        raise ValueError("User ID is required")

    response = (
        supabase.table("transcriptions")
        .insert(data)
        .execute()
    )

    return _first(response.data)


def complete_transcription(
    transcription_id: str,
    user_id: str,
    data: dict
):
    response = (
        supabase.table("transcriptions")
        .update(data)
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .execute()
    )

    return response.data


def fail_transcription(
    transcription_id: str,
    user_id: str,
    error: str
):
    response = (
        supabase.table("transcriptions")
        .update({
            "status": "failed",
            "error_message": error
        })
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("status", "processing")
        .eq("is_deleted", False)
        .execute()
    )

    return response.data


def save_segments(
    transcription_id: str,
    user_id: str,
    segments: list
):
    if not segments:
        return []

    owner = (
        supabase.table("transcriptions")
        .select("id")
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .limit(1)
        .execute()
    )

    if not owner.data:
        raise ValueError("Transcription not found")

    records = []

    for index, segment in enumerate(segments):
        records.append({
            "transcription_id": transcription_id,
            "segment_order": index,
            "start_time": segment.get("start", 0),
            "end_time": segment.get("end", 0),
            "text": segment.get("text", "")
        })

    response = (
        supabase.table("transcription_segments")
        .insert(records)
        .execute()
    )

    return response.data


def get_transcriptions(
    user_id: str,
    limit: int = 20,
    offset: int = 0,
    include_deleted: bool = False
):
    _require_user(user_id)

    query = (
        supabase.table("transcriptions")
        .select("*")
        .eq("user_id", user_id)
    )

    if not include_deleted:
        query = query.eq("is_deleted", False)

    response = (
        query
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return response.data


def get_transcription(
    transcription_id: str,
    user_id: str,
    include_deleted: bool = False
):
    transcription = _get_owned_transcription(
        transcription_id,
        user_id,
        include_deleted
    )

    if not transcription:
        return None

    segments_response = (
        supabase.table("transcription_segments")
        .select("*")
        .eq("transcription_id", transcription_id)
        .order("segment_order")
        .execute()
    )

    transcription["segments"] = segments_response.data

    tags_response = (
        supabase.table("transcription_tag_links")
        .select("tag_id, transcription_tags(*)")
        .eq("transcription_id", transcription_id)
        .execute()
    )

    transcription["tags"] = [
        item["transcription_tags"]
        for item in tags_response.data
        if item.get("transcription_tags")
    ]

    return transcription


def update_transcription_text(
    transcription_id: str,
    user_id: str,
    transcript_text: str
):
    response = (
        supabase.table("transcriptions")
        .update({
            "transcript_text": transcript_text
        })
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .execute()
    )

    return _first(response.data)


# =====================================================
# PAPELERA
# =====================================================

def delete_transcription(
    transcription_id: str,
    user_id: str
):
    """
    Mueve una transcripción a la papelera.
    No elimina permanentemente sus datos.
    """

    response = (
        supabase.table("transcriptions")
        .update({
            "is_deleted": True,
            "deleted_at": "now()"
        })
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .execute()
    )

    return response.data


def get_deleted_transcriptions(
    user_id: str,
    limit: int = 50,
    offset: int = 0
):
    _require_user(user_id)

    response = (
        supabase.table("transcriptions")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_deleted", True)
        .order("deleted_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return response.data


def restore_transcription(
    transcription_id: str,
    user_id: str
):
    response = (
        supabase.table("transcriptions")
        .update({
            "is_deleted": False,
            "deleted_at": None
        })
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("is_deleted", True)
        .execute()
    )

    return _first(response.data)


def permanently_delete_transcription(
    transcription_id: str,
    user_id: str
):
    """
    Elimina permanentemente una transcripción.
    Solo permite eliminar proyectos que estén en la papelera.
    """

    response = (
        supabase.table("transcriptions")
        .delete()
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("is_deleted", True)
        .execute()
    )

    return response.data


def empty_trash(user_id: str):
    """
    Vacía permanentemente la papelera del usuario.
    """

    _require_user(user_id)

    response = (
        supabase.table("transcriptions")
        .delete()
        .eq("user_id", user_id)
        .eq("is_deleted", True)
        .execute()
    )

    return response.data


# =====================================================
# CARPETAS
# =====================================================

def create_folder(
    user_id: str,
    name: str,
    description: str = None
):
    _require_user(user_id)

    name = name.strip()

    if not name:
        raise ValueError("Folder name is required")

    response = (
        supabase.table("transcription_folders")
        .insert({
            "user_id": user_id,
            "name": name,
            "description": description
        })
        .execute()
    )

    return _first(response.data)


def get_folders(user_id: str):
    _require_user(user_id)

    response = (
        supabase.table("transcription_folders")
        .select("*")
        .eq("user_id", user_id)
        .order("name")
        .execute()
    )

    return response.data


def update_folder(
    folder_id: str,
    user_id: str,
    name: str,
    description: str = None
):
    name = name.strip()

    if not name:
        raise ValueError("Folder name is required")

    response = (
        supabase.table("transcription_folders")
        .update({
            "name": name,
            "description": description
        })
        .eq("id", folder_id)
        .eq("user_id", user_id)
        .execute()
    )

    return _first(response.data)


def delete_folder(
    folder_id: str,
    user_id: str
):
    """
    Elimina la carpeta, pero conserva sus transcripciones.
    La FK configurada en Supabase deja folder_id en NULL.
    """

    response = (
        supabase.table("transcription_folders")
        .delete()
        .eq("id", folder_id)
        .eq("user_id", user_id)
        .execute()
    )

    return response.data


def move_transcription_to_folder(
    transcription_id: str,
    folder_id: str,
    user_id: str
):
    _require_user(user_id)

    if folder_id:
        folder = (
            supabase.table("transcription_folders")
            .select("id")
            .eq("id", folder_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not folder.data:
            raise ValueError("Folder not found")

    response = (
        supabase.table("transcriptions")
        .update({
            "folder_id": folder_id
        })
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .execute()
    )

    return _first(response.data)


def get_folder_transcriptions(
    folder_id: str,
    user_id: str,
    limit: int = 50,
    offset: int = 0
):
    response = (
        supabase.table("transcriptions")
        .select("*")
        .eq("folder_id", folder_id)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return response.data


# =====================================================
# CATEGORÍAS
# =====================================================

def create_category(
    user_id: str,
    name: str,
    color: str = "#64748b"
):
    _require_user(user_id)

    name = name.strip()

    if not name:
        raise ValueError("Category name is required")

    response = (
        supabase.table("transcription_categories")
        .insert({
            "user_id": user_id,
            "name": name,
            "color": color
        })
        .execute()
    )

    return _first(response.data)


def get_categories(user_id: str):
    _require_user(user_id)

    response = (
        supabase.table("transcription_categories")
        .select("*")
        .eq("user_id", user_id)
        .order("name")
        .execute()
    )

    return response.data


def update_category(
    category_id: str,
    user_id: str,
    name: str,
    color: str = "#64748b"
):
    response = (
        supabase.table("transcription_categories")
        .update({
            "name": name.strip(),
            "color": color
        })
        .eq("id", category_id)
        .eq("user_id", user_id)
        .execute()
    )

    return _first(response.data)


def delete_category(
    category_id: str,
    user_id: str
):
    response = (
        supabase.table("transcription_categories")
        .delete()
        .eq("id", category_id)
        .eq("user_id", user_id)
        .execute()
    )

    return response.data


def set_transcription_category(
    transcription_id: str,
    category_id: str,
    user_id: str
):
    _require_user(user_id)

    if category_id:
        category = (
            supabase.table("transcription_categories")
            .select("id")
            .eq("id", category_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not category.data:
            raise ValueError("Category not found")

    response = (
        supabase.table("transcriptions")
        .update({
            "category_id": category_id
        })
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .execute()
    )

    return _first(response.data)


# =====================================================
# ETIQUETAS
# =====================================================

def create_tag(
    user_id: str,
    name: str,
    color: str = "#64748b"
):
    _require_user(user_id)

    name = name.strip()

    if not name:
        raise ValueError("Tag name is required")

    response = (
        supabase.table("transcription_tags")
        .insert({
            "user_id": user_id,
            "name": name,
            "color": color
        })
        .execute()
    )

    return _first(response.data)


def get_tags(user_id: str):
    _require_user(user_id)

    response = (
        supabase.table("transcription_tags")
        .select("*")
        .eq("user_id", user_id)
        .order("name")
        .execute()
    )

    return response.data


def update_tag(
    tag_id: str,
    user_id: str,
    name: str,
    color: str = "#64748b"
):
    response = (
        supabase.table("transcription_tags")
        .update({
            "name": name.strip(),
            "color": color
        })
        .eq("id", tag_id)
        .eq("user_id", user_id)
        .execute()
    )

    return _first(response.data)


def delete_tag(
    tag_id: str,
    user_id: str
):
    response = (
        supabase.table("transcription_tags")
        .delete()
        .eq("id", tag_id)
        .eq("user_id", user_id)
        .execute()
    )

    return response.data


def add_tag_to_transcription(
    transcription_id: str,
    tag_id: str,
    user_id: str
):
    transcription = _get_owned_transcription(
        transcription_id,
        user_id
    )

    if not transcription:
        raise ValueError("Transcription not found")

    tag = (
        supabase.table("transcription_tags")
        .select("id")
        .eq("id", tag_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not tag.data:
        raise ValueError("Tag not found")

    response = (
        supabase.table("transcription_tag_links")
        .upsert(
            {
                "transcription_id": transcription_id,
                "tag_id": tag_id
            },
            on_conflict="transcription_id,tag_id"
        )
        .execute()
    )

    return _first(response.data)


def remove_tag_from_transcription(
    transcription_id: str,
    tag_id: str,
    user_id: str
):
    transcription = _get_owned_transcription(
        transcription_id,
        user_id,
        include_deleted=True
    )

    if not transcription:
        raise ValueError("Transcription not found")

    response = (
        supabase.table("transcription_tag_links")
        .delete()
        .eq("transcription_id", transcription_id)
        .eq("tag_id", tag_id)
        .execute()
    )

    return response.data


# =====================================================
# DUPLICAR PROYECTOS
# =====================================================

def duplicate_transcription(
    transcription_id: str,
    user_id: str,
    new_title: str = None
):
    """
    Crea una copia independiente de la transcripción
    y sus segmentos.
    """

    original = get_transcription(
        transcription_id,
        user_id
    )

    if not original:
        raise ValueError("Transcription not found")

    duplicate_data = {
        key: value
        for key, value in original.items()
        if key not in {
            "id",
            "created_at",
            "updated_at",
            "deleted_at",
            "is_deleted",
            "segments",
            "tags"
        }
    }

    duplicate_data["user_id"] = user_id
    duplicate_data["is_deleted"] = False
    duplicate_data["deleted_at"] = None

    duplicate_data["filename"] = (new_title or "").strip() or f"Copia de {original['filename']}"

    duplicate_data["folder_id"] = original.get("folder_id")
    duplicate_data["category_id"] = original.get("category_id")

    new_transcription = create_transcription(
        duplicate_data
    )

    if not new_transcription:
        raise RuntimeError("Could not duplicate transcription")

    new_id = new_transcription["id"]

    original_segments = original.get("segments", [])

    if original_segments:
        new_segments = []

        for segment in original_segments:
            new_segments.append({
                "transcription_id": new_id,
                "segment_order": segment.get("segment_order", 0),
                "start_time": segment.get("start_time", 0),
                "end_time": segment.get("end_time", 0),
                "text": segment.get("text", "")
            })

        supabase.table("transcription_segments").insert(
            new_segments
        ).execute()

    original_tags = original.get("tags", [])

    for tag in original_tags:
        add_tag_to_transcription(
            new_id,
            tag["id"],
            user_id
        )

    return get_transcription(new_id, user_id)


# =====================================================
# HISTORIAL DE VERSIONES
# =====================================================

def get_transcription_versions(
    transcription_id: str,
    user_id: str
):
    transcription = _get_owned_transcription(
        transcription_id,
        user_id,
        include_deleted=True
    )

    if not transcription:
        return None

    response = (
        supabase.table("transcription_versions")
        .select("*")
        .eq("transcription_id", transcription_id)
        .eq("user_id", user_id)
        .order("version_number", desc=True)
        .execute()
    )

    return response.data


def get_transcription_version(
    version_id: str,
    user_id: str
):
    response = (
        supabase.table("transcription_versions")
        .select("*")
        .eq("id", version_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    return _first(response.data)


def restore_transcription_version(
    transcription_id: str,
    version_id: str,
    user_id: str
):
    """
    Restaura una versión anterior.
    El trigger guarda automáticamente el texto actual
    antes de reemplazarlo.
    """

    transcription = _get_owned_transcription(
        transcription_id,
        user_id
    )

    if not transcription:
        raise ValueError("Transcription not found")

    version = (
        supabase.table("transcription_versions")
        .select("*")
        .eq("id", version_id)
        .eq("transcription_id", transcription_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not version.data:
        raise ValueError("Version not found")

    return update_transcription_text(
        transcription_id,
        user_id,
        version.data[0]["transcript_text"]
    )


def compare_transcription_versions(
    transcription_id: str,
    version_a_id: str,
    version_b_id: str,
    user_id: str
):
    """
    Devuelve los textos de dos versiones para que
    el frontend pueda compararlos.
    """

    transcription = _get_owned_transcription(
        transcription_id,
        user_id,
        include_deleted=True
    )

    if not transcription:
        raise ValueError("Transcription not found")

    versions = (
        supabase.table("transcription_versions")
        .select("*")
        .eq("transcription_id", transcription_id)
        .eq("user_id", user_id)
        .in_("id", [version_a_id, version_b_id])
        .execute()
    )

    if len(versions.data) != 2:
        raise ValueError("One or both versions were not found")

    return {
        "version_a": next(
            item for item in versions.data
            if item["id"] == version_a_id
        ),
        "version_b": next(
            item for item in versions.data
            if item["id"] == version_b_id
        )
    }


# =====================================================
# USO Y CONSUMO
# =====================================================

def record_usage(
    user_id: str,
    transcription_id: str,
    duration_seconds: float
):
    if not user_id or not transcription_id:
        raise ValueError(
            "User ID and transcription ID are required"
        )

    duration = max(float(duration_seconds), 0)

    response = (
        supabase.table("usage_records")
        .upsert(
            {
                "user_id": user_id,
                "transcription_id": transcription_id,
                "duration_seconds": duration
            },
            on_conflict="transcription_id"
        )
        .execute()
    )

    return _first(response.data)


def get_user_usage(user_id: str):
    response = supabase.rpc(
        "get_user_usage",
        {
            "target_user_id": user_id
        }
    ).execute()

    if not response.data:
        return {
            "total_seconds": 0,
            "total_minutes": 0,
            "current_month_seconds": 0,
            "transcription_count": 0
        }

    return response.data[0]

def register_transcription_job(transcription_id, user_id, provider_job_id, storage_key):
    return supabase.rpc("register_transcription_job", {
        "p_transcription_id": transcription_id,
        "p_user_id": user_id,
        "p_provider_job_id": provider_job_id,
        "p_storage_key": storage_key,
    }).execute().data


def claim_transcription_jobs():
    return supabase.rpc("claim_transcription_jobs").execute().data


def finish_transcription_job(job, result=None, segments=None, error=None):
    return supabase.rpc("finish_transcription_job", {
        "p_transcription_id": job["transcription_id"],
        "p_claim_until": job["next_poll_at"],
        "p_result": result,
        "p_segments": [] if segments is None else segments,
        "p_error": error,
    }).execute().data
