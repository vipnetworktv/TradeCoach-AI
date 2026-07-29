import hashlib
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sync_events import (
    get_active_trading_profile,
    router as sync_events_router,
)

# Always load the .env file located beside this main.py file.
BACKEND_DIRECTORY = Path(__file__).resolve().parent

load_dotenv(BACKEND_DIRECTORY / ".env")


logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s | %(levelname)s | "
        "%(name)s | %(message)s"
    ),
)

logger = logging.getLogger("tradecoach-api")


FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000",
).rstrip("/")

CORS_ALLOWED_ORIGINS = sorted(
    {
        FRONTEND_URL,
        "https://tradecoachai.org",
        "https://www.tradecoachai.org",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    },
)

SUPABASE_URL = os.getenv(
    "SUPABASE_URL",
    "",
).rstrip("/")

SUPABASE_SECRET_KEY = os.getenv(
    "SUPABASE_SECRET_KEY",
    "",
).strip()


PAIRING_CODE_LIFETIME_MINUTES = 10

PAIRING_ALPHABET = (
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
)


app = FastAPI(
    title="TradeCoach AI API",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_origin_regex=(
        r"^chrome-extension://[a-z]{32}$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
app.include_router(sync_events_router)

class CreatePairingCodeRequest(BaseModel):
    device_name: str = Field(
        default="TradeCoach Sync",
        min_length=1,
        max_length=100,
    )


class PairExtensionRequest(BaseModel):
    code: str = Field(
        min_length=8,
        max_length=20,
    )

    device_name: str = Field(
        default="TradeCoach Sync",
        min_length=1,
        max_length=100,
    )

    # Edge and Chrome user-agent strings can be
    # considerably longer than 100 characters.
    browser: str | None = Field(
        default=None,
        max_length=500,
    )

    extension_version: str | None = Field(
        default=None,
        max_length=50,
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def hash_value(value: str) -> str:
    return hashlib.sha256(
        value.encode("utf-8"),
    ).hexdigest()


def create_pairing_code() -> str:
    raw_code = "".join(
        secrets.choice(PAIRING_ALPHABET)
        for _ in range(8)
    )

    return (
        f"{raw_code[:4]}-"
        f"{raw_code[4:]}"
    )


def normalize_pairing_code(code: str) -> str:
    normalized = re.sub(
        r"[^A-Z0-9]",
        "",
        code.upper(),
    )

    if len(normalized) != 8:
        raise HTTPException(
            status_code=400,
            detail=(
                "Enter a valid eight-character "
                "pairing code."
            ),
        )

    return normalized


def parse_supabase_datetime(
    value: str,
) -> datetime:
    normalized = value.replace(
        "Z",
        "+00:00",
    )

    parsed = datetime.fromisoformat(
        normalized,
    )

    if parsed.tzinfo is None:
        parsed = parsed.replace(
            tzinfo=timezone.utc,
        )

    return parsed


def require_supabase_configuration() -> None:
    if (
        not SUPABASE_URL
        or not SUPABASE_SECRET_KEY
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Supabase is not configured in "
                "backend/.env."
            ),
        )


def service_headers(
    *,
    prefer: str | None = None,
) -> dict[str, str]:
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": (
            f"Bearer {SUPABASE_SECRET_KEY}"
        ),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    if prefer:
        headers["Prefer"] = prefer

    return headers


async def safe_response_json(
    response: httpx.Response,
) -> Any:
    try:
        return response.json()
    except ValueError:
        return None


async def get_response_error(
    response: httpx.Response,
    fallback: str,
) -> str:
    data = await safe_response_json(response)

    if isinstance(data, dict):
        for key in (
            "detail",
            "message",
            "error",
            "error_description",
            "hint",
        ):
            value = data.get(key)

            if isinstance(value, str) and value:
                return value

        code = data.get("code")

        if isinstance(code, str) and code:
            return (
                f"{fallback} "
                f"Supabase code: {code}."
            )

    response_text = response.text.strip()

    if response_text:
        return (
            f"{fallback} "
            f"Response: {response_text[:500]}"
        )

    return fallback


def extract_bearer_token(
    authorization: str | None,
) -> str:
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail=(
                "Authorization token is missing."
            ),
        )

    scheme, separator, token = (
        authorization.partition(" ")
    )

    if (
        not separator
        or scheme.lower() != "bearer"
        or not token.strip()
    ):
        raise HTTPException(
            status_code=401,
            detail=(
                "Authorization token is invalid."
            ),
        )

    return token.strip()


