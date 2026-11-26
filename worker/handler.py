import os
import tempfile
import logging
import requests
import runpod
import torch

from faster_whisper import WhisperModel
from transformers import pipeline


# ============================================================
# CONFIGURACIÓN
# ============================================================

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")

CAP_PUNCT_ENABLED = os.getenv(
    "CAP_PUNCT_ENABLED", "true"
).lower() == "true"

CAP_PUNCT_MODEL = os.getenv(
    "CAP_PUNCT_MODEL", "HiTZ/cap-punct-es"
)

CAP_PUNCT_BATCH_SIZE = int(
    os.getenv("CAP_PUNCT_BATCH_SIZE", "8")
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("audionet-worker")


# ============================================================
# MODELOS
# ============================================================

whisper_model = None
cap_punct_pipeline = None


def get_whisper_model():
    global whisper_model

    if whisper_model is None:
        logger.info("Cargando modelo Whisper: %s", WHISPER_MODEL)

        whisper_model = WhisperModel(
            WHISPER_MODEL,
            device="cuda",
            compute_type=WHISPER_COMPUTE_TYPE
        )

        logger.info("Whisper cargado correctamente.")

    return whisper_model


def get_cap_punct_pipeline():
    global cap_punct_pipeline

    if not CAP_PUNCT_ENABLED:
        return None

    if cap_punct_pipeline is None:
        logger.info(
            "Cargando modelo de puntuación: %s",
            CAP_PUNCT_MODEL
        )

        device = 0 if torch.cuda.is_available() else -1

        cap_punct_pipeline = pipeline(
            task="translation",
            model=CAP_PUNCT_MODEL,
            tokenizer=CAP_PUNCT_MODEL,
            device=device
        )

        logger.info("Modelo HiTZ cargado correctamente.")

    return cap_punct_pipeline


# ============================================================
# RESTAURACIÓN DE PUNTUACIÓN Y MAYÚSCULAS
# ============================================================

def restore_segment_texts(texts):
    """
    Restaura puntuación y mayúsculas en una lista de segmentos.

    Mantiene la correspondencia entre cada texto original
    y su resultado restaurado.
    """

    if not texts:
        return []

    if not CAP_PUNCT_ENABLED:
        return texts

    try:
        model = get_cap_punct_pipeline()

        if model is None:
            return texts

        restored_texts = []

        for index in range(
            0,
            len(texts),
            CAP_PUNCT_BATCH_SIZE
        ):
            batch = texts[
                index:index + CAP_PUNCT_BATCH_SIZE
            ]

            results = model(
                batch,
                batch_size=CAP_PUNCT_BATCH_SIZE
            )

            for original_text, result in zip(batch, results):
                restored = (
                    result.get("translation_text", "")
                    if isinstance(result, dict)
                    else ""
                )

                restored = restored.strip()

                # Si el modelo devuelve un resultado vacío,
                # conservamos el texto original.
                if not restored:
                    restored = original_text

                restored_texts.append(restored)

        return restored_texts

    except Exception:
        logger.exception(
            "Error restaurando puntuación. "
            "Se conservarán los textos originales."
        )

        return texts


# ============================================================
# PROCESAMIENTO DEL AUDIO
# ============================================================

def transcribe_audio(audio_path, language=None):

    whisper = get_whisper_model()

    segments, info = whisper.transcribe(
        audio_path,
        language=language,
        vad_filter=True
    )

    original_segments = []

    for segment in segments:
        original_segments.append({
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "text": segment.text.strip()
        })

    # Restaurar cada segmento individualmente.
    original_texts = [
        segment["text"]
        for segment in original_segments
    ]

    restored_texts = restore_segment_texts(
        original_texts
    )

    # Actualizar solamente el texto.
    # Los tiempos originales de Whisper se conservan.
    for index, segment in enumerate(original_segments):
        if index < len(restored_texts):
            segment["text"] = restored_texts[index]

    # Construir el texto completo desde los segmentos finales.
    transcript_text = " ".join(
        segment["text"]
        for segment in original_segments
        if segment["text"]
    )

    return {
        "status": "completed",
        "language": info.language,
        "duration": info.duration,
        "segments": original_segments,
        "text": transcript_text
    }


# ============================================================
# RUNPOD HANDLER
# ============================================================

def handler(job):

    data = job.get("input", {}) or {}

    audio_url = data.get("audio_url")

    if not audio_url:
        return {
            "error": "Falta audio_url"
        }

    language = data.get("language")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:

            audio_path = os.path.join(
                temp_dir,
                "audio_input"
            )

            logger.info("Descargando audio...")

            response = requests.get(
                audio_url,
                timeout=300
            )

            response.raise_for_status()

            with open(audio_path, "wb") as audio_file:
                audio_file.write(response.content)

            logger.info("Audio descargado correctamente.")

            result = transcribe_audio(
                audio_path,
                language=language
            )

            logger.info(
                "Transcripción completada. Segmentos: %s",
                len(result["segments"])
            )

            return result

    except Exception as error:

        logger.exception("Error procesando el audio.")

        return {
            "error": str(error)
        }


# ============================================================
# INICIO DEL WORKER
# ============================================================

if __name__ == "__main__":

    runpod.serverless.start({
        "handler": handler
    })