import os
import uuid
import boto3

from pathlib import Path
from dotenv import load_dotenv
from botocore.config import Config

load_dotenv(Path(__file__).parent / ".env")

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")

R2_ENDPOINT_URL = (
    os.getenv("R2_ENDPOINT_URL")
    or f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
)

if not all([
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME
]):
    raise RuntimeError("Faltan credenciales de Cloudflare R2")


s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
    config=Config(signature_version="s3v4")
)


def upload_audio(file_path: str, original_filename: str):
    extension = Path(original_filename).suffix.lower()

    object_key = f"audios/{uuid.uuid4()}{extension}"

    s3.upload_file(
        file_path,
        R2_BUCKET_NAME,
        object_key
    )

    return object_key


def generate_download_url(object_key: str, expiration=3600):
    return s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": R2_BUCKET_NAME,
            "Key": object_key
        },
        ExpiresIn=expiration
    )


def delete_audio(object_key: str):
    s3.delete_object(
        Bucket=R2_BUCKET_NAME,
        Key=object_key
    )