async def get_current_user(
    authorization: str | None,
) -> dict[str, Any]:
    require_supabase_configuration()

    access_token = extract_bearer_token(
        authorization,
    )

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            response = await client.get(
                (
                    f"{SUPABASE_URL}/"
                    "auth/v1/user"
                ),
                headers={
                    "apikey": (
                        SUPABASE_SECRET_KEY
                    ),
                    "Authorization": (
                        f"Bearer {access_token}"
                    ),
                    "Accept": (
                        "application/json"
                    ),
                },
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "Supabase took too long to "
                "verify the TradeCoach user."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not verify the "
                "TradeCoach user."
            ),
        ) from exc

    if response.status_code != 200:
        logger.warning(
            "User verification failed: %s %s",
            response.status_code,
            response.text[:500],
        )

        raise HTTPException(
            status_code=401,
            detail=(
                "Your TradeCoach login has "
                "expired. Please sign in again."
            ),
        )

    user = await safe_response_json(
        response,
    )

    if not isinstance(user, dict):
        raise HTTPException(
            status_code=502,
            detail=(
                "Supabase returned an invalid "
                "user response."
            ),
        )

    if not user.get("id"):
        raise HTTPException(
            status_code=401,
            detail=(
                "Authenticated user could "
                "not be identified."
            ),
        )

    return user


async def get_subscription_access(
    user_id: str,
) -> dict[str, Any]:
    require_supabase_configuration()

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            response = await client.get(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    "user_subscriptions"
                ),
                params={
                    "select": (
                        "status,trial_ends_at,"
                        "current_period_end,"
                        "cancel_at_period_end"
                    ),
                    "user_id": (
                        f"eq.{user_id}"
                    ),
                },
                headers=service_headers(),
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "Supabase took too long to "
                "verify subscription access."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not verify subscription "
                "access."
            ),
        ) from exc

    if response.status_code != 200:
        logger.warning(
            "Subscription lookup failed: %s %s",
            response.status_code,
            response.text[:500],
        )

        return {
            "has_access": False,
            "reason": "missing",
        }

    rows = await safe_response_json(
        response,
    )

    if not isinstance(rows, list) or not rows:
        return {
            "has_access": False,
            "reason": "missing",
        }

    subscription = rows[0]

    if not isinstance(subscription, dict):
        return {
            "has_access": False,
            "reason": "missing",
        }

    status = str(
        subscription.get("status") or "",
    ).strip()

    now = utc_now()
    trial_ends_at = parse_supabase_datetime(
        subscription.get("trial_ends_at"),
    )
    current_period_end = parse_supabase_datetime(
        subscription.get(
            "current_period_end",
        ),
    )
    cancel_at_period_end = bool(
        subscription.get(
            "cancel_at_period_end",
        ),
    )

    if status == "trialing":
        has_access = bool(
            trial_ends_at
            and trial_ends_at > now
        )

        return {
            "has_access": has_access,
            "reason": (
                "trialing"
                if has_access
                else "trial_expired"
            ),
        }

    if status == "active":
        has_access = (
            not cancel_at_period_end
            or not current_period_end
            or current_period_end > now
        )

        return {
            "has_access": has_access,
            "reason": (
                "active"
                if has_access
                else "expired"
            ),
        }

    if status == "canceled":
        return {
            "has_access": False,
            "reason": "canceled",
        }

    if status == "past_due":
        return {
            "has_access": False,
            "reason": "past_due",
        }

    return {
        "has_access": False,
        "reason": "expired",
    }


