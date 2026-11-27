import base64
import hashlib
import hmac
import json
import logging
import math
import os
from pathlib import Path
from uuid import UUID

import av
import httpx
import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from database import supabase

logger = logging.getLogger(__name__)

# Currency and quantities are determined by the API, never by the browser.
PACKS = {
    "inicio": {"label": "Inicio", "seconds": 45 * 60, "amount_cents": 599},
    "hora": {"label": "Por hora", "seconds": 60 * 60, "amount_cents": 799},
}
CREDITS_MODE = os.getenv("AUDIONET_CREDITS_MODE", "disabled").lower()
SQUARE_MODES = {"square_test", "square_live"}
if CREDITS_MODE not in {"disabled", "simulated", "stripe_test", "stripe_live"} | SQUARE_MODES:
    raise RuntimeError("Invalid AUDIONET_CREDITS_MODE")

RECHARGES_PAUSED = os.getenv("AUDIONET_RECHARGES_PAUSED", "false").strip().lower() == "true"
STRIPE_MODES = {"stripe_test", "stripe_live"}
STRIPE_LIVE = CREDITS_MODE == "stripe_live"
CREDIT_WALLET = "live" if CREDITS_MODE in {"stripe_live", "square_live"} else "test"
STRIPE_APPLICATION = f"audionet_{CREDIT_WALLET}_credits"
STRIPE_KEY = os.getenv(f"AUDIONET_STRIPE_{CREDIT_WALLET.upper()}_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv(f"AUDIONET_STRIPE_{CREDIT_WALLET.upper()}_WEBHOOK_SECRET", "")
PUBLIC_APP_URL = os.getenv("AUDIONET_PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")
if CREDITS_MODE in STRIPE_MODES and not (
    STRIPE_KEY.startswith((f"sk_{CREDIT_WALLET}_", f"rk_{CREDIT_WALLET}_"))
    and STRIPE_WEBHOOK_SECRET.startswith("whsec_")
):
    raise RuntimeError(f"Stripe {CREDIT_WALLET} mode requires a matching API key and webhook secret")
SQUARE_BASE = "https://connect.squareup.com" if CREDIT_WALLET == "live" else "https://connect.squareupsandbox.com"
SQUARE_PREFIX = f"AUDIONET_SQUARE_{CREDIT_WALLET.upper()}"
SQUARE_TOKEN = os.getenv(f"{SQUARE_PREFIX}_ACCESS_TOKEN", "")
SQUARE_LOCATION = os.getenv(f"{SQUARE_PREFIX}_LOCATION_ID", "")
SQUARE_MERCHANT = os.getenv(f"{SQUARE_PREFIX}_MERCHANT_ID", "")
SQUARE_WEBHOOK_KEY = os.getenv(f"{SQUARE_PREFIX}_WEBHOOK_SIGNATURE_KEY", "")
SQUARE_WEBHOOK_URL = os.getenv(f"{SQUARE_PREFIX}_WEBHOOK_URL", "")
if CREDITS_MODE in SQUARE_MODES and not (
    SQUARE_TOKEN and SQUARE_LOCATION and SQUARE_MERCHANT and SQUARE_WEBHOOK_KEY
    and SQUARE_WEBHOOK_URL.startswith("https://")
):
    raise RuntimeError("Square requires credentials and an HTTPS webhook URL for the active environment")
if CREDIT_WALLET == "live" and not PUBLIC_APP_URL.startswith("https://"):
    raise RuntimeError("Live mode requires an HTTPS public app URL")


class RechargeRequest(BaseModel):
    pack_id: str = Field(min_length=1, max_length=64)
    request_id: UUID


def measure_audio_seconds(path: str) -> int:
    try:
        media_format = {".mp3": "mp3", ".wav": "wav", ".flac": "flac", ".ogg": "ogg", ".m4a": "mov", ".mp4": "mov"}.get(Path(path).suffix.lower())
        if media_format is None:
            raise ValueError("Unsupported audio format")
        with av.open(path, format=media_format, options={"protocol_whitelist": "file"}) as media:
            audio = next(iter(media.streams.audio), None)
            if audio is None:
                raise ValueError("Missing audio stream")
            if audio.duration is not None and audio.time_base is not None:
                duration = audio.duration * audio.time_base
            elif media.duration is not None:
                duration = media.duration / av.time_base
            else:
                raise ValueError("Missing audio duration")
            if not 0 < duration <= 24 * 3600:
                raise ValueError("Unsupported audio duration")
            return math.ceil(duration)
    except (av.FFmpegError, ValueError, OverflowError) as exc:
        raise HTTPException(status_code=422, detail="Could not determine audio duration") from exc


def reserve_transcription(user_id, filename, language, duration_seconds):
    return supabase.rpc("reserve_transcription_credit", {
        "p_user_id": user_id,
        "p_filename": filename,
        "p_language": language,
        "p_seconds": duration_seconds,
        "p_wallet": CREDIT_WALLET,
    }).execute().data


def expire_unsubmitted():
    supabase.rpc("expire_unsubmitted_transcriptions").execute()


def top_up(user_id, pack, kind, reference):
    return supabase.rpc("top_up_credits", {
        "p_user_id": user_id,
        "p_kind": kind,
        "p_reference": reference,
        "p_seconds": pack["seconds"],
        "p_amount_cents": pack["amount_cents"],
        "p_label": pack["label"],
    }).execute().data


def create_square_checkout(user_id, data, pack):
    # Square's key is deterministic for a user, request, package and environment.
    key = hashlib.sha256(
        f"{CREDIT_WALLET}:{user_id}:{data.request_id}:{data.pack_id}".encode()
    ).hexdigest()[:40]
    try:
        response = httpx.post(
            f"{SQUARE_BASE}/v2/online-checkout/payment-links",
            headers={"Authorization": f"Bearer {SQUARE_TOKEN}", "Square-Version": "2026-11-18"},
            json={
                "idempotency_key": key,
                "quick_pay": {
                    "name": f"AudioNet · {pack['seconds'] // 60} minutos",
                    "location_id": SQUARE_LOCATION,
                    "price_money": {"amount": pack["amount_cents"], "currency": "USD"},
                },
                "checkout_options": {
                    "redirect_url": f"{PUBLIC_APP_URL}/dashboard/account?checkout=success",
                    "allow_tipping": False,
                },
            },
            timeout=12,
        )
        if not response.is_success:
            errors = response.json().get("errors") or []
            logger.warning("Square Checkout failed (status=%s, code=%s)",
                           response.status_code, errors[0].get("code") if errors else None)
            raise HTTPException(status_code=503, detail="Recharges are temporarily unavailable")
        link = response.json()["payment_link"]
        if not link["order_id"] or not link["url"].startswith("https://"):
            raise ValueError("Incomplete Square payment link")
        order = {
            "wallet": CREDIT_WALLET, "order_id": link["order_id"], "user_id": user_id,
            "location_id": SQUARE_LOCATION, "amount_cents": pack["amount_cents"],
            "seconds": pack["seconds"], "label": pack["label"],
        }
        supabase.table("audionet_square_orders").upsert(
            order, on_conflict="wallet,order_id", ignore_duplicates=True,
        ).execute()
        # Never send the buyer to Checkout until this order is registered.
        return link["url"]
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Square checkout setup failed (type=%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Recharges are temporarily unavailable") from exc


def available_recharge_packs(user_id):
    if CREDITS_MODE in SQUARE_MODES:
        return supabase.rpc("an_available_recharge_packages", {
            "p_user": user_id,
            "p_wallet": CREDIT_WALLET,
            "p_paused": RECHARGES_PAUSED,
        }).execute().data
    if RECHARGES_PAUSED:
        return []
    return [{"id": pack_id, **pack} for pack_id, pack in PACKS.items()]


def build_credits_router(get_current_user):
    router = APIRouter(prefix="/credits", tags=["Credits"])

    @router.get("/me")
    def get_wallet(
        response: Response,
        recharge_offset: int = Query(0, ge=0),
        usage_offset: int = Query(0, ge=0),
        user: dict = Depends(get_current_user),
    ):
        response.headers["Cache-Control"] = "no-store"
        if CREDITS_MODE == "disabled":
            return {"mode": CREDITS_MODE, "packs": [], "recharges": [], "usage": []}

        user_id = user["id"]
        summary = supabase.rpc("credit_summary", {
            "p_user_id": user_id,
            "p_wallet": CREDIT_WALLET,
        }).execute().data

        def movements(kinds, offset):
            return (
                supabase.table("credit_movements")
                .select("id,kind,seconds,amount_cents,label,created_at")
                .eq("user_id", user_id).eq("wallet", CREDIT_WALLET)
                .in_("kind", kinds).order("id", desc=True)
                .range(offset, offset + 25).execute().data
            )

        recharge_kinds = (
            ["stripe_live", "square_live"] if CREDIT_WALLET == "live"
            else ["simulated", "stripe_test", "square_test"]
        )
        recharges = movements(recharge_kinds, recharge_offset)
        usage = movements(["transcription"], usage_offset)
        return {
            "mode": CREDITS_MODE,
            **summary,
            "available_seconds": summary["balance_seconds"] - summary["reserved_seconds"],
            "packs": available_recharge_packs(user_id),
            "recharges": recharges[:25],
            "usage": usage[:25],
            "more_recharges": len(recharges) > 25,
            "more_usage": len(usage) > 25,
        }

    @router.post("/recharges")
    def recharge(data: RechargeRequest, user: dict = Depends(get_current_user)):
        packs = available_recharge_packs(user["id"])
        if not packs:
            raise HTTPException(status_code=503, detail="Recharges are temporarily unavailable")
        pack = next((item for item in packs if item["id"] == data.pack_id), None)
        if pack is None:
            raise HTTPException(status_code=404, detail="Recharge package unavailable. Refresh your balance.")
        if CREDITS_MODE in SQUARE_MODES:
            url = create_square_checkout(user["id"], data, pack)
            return {"mode": CREDITS_MODE, "checkout_url": url}
        if CREDITS_MODE == "simulated":
            added = top_up(user["id"], pack, "simulated", str(data.request_id))
            return {"mode": "simulated", "added": bool(added)}

        if CREDITS_MODE not in STRIPE_MODES:
            raise HTTPException(status_code=409, detail="Recharges are disabled")

        stripe_client = stripe.StripeClient(STRIPE_KEY)
        product_name = f"AudioNet · {pack['seconds'] // 60} minutos"
        if not STRIPE_LIVE:
            product_name += " de prueba"
        try:
            session = stripe_client.v1.checkout.sessions.create({
                "mode": "payment",
                "payment_method_types": ["card"],
                "line_items": [{
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": pack["amount_cents"],
                        "product_data": {"name": product_name},
                    },
                    "quantity": 1,
                }],
                "client_reference_id": user["id"],
                "metadata": {"application": STRIPE_APPLICATION, "pack_id": data.pack_id},
                "success_url": f"{PUBLIC_APP_URL}/dashboard/account?checkout=success",
                "cancel_url": f"{PUBLIC_APP_URL}/dashboard/account?checkout=cancelled",
            }, options={"idempotency_key": f"audionet:{user['id']}:{data.request_id}"})
        except stripe.StripeError as exc:
            logger.warning(
                "Stripe Checkout creation failed (type=%s, status=%s, request_id=%s)",
                type(exc).__name__, exc.http_status, exc.request_id,
            )
            raise HTTPException(status_code=503, detail="Recharges are temporarily unavailable") from exc
        return {"mode": CREDITS_MODE, "checkout_url": session.url}

    @router.post("/square/webhook")
    async def square_webhook(request: Request):
        if CREDITS_MODE not in SQUARE_MODES:
            raise HTTPException(status_code=404, detail="Webhook unavailable")
        body = await request.body()
        digest = hmac.new(
            SQUARE_WEBHOOK_KEY.encode(), SQUARE_WEBHOOK_URL.encode() + body, hashlib.sha256
        ).digest()
        expected = base64.b64encode(digest)
        signature = request.headers.get("x-square-hmacsha256-signature", "").encode()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=400, detail="Invalid Square signature")
        try:
            event = json.loads(body)
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(status_code=400, detail="Invalid Square event") from exc
        if event.get("merchant_id") != SQUARE_MERCHANT or event.get("type") not in {
            "payment.created", "payment.updated"
        }:
            return {"received": True}
        payment = (event.get("data") or {}).get("object", {}).get("payment") or {}
        if (
            payment.get("status") != "COMPLETED"
            or payment.get("location_id") != SQUARE_LOCATION
            or not payment.get("id")
            or not payment.get("order_id")
        ):
            return {"received": True}
        money = payment.get("amount_money") or {}
        await run_in_threadpool(lambda: supabase.rpc("an_credit_square_payment", {
            "p_wallet": CREDIT_WALLET,
            "p_order_id": payment["order_id"],
            "p_payment_id": payment["id"],
            "p_location_id": payment["location_id"],
            "p_amount_cents": money.get("amount"),
            "p_currency": money.get("currency"),
        }).execute())
        return {"received": True}

    @router.post("/stripe/webhook")
    async def stripe_webhook(request: Request):
        if CREDITS_MODE not in STRIPE_MODES:
            raise HTTPException(status_code=404, detail="Webhook unavailable")
        try:
            event = stripe.Webhook.construct_event(
                await request.body(), request.headers.get("stripe-signature", ""), STRIPE_WEBHOOK_SECRET,
            ).to_dict()
        except (ValueError, stripe.SignatureVerificationError) as exc:
            raise HTTPException(status_code=400, detail="Invalid Stripe webhook") from exc

        if event.get("livemode") is not STRIPE_LIVE or event["type"] != "checkout.session.completed":
            return {"received": True}

        session = event["data"]["object"]
        metadata = session.get("metadata") or {}
        if metadata.get("application") != STRIPE_APPLICATION or session.get("payment_status") != "paid":
            return {"received": True}
        pack = PACKS.get(metadata.get("pack_id"))
        if not pack or session.get("mode") != "payment" or session.get("currency") != "usd" or session.get("amount_total") != pack["amount_cents"]:
            raise HTTPException(status_code=400, detail="Unexpected Checkout amount or package")
        try:
            user_id = str(UUID(session.get("client_reference_id") or ""))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Missing Checkout account") from exc
        await run_in_threadpool(top_up, user_id, pack, CREDITS_MODE, session["id"])
        return {"received": True}

    return router
