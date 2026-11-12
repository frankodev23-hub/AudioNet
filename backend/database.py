import os

from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing Supabase credentials")

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)


def test_connection():
    supabase.table("transcriptions").select("id").limit(1).execute()

    return {
        "connected": True,
        "message": "Supabase connection successful"
    }


def create_transcription(data: dict):
    if not data.get("user_id"):
        raise ValueError("User ID is required")

    response = (
        supabase
        .table("transcriptions")
        .insert(data)
        .execute()
    )

    return response.data[0]


def complete_transcription(
    transcription_id: str,
    user_id: str,
    data: dict
):
    response = (
        supabase
        .table("transcriptions")
        .update(data)
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .execute()
    )

    return response.data


def fail_transcription(
    transcription_id: str,
    user_id: str,
    error: str
):
    response = (
        supabase
        .table("transcriptions")
        .update({
            "status": "failed",
            "error_message": error
        })
        .eq("id", transcription_id)
        .eq("user_id", user_id)
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

    # Verify transcription ownership
    owner = (
        supabase
        .table("transcriptions")
        .select("id")
        .eq("id", transcription_id)
        .eq("user_id", user_id)
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
        supabase
        .table("transcription_segments")
        .insert(records)
        .execute()
    )

    return response.data


def get_transcriptions(
    user_id: str,
    limit: int = 20,
    offset: int = 0
):
    response = (
        supabase
        .table("transcriptions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return response.data


def get_transcription(
    transcription_id: str,
    user_id: str
):
    response = (
        supabase
        .table("transcriptions")
        .select("*")
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    transcription = response.data[0]

    segments_response = (
        supabase
        .table("transcription_segments")
        .select("*")
        .eq("transcription_id", transcription_id)
        .order("segment_order")
        .execute()
    )

    transcription["segments"] = segments_response.data

    return transcription


def delete_transcription(
    transcription_id: str,
    user_id: str
):
    response = (
        supabase
        .table("transcriptions")
        .delete()
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .execute()
    )

    return response.data


def update_transcription_text(
    transcription_id: str,
    user_id: str,
    transcript_text: str
):
    response = (
        supabase
        .table("transcriptions")
        .update({
            "transcript_text": transcript_text
        })
        .eq("id", transcription_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


def record_usage(
    user_id: str,
    transcription_id: str,
    duration_seconds: float
):
    if not user_id or not transcription_id:
        raise ValueError("User ID and transcription ID are required")

    duration = max(float(duration_seconds), 0)

    response = (
        supabase
        .table("usage_records")
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

    return response.data[0] if response.data else None


def get_user_usage(user_id: str):
    response = supabase.rpc(
        "get_user_usage",
        {"target_user_id": user_id}
    ).execute()

    if not response.data:
        return {
            "total_seconds": 0,
            "total_minutes": 0,
            "current_month_seconds": 0,
            "transcription_count": 0
        }

    return response.data[0]