async def require_active_subscription(
    user_id: str,
) -> None:
    access = await get_subscription_access(
        user_id,
    )

    if access["has_access"]:
        return

    reason = access.get(
        "reason",
        "expired",
    )

    detail = (
        "Your TradeCoach trial or "
        "subscription is inactive. "
        "Manage billing to restore access."
    )

    if reason == "trial_expired":
        detail = (
            "Your free trial has ended. "
            "Subscribe in billing to "
            "restore access."
        )
    elif reason == "canceled":
        detail = (
            "Your subscription was canceled. "
            "Resubscribe in billing to "
            "restore access."
        )

    raise HTTPException(
        status_code=403,
        detail=detail,
    )


async def find_device_by_token(
    device_token: str,
) -> dict[str, Any]:
    require_supabase_configuration()

    token_hash = hash_value(
        device_token,
    )

    params = {
        "select": (
            "id,user_id,device_name,browser,"
            "extension_version,is_active,"
            "last_seen_at,"
            "last_successful_sync_at,"
            "last_synced_fill_id"
        ),
        "device_token_hash": (
            f"eq.{token_hash}"
        ),
        "limit": "1",
    }

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            response = await client.get(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    "sync_devices"
                ),
                params=params,
                headers=service_headers(),
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "Supabase took too long to "
                "verify the sync device."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not verify the "
                "sync device."
            ),
        ) from exc

    if response.status_code != 200:
        error_message = (
            await get_response_error(
                response,
                (
                    "The sync device could "
                    "not be verified."
                ),
            )
        )

        logger.error(
            "Device verification failed: %s",
            error_message,
        )

        raise HTTPException(
            status_code=502,
            detail=error_message,
        )

    devices = await safe_response_json(
        response,
    )

    if (
        not isinstance(devices, list)
        or not devices
    ):
        raise HTTPException(
            status_code=401,
            detail=(
                "This TradeCoach Sync "
                "connection is invalid or "
                "has been removed."
            ),
        )

    device = devices[0]

    if not device.get("is_active"):
        raise HTTPException(
            status_code=401,
            detail=(
                "This TradeCoach Sync "
                "device is disabled."
            ),
        )

    return device


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "TradeCoach AI API",
        "status": "online",
    }


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "healthy",
        "supabase_configured": bool(
            SUPABASE_URL
            and SUPABASE_SECRET_KEY
        ),
        "tradovate_sync_method": (
            "browser_extension"
        ),
    }


@app.get(
    "/api/brokers/ninjatrader/status",
)
async def ninjatrader_status() -> (
    dict[str, object]
):
    return {
        "broker": "ninjatrader",
        "configured": True,
        "connection_method": (
            "browser_extension"
        ),
        "message": (
            "TradeCoach Sync is ready to "
            "pair with the logged-in "
            "NinjaTrader Web browser session."
        ),
    }


@app.get(
    "/api/brokers/tradovate/status",
)
async def tradovate_status() -> (
    dict[str, object]
):
    return {
        "broker": "tradovate",
        "configured": True,
        "connection_method": (
            "browser_extension"
        ),
        "message": (
            "TradeCoach Sync is ready to "
            "pair with the logged-in "
            "Tradovate browser session."
        ),
    }


