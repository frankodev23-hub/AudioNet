import os
import tempfile
import requests
import runpod
from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")

model = None

def get_model():
    global model

    if model is None:
        model = WhisperModel(
            MODEL_SIZE,
            device="cuda",
            compute_type=COMPUTE_TYPE
        )

    return model


def handler(job):
    data = job.get("input", {})
    audio_url = data.get("audio_url")

    if not audio_url:
        return {"error": "Falta audio_url"}

    language = data.get("language")

    try:
        with tempfile.TemporaryDirectory() as temp:
            audio_path = os.path.join(temp, "audio_input")

            response = requests.get(audio_url, timeout=300)
            response.raise_for_status()

            with open(audio_path, "wb") as f:
                f.write(response.content)

            whisper = get_model()

            segments, info = whisper.transcribe(
                audio_path,
                language=language,
                vad_filter=True
            )

            results = []

            for segment in segments:
                results.append({
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": segment.text.strip()
                })

            return {
                "status": "completed",
                "language": info.language,
                "duration": info.duration,
                "segments": results,
                "text": " ".join(s["text"] for s in results)
            }

    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})