@app.post("/api/sync/pairing-code")
async def create_sync_pairing_code(
    request: CreatePairingCodeRequest,
    authorization: str | None = Header(
        default=None,
    ),
) -> dict[str, object]:
    user = await get_current_user(
        authorization,
    )

    await require_active_subscription(
        user["id"],
    )

    user_id = user["id"]

    expires_at = (
        utc_now()
        + timedelta(
            minutes=(
                PAIRING_CODE_LIFETIME_MINUTES
            ),
        )
    )

    for _ in range(5):
        formatted_code = (
            create_pairing_code()
        )

        normalized_code = (
            normalize_pairing_code(
                formatted_code,
            )
        )

        code_hash = hash_value(
            normalized_code,
        )

        record = {
            "user_id": user_id,
            "code_hash": code_hash,
            "expires_at": (
                expires_at.isoformat()
            ),
        }

        try:
            async with httpx.AsyncClient(
                timeout=20.0,
            ) as client:
                response = await client.post(
                    (
                        f"{SUPABASE_URL}/rest/v1/"
                        "sync_pairing_codes"
                    ),
                    json=record,
                    headers=service_headers(
                        prefer=(
                            "return=representation"
                        ),
                    ),
                )
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=504,
                detail=(
                    "Supabase took too long "
                    "to create the pairing "
                    "code."
                ),
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Could not create a "
                    "sync pairing code."
                ),
            ) from exc

        if response.status_code in (
            200,
            201,
        ):
            return {
                "success": True,
                "code": formatted_code,
                "device_name": (
                    request.device_name
                ),
                "expires_at": (
                    expires_at.isoformat()
                ),
                "expires_in_seconds": (
                    PAIRING_CODE_LIFETIME_MINUTES
                    * 60
                ),
            }

        if response.status_code == 409:
            continue

        error_message = (
            await get_response_error(
                response,
                (
                    "Supabase rejected the "
                    "pairing-code request."
                ),
            )
        )

        logger.error(
            "Pairing code creation failed: "
            "%s",
            error_message,
        )

        raise HTTPException(
            status_code=502,
            detail=error_message,
        )

    raise HTTPException(
        status_code=500,
        detail=(
            "Could not generate a unique "
            "pairing code."
        ),
    )


@app.post("/api/sync/pair")
async def pair_sync_extension(
    request: PairExtensionRequest,
) -> dict[str, object]:
    require_supabase_configuration()

    normalized_code = (
        normalize_pairing_code(
            request.code,
        )
    )

    code_hash = hash_value(
        normalized_code,
    )

    params = {
        "select": (
            "id,user_id,expires_at,used_at"
        ),
        "code_hash": f"eq.{code_hash}",
        "limit": "1",
    }

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            response = await client.get(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    "sync_pairing_codes"
                ),
                params=params,
                headers=service_headers(),
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "Supabase took too long to "
                "verify the pairing code."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not verify the "
                "pairing code."
            ),
        ) from exc

    if response.status_code != 200:
        error_message = (
            await get_response_error(
                response,
                (
                    "The pairing code could "
                    "not be verified."
                ),
            )
        )

        logger.error(
            "Pairing code verification "
            "failed: %s",
            error_message,
        )

        raise HTTPException(
            status_code=502,
            detail=error_message,
        )

    matching_codes = (
        await safe_response_json(
            response,
        )
    )

    if (
        not isinstance(
            matching_codes,
            list,
        )
        or not matching_codes
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "The pairing code is invalid."
            ),
        )

    pairing_record = matching_codes[0]

    if pairing_record.get("used_at"):
        raise HTTPException(
            status_code=400,
            detail=(
                "This pairing code has "
                "already been used."
            ),
        )

    expires_at = parse_supabase_datetime(
        pairing_record["expires_at"],
    )

    if expires_at <= utc_now():
        raise HTTPException(
            status_code=400,
            detail=(
                "This pairing code has "
                "expired. Generate a new "
                "code in TradeCoach."
            ),
        )

    raw_device_token = (
        secrets.token_urlsafe(48)
    )

    device_token_hash = hash_value(
        raw_device_token,
    )

    browser_value = None

    if request.browser:
        browser_value = (
            request.browser
            .strip()[:500]
        )

    extension_version_value = None

    if request.extension_version:
        extension_version_value = (
            request.extension_version
            .strip()[:50]
        )

    device_record = {
        "user_id": (
            pairing_record["user_id"]
        ),
        "device_name": (
            request.device_name
            .strip()[:100]
        ),
        "browser": browser_value,
        "extension_version": (
            extension_version_value
        ),
        "device_token_hash": (
            device_token_hash
        ),
        "is_active": True,
        "last_seen_at": (
            utc_now().isoformat()
        ),
    }

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            device_response = (
                await client.post(
                    (
                        f"{SUPABASE_URL}/"
                        "rest/v1/sync_devices"
                    ),
                    json=device_record,
                    headers=service_headers(
                        prefer=(
                            "return=representation"
                        ),
                    ),
                )
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "Supabase took too long to "
                "register the sync device."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not register the "
                "sync device."
            ),
        ) from exc

    if device_response.status_code not in (
        200,
        201,
    ):
        error_message = (
            await get_response_error(
                device_response,
                (
                    "Supabase rejected the "
                    "sync-device request."
                ),
            )
        )

        logger.error(
            "Sync-device creation failed. "
            "Status=%s Error=%s",
            device_response.status_code,
            error_message,
        )

        raise HTTPException(
            status_code=502,
            detail=error_message,
        )

    created_devices = (
        await safe_response_json(
            device_response,
        )
    )

    if (
        not isinstance(
            created_devices,
            list,
        )
        or not created_devices
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "The sync device was created "
                "but Supabase did not return it."
            ),
        )

    device = created_devices[0]

    used_at = utc_now().isoformat()

    update_params = {
        "id": (
            f"eq.{pairing_record['id']}"
        ),
        "used_at": "is.null",
    }

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            used_response = (
                await client.patch(
                    (
                        f"{SUPABASE_URL}/"
                        "rest/v1/"
                        "sync_pairing_codes"
                    ),
                    params=update_params,
                    json={
                        "used_at": used_at,
                    },
                    headers=service_headers(
                        prefer=(
                            "return=minimal"
                        ),
                    ),
                )
            )

        if used_response.status_code not in (
            200,
            204,
        ):
            logger.warning(
                "Device created, but pairing "
                "code could not be marked used. "
                "Status=%s Body=%s",
                used_response.status_code,
                used_response.text[:500],
            )
    except httpx.RequestError as exc:
        logger.warning(
            "Device created, but pairing "
            "code update failed: %s",
            exc,
        )

    logger.info(
        "TradeCoach Sync device paired. "
        "Device ID: %s",
        device.get("id"),
    )

    return {
        "success": True,
        "device_id": device["id"],
        "device_token": raw_device_token,
        "message": (
            "TradeCoach Sync was paired "
            "successfully."
        ),
    }


@app.get("/api/sync/device/status")
async def sync_device_status(
    authorization: str | None = Header(
        default=None,
    ),
) -> dict[str, object]:
    device_token = extract_bearer_token(
        authorization,
    )

    device = await find_device_by_token(
        device_token,
    )

    current_time = (
        utc_now().isoformat()
    )

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            update_response = (
                await client.patch(
                    (
                        f"{SUPABASE_URL}/"
                        "rest/v1/sync_devices"
                    ),
                    params={
                        "id": (
                            f"eq.{device['id']}"
                        ),
                    },
                    json={
                        "last_seen_at": (
                            current_time
                        ),
                    },
                    headers=service_headers(
                        prefer=(
                            "return=minimal"
                        ),
                    ),
                )
            )

        if update_response.status_code not in (
            200,
            204,
        ):
            logger.warning(
                "Could not update device "
                "last_seen_at. Status=%s",
                update_response.status_code,
            )
    except httpx.RequestError as exc:
        logger.warning(
            "Could not update device "
            "last_seen_at: %s",
            exc,
        )

    active_profile = await get_active_trading_profile(
        device["user_id"],
    )

    return {
        "connected": True,
        "device_id": device["id"],
        "device_name": (
            device["device_name"]
        ),
        "browser": device.get(
            "browser",
        ),
        "extension_version": (
            device.get(
                "extension_version",
            )
        ),
        "active_trading_profile_id": (
            active_profile.get("id")
            if active_profile
            else None
        ),
        "active_trading_profile_name": (
            active_profile.get("name")
            if active_profile
            else None
        ),
        "last_successful_sync_at": (
            device.get(
                "last_successful_sync_at",
            )
        ),
        "last_synced_fill_id": (
            device.get(
                "last_synced_fill_id",
            )
        ),
    }