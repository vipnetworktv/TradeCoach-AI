import hashlib
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field


BACKEND_DIRECTORY = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIRECTORY / ".env")


logger = logging.getLogger(
    "tradecoach-sync-events",
)

router = APIRouter(
    prefix="/api/sync",
    tags=["TradeCoach Sync"],
)


SUPABASE_URL = os.getenv(
    "SUPABASE_URL",
    "",
).rstrip("/")

SUPABASE_SECRET_KEY = os.getenv(
    "SUPABASE_SECRET_KEY",
    "",
).strip()


MAX_EVENTS_PER_REQUEST = 100

FUTURES_POINT_VALUES = {
    "ES": 50.0,
    "MES": 5.0,
    "NQ": 20.0,
    "MNQ": 2.0,
    "RTY": 50.0,
    "M2K": 5.0,
    "YM": 5.0,
    "MYM": 0.5,
    "CL": 1000.0,
    "MCL": 100.0,
    "GC": 100.0,
    "MGC": 10.0,
    "SI": 5000.0,
    "SIL": 1000.0,
    "NG": 10000.0,
    "ZB": 1000.0,
    "ZN": 1000.0,
    "ZF": 1000.0,
}


def get_futures_point_value(
    symbol: str | None,
) -> float:
    normalized = safe_string(
        symbol,
    )

    if not normalized:
        return 1.0

    upper = normalized.upper()

    if upper in FUTURES_POINT_VALUES:
        return FUTURES_POINT_VALUES[upper]

    for length in range(
        min(4, len(upper)),
        1,
        -1,
    ):
        key = upper[:length]

        if key in FUTURES_POINT_VALUES:
            return FUTURES_POINT_VALUES[key]

    return 1.0


class BrokerSyncEvent(BaseModel):
    broker: Literal["tradingview"] = "tradingview"

    event_type: str = Field(
        min_length=1,
        max_length=100,
    )

    broker_event_id: str = Field(
        min_length=1,
        max_length=255,
    )

    account_external_id: str | None = Field(
        default=None,
        max_length=255,
    )

    symbol: str | None = Field(
        default=None,
        max_length=100,
    )

    occurred_at: datetime

    source: Literal[
        "live",
        "reconciliation",
        "manual_test",
    ] = "live"

    payload: dict[str, Any] = Field(
        default_factory=dict,
    )


class BrokerSyncEventsRequest(BaseModel):
    events: list[BrokerSyncEvent]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def datetime_to_utc_iso(
    value: datetime,
) -> str:
    if value.tzinfo is None:
        value = value.replace(
            tzinfo=timezone.utc,
        )
    else:
        value = value.astimezone(
            timezone.utc,
        )

    return value.isoformat()


def parse_datetime(
    value: Any,
) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        cleaned = value.strip()

        if not cleaned:
            return None

        try:
            parsed = datetime.fromisoformat(
                cleaned.replace(
                    "Z",
                    "+00:00",
                ),
            )
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(
            tzinfo=timezone.utc,
        )
    else:
        parsed = parsed.astimezone(
            timezone.utc,
        )

    return parsed


def safe_string(
    value: Any,
) -> str | None:
    if value is None:
        return None

    cleaned = str(value).strip()

    return cleaned or None


def safe_float(
    value: Any,
) -> float | None:
    if (
        value is None
        or value == ""
    ):
        return None

    try:
        number = float(value)
    except (
        TypeError,
        ValueError,
    ):
        return None

    return number


def safe_int(
    value: Any,
) -> int | None:
    number = safe_float(value)

    if number is None:
        return None

    return int(number)


def first_string(
    *values: Any,
) -> str | None:
    for value in values:
        cleaned = safe_string(value)

        if cleaned:
            return cleaned

    return None


def first_float(
    *values: Any,
) -> float | None:
    for value in values:
        number = safe_float(value)

        if number is not None:
            return number

    return None


def hash_value(
    value: str,
) -> str:
    return hashlib.sha256(
        value.encode("utf-8"),
    ).hexdigest()


def require_supabase_configuration() -> None:
    if (
        not SUPABASE_URL
        or not SUPABASE_SECRET_KEY
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Supabase is not configured "
                "in backend/.env."
            ),
        )


def service_headers(
    *,
    prefer: str | None = None,
) -> dict[str, str]:
    headers = {
        "apikey":
            SUPABASE_SECRET_KEY,

        "Authorization":
            (
                "Bearer "
                f"{SUPABASE_SECRET_KEY}"
            ),

        "Accept":
            "application/json",

        "Content-Type":
            "application/json",
    }

    if prefer:
        headers["Prefer"] = prefer

    return headers


def extract_bearer_token(
    authorization: str | None,
) -> str:
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail=(
                "The TradeCoach Sync device "
                "token is missing."
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
                "The TradeCoach Sync device "
                "token is invalid."
            ),
        )

    return token.strip()


def response_json(
    response: httpx.Response,
) -> Any:
    try:
        return response.json()
    except ValueError:
        return None


def response_error(
    response: httpx.Response,
    fallback: str,
) -> str:
    data = response_json(response)

    if isinstance(data, dict):
        for key in (
            "detail",
            "message",
            "error",
            "hint",
        ):
            value = data.get(key)

            if (
                isinstance(value, str)
                and value
            ):
                return value

    body = response.text.strip()

    if body:
        return (
            f"{fallback} "
            f"Response: {body[:500]}"
        )

    return fallback


async def supabase_get(
    table: str,
    *,
    params: dict[str, str],
) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(
            timeout=30.0,
        ) as client:
            response = await client.get(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    f"{table}"
                ),
                params=params,
                headers=service_headers(),
            )
    except httpx.TimeoutException as exc:
        raise RuntimeError(
            (
                "Supabase took too long to "
                f"read {table}."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(
            f"Could not read {table}.",
        ) from exc

    if response.status_code != 200:
        raise RuntimeError(
            response_error(
                response,
                (
                    "Supabase rejected a "
                    f"{table} read."
                ),
            ),
        )

    data = response_json(response)

    if not isinstance(data, list):
        return []

    return [
        item
        for item in data
        if isinstance(item, dict)
    ]


async def supabase_upsert(
    table: str,
    *,
    records: (
        dict[str, Any]
        | list[dict[str, Any]]
    ),
    on_conflict: str,
) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(
            timeout=30.0,
        ) as client:
            response = await client.post(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    f"{table}"
                ),
                params={
                    "on_conflict":
                        on_conflict,
                },
                json=records,
                headers=service_headers(
                    prefer=(
                        "resolution=merge-duplicates,"
                        "return=representation"
                    ),
                ),
            )
    except httpx.TimeoutException as exc:
        raise RuntimeError(
            (
                "Supabase took too long to "
                f"update {table}."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(
            f"Could not update {table}.",
        ) from exc

    if response.status_code not in (
        200,
        201,
    ):
        raise RuntimeError(
            response_error(
                response,
                (
                    "Supabase rejected a "
                    f"{table} upsert."
                ),
            ),
        )

    data = response_json(response)

    if not isinstance(data, list):
        return []

    return [
        item
        for item in data
        if isinstance(item, dict)
    ]


async def supabase_patch(
    table: str,
    *,
    params: dict[str, str],
    values: dict[str, Any],
    return_rows: bool = False,
) -> list[dict[str, Any]]:
    prefer = (
        "return=representation"
        if return_rows
        else "return=minimal"
    )

    try:
        async with httpx.AsyncClient(
            timeout=30.0,
        ) as client:
            response = await client.patch(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    f"{table}"
                ),
                params=params,
                json=values,
                headers=service_headers(
                    prefer=prefer,
                ),
            )
    except httpx.TimeoutException as exc:
        raise RuntimeError(
            (
                "Supabase took too long to "
                f"update {table}."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(
            f"Could not update {table}.",
        ) from exc

    if response.status_code not in (
        200,
        204,
    ):
        raise RuntimeError(
            response_error(
                response,
                (
                    "Supabase rejected a "
                    f"{table} update."
                ),
            ),
        )

    if not return_rows:
        return []

    data = response_json(response)

    if not isinstance(data, list):
        return []

    return [
        item
        for item in data
        if isinstance(item, dict)
    ]


async def find_device_by_token(
    device_token: str,
) -> dict[str, Any]:
    require_supabase_configuration()

    token_hash = hash_value(
        device_token,
    )

    try:
        devices = await supabase_get(
            "sync_devices",
            params={
                "select": (
                    "id,user_id,is_active,"
                    "last_successful_sync_at,"
                    "last_synced_fill_id"
                ),

                "device_token_hash":
                    f"eq.{token_hash}",

                "limit":
                    "1",
            },
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

    if not devices:
        raise HTTPException(
            status_code=401,
            detail=(
                "This TradeCoach Sync pairing "
                "is invalid or has been removed."
            ),
        )

    device = devices[0]

    if not device.get("is_active"):
        raise HTTPException(
            status_code=401,
            detail=(
                "This TradeCoach Sync device "
                "has been disabled."
            ),
        )

    return device


def normalize_event_record(
    event: BrokerSyncEvent,
    device: dict[str, Any],
) -> dict[str, Any]:
    event_type = (
        event.event_type.strip()
    )

    broker_event_id = (
        event.broker_event_id.strip()
    )

    if (
        not event_type
        or not broker_event_id
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Every event requires an "
                "event type and broker event ID."
            ),
        )

    return {
        "user_id":
            device["user_id"],

        "device_id":
            device["id"],

        "broker":
            event.broker,

        "event_type":
            event_type,

        "broker_event_id":
            broker_event_id,

        "account_external_id":
            (
                event
                .account_external_id
                .strip()
                if event.account_external_id
                else None
            ),

        "symbol":
            (
                event.symbol.strip()
                if event.symbol
                else None
            ),

        "occurred_at":
            datetime_to_utc_iso(
                event.occurred_at,
            ),

        "source":
            event.source,

        "status":
            "received",

        "payload":
            event.payload,
    }


async def save_broker_events(
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(
            timeout=30.0,
        ) as client:
            response = await client.post(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    "broker_sync_events"
                ),
                params={
                    "on_conflict": (
                        "user_id,broker,"
                        "broker_event_id"
                    ),
                },
                json=records,
                headers=service_headers(
                    prefer=(
                        "resolution=ignore-duplicates,"
                        "return=representation"
                    ),
                ),
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "Supabase took too long to "
                "save the broker events."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "The broker events could "
                "not be saved."
            ),
        ) from exc

    if response.status_code not in (
        200,
        201,
    ):
        error_message = response_error(
            response,
            (
                "Supabase rejected the "
                "broker events."
            ),
        )

        logger.error(
            "Broker event insert failed: %s",
            error_message,
        )

        raise HTTPException(
            status_code=502,
            detail=error_message,
        )

    inserted_events = response_json(
        response,
    )

    if not isinstance(
        inserted_events,
        list,
    ):
        return []

    return [
        item
        for item in inserted_events
        if isinstance(item, dict)
    ]


async def fetch_broker_event(
    *,
    user_id: str,
    broker: str,
    event_type: str,
    broker_event_id: str,
) -> dict[str, Any] | None:
    records = await supabase_get(
        "broker_sync_events",
        params={
            "select": (
                "id,user_id,device_id,broker,"
                "event_type,broker_event_id,"
                "account_external_id,symbol,"
                "occurred_at,source,payload"
            ),

            "user_id":
                f"eq.{user_id}",

            "broker":
                f"eq.{broker}",

            "event_type":
                f"eq.{event_type}",

            "broker_event_id":
                f"eq.{broker_event_id}",

            "limit":
                "1",
        },
    )

    if not records:
        return None

    return records[0]


async def fetch_contract_metadata(
    *,
    user_id: str,
    broker: str,
    contract_external_id: str,
) -> dict[str, Any] | None:
    records = await supabase_get(
        "broker_contract_metadata",
        params={
            "select": (
                "id,contract_external_id,"
                "contract_name,root_symbol,"
                "product_external_id,"
                "product_name,description,"
                "contract_maturity_external_id,"
                "expiration_month,expiration_at,"
                "tick_size,provider_tick_size,"
                "value_per_point,product_type,"
                "exchange_external_id"
            ),

            "user_id":
                f"eq.{user_id}",

            "broker":
                f"eq.{broker}",

            "contract_external_id":
                (
                    "eq."
                    f"{contract_external_id}"
                ),

            "limit":
                "1",
        },
    )

    if not records:
        return None

    return records[0]



def fill_fee_total_from_payload(
    payload: dict[str, Any],
) -> float | None:
    component_names = (
        "clearing_fee",
        "clearingFee",
        "exchange_fee",
        "exchangeFee",
        "nfa_fee",
        "nfaFee",
        "commission",
        "brokerage_fee",
        "brokerageFee",
        "ip_fee",
        "ipFee",
        "routing_fee",
        "routingFee",
    )

    values: list[float] = []

    seen_component_groups: set[str] = set()

    for name in component_names:
        normalized_group = (
            name.replace("_", "")
            .lower()
        )

        if normalized_group in seen_component_groups:
            continue

        value = safe_float(
            payload.get(name),
        )

        if value is None:
            continue

        seen_component_groups.add(
            normalized_group,
        )

        values.append(value)

    if not values:
        components = payload.get(
            "fee_components",
        )

        if not isinstance(
            components,
            dict,
        ):
            components = payload.get(
                "feeComponents",
            )

        if isinstance(
            components,
            dict,
        ):
            for value in components.values():
                number = safe_float(value)

                if number is not None:
                    values.append(number)

    if values:
        return sum(values)

    return first_float(
        payload.get("total_fee"),
        payload.get("totalFee"),
    )


async def fetch_fill_fee_event(
    *,
    user_id: str,
    broker: str,
    fill_id: str,
) -> dict[str, Any] | None:
    event = await fetch_broker_event(
        user_id=user_id,
        broker=broker,
        event_type="fill_fee",
        broker_event_id=(
            f"fill_fee:{fill_id}"
        ),
    )

    if event is not None:
        return event

    return await fetch_broker_event(
        user_id=user_id,
        broker=broker,
        event_type="fill_fee",
        broker_event_id=fill_id,
    )


def extract_event_payload(
    record: dict[str, Any] | None,
) -> dict[str, Any]:
    if not record:
        return {}

    payload = record.get("payload")

    if not isinstance(payload, dict):
        return {}

    return payload


async def get_trade_fee_state(
    *,
    user_id: str,
    broker: str,
    buy_fill_id: str,
    sell_fill_id: str,
) -> dict[str, Any]:
    buy_fee_event = (
        await fetch_fill_fee_event(
            user_id=user_id,
            broker=broker,
            fill_id=buy_fill_id,
        )
    )

    sell_fee_event = (
        await fetch_fill_fee_event(
            user_id=user_id,
            broker=broker,
            fill_id=sell_fill_id,
        )
    )

    buy_fee_payload = extract_event_payload(
        buy_fee_event,
    )

    sell_fee_payload = extract_event_payload(
        sell_fee_event,
    )

    buy_fee = (
        fill_fee_total_from_payload(
            buy_fee_payload,
        )
        if buy_fee_event
        else None
    )

    sell_fee = (
        fill_fee_total_from_payload(
            sell_fee_payload,
        )
        if sell_fee_event
        else None
    )

    complete = (
        buy_fee is not None
        and sell_fee is not None
    )

    total_fees = (
        buy_fee + sell_fee
        if complete
        else None
    )

    missing_fill_ids: list[str] = []

    if buy_fee is None:
        missing_fill_ids.append(
            buy_fill_id,
        )

    if sell_fee is None:
        missing_fill_ids.append(
            sell_fill_id,
        )

    return {
        "buy_fee":
            buy_fee,

        "sell_fee":
            sell_fee,

        "total_fees":
            total_fees,

        "complete":
            complete,

        "missing_fill_ids":
            missing_fill_ids,

        "buy_fee_payload":
            buy_fee_payload
            if buy_fee_event
            else None,

        "sell_fee_payload":
            sell_fee_payload
            if sell_fee_event
            else None,
    }



def metadata_source(
    source: str,
) -> str:
    if source == "manual_test":
        return "manual"

    if source in (
        "live",
        "reconciliation",
        "manual",
    ):
        return source

    return "live"


async def process_contract_metadata_event(
    *,
    event: BrokerSyncEvent,
    device: dict[str, Any],
) -> dict[str, Any]:
    payload = event.payload

    contract_id = first_string(
        payload.get("contract_id"),
        payload.get("contractId"),
    )

    if not contract_id:
        raise RuntimeError(
            (
                "The contract metadata event "
                "did not include contract_id."
            ),
        )

    now_iso = utc_now().isoformat()

    contract_name = first_string(
        payload.get("contract_name"),
        payload.get("contractName"),
    )

    root_symbol = first_string(
        payload.get("root_symbol"),
        payload.get("rootSymbol"),
        event.symbol,
    )

    product_id = first_string(
        payload.get("product_id"),
        payload.get("productId"),
    )

    product_name = first_string(
        payload.get("product_name"),
        payload.get("productName"),
    )

    maturity_id = first_string(
        payload.get(
            "contract_maturity_id",
        ),
        payload.get(
            "contractMaturityId",
        ),
    )

    expiration_month = safe_int(
        payload.get(
            "expiration_month",
            payload.get(
                "expirationMonth",
            ),
        ),
    )

    expiration_at = first_string(
        payload.get("expiration_at"),
        payload.get("expirationDate"),
    )

    tick_size = first_float(
        payload.get("tick_size"),
        payload.get("tickSize"),
    )

    provider_tick_size = first_float(
        payload.get(
            "provider_tick_size",
        ),
        payload.get(
            "providerTickSize",
        ),
    )

    value_per_point = first_float(
        payload.get("value_per_point"),
        payload.get("valuePerPoint"),
    )

    record = {
        "user_id":
            device["user_id"],

        "device_id":
            device["id"],

        "broker":
            event.broker,

        "contract_external_id":
            contract_id,

        "contract_name":
            contract_name,

        "root_symbol":
            root_symbol,

        "product_external_id":
            product_id,

        "product_name":
            product_name,

        "description":
            first_string(
                payload.get(
                    "description",
                ),
            ),

        "contract_maturity_external_id":
            maturity_id,

        "expiration_month":
            expiration_month,

        "expiration_at":
            expiration_at,

        "tick_size":
            tick_size,

        "provider_tick_size":
            provider_tick_size,

        "value_per_point":
            value_per_point,

        "product_type":
            first_string(
                payload.get(
                    "product_type",
                ),
                payload.get(
                    "productType",
                ),
            ),

        "exchange_external_id":
            first_string(
                payload.get(
                    "exchange_id",
                ),
                payload.get(
                    "exchangeId",
                ),
            ),

        "source":
            metadata_source(
                event.source,
            ),

        "raw_payload":
            payload,

        "last_seen_at":
            now_iso,

        "updated_at":
            now_iso,
    }

    await supabase_upsert(
        "broker_contract_metadata",
        records=record,
        on_conflict=(
            "user_id,broker,"
            "contract_external_id"
        ),
    )

    updated_trades = (
        await enrich_completed_trades_for_contract(
            user_id=device["user_id"],
            broker=event.broker,
            contract_id=contract_id,
            symbol=(
                root_symbol
                or contract_name
            ),
            value_per_point=(
                value_per_point
            ),
        )
    )

    logger.info(
        (
            "Stored metadata for %s and "
            "updated %s completed trade(s)."
        ),
        contract_name or contract_id,
        updated_trades,
    )

    return {
        "contract_id":
            contract_id,

        "symbol":
            root_symbol
            or contract_name,

        "value_per_point":
            value_per_point,

        "updated_trades":
            updated_trades,
    }


def extract_fill_payload(
    record: dict[str, Any],
) -> dict[str, Any]:
    payload = record.get("payload")

    if not isinstance(payload, dict):
        return {}

    return payload


def fill_account_id(
    record: dict[str, Any],
) -> str | None:
    payload = extract_fill_payload(
        record,
    )

    return first_string(
        record.get(
            "account_external_id",
        ),
        payload.get("account_id"),
        payload.get("accountId"),
    )


def fill_contract_id(
    record: dict[str, Any],
) -> str | None:
    payload = extract_fill_payload(
        record,
    )

    return first_string(
        payload.get("contract_id"),
        payload.get("contractId"),
    )


def fill_timestamp(
    record: dict[str, Any],
) -> datetime | None:
    payload = extract_fill_payload(
        record,
    )

    return parse_datetime(
        first_string(
            payload.get("timestamp"),
            record.get("occurred_at"),
        ),
    )


def fill_price(
    record: dict[str, Any],
) -> float | None:
    payload = extract_fill_payload(
        record,
    )

    return first_float(
        payload.get("price"),
    )


def fill_quantity(
    record: dict[str, Any],
) -> float | None:
    payload = extract_fill_payload(
        record,
    )

    return first_float(
        payload.get("qty"),
        payload.get("quantity"),
    )


async def upsert_waiting_trade(
    *,
    event: BrokerSyncEvent,
    device: dict[str, Any],
    pair_id: str,
    position_id: str | None,
    buy_fill_id: str,
    sell_fill_id: str,
    quantity: float | None,
    reason: str,
) -> None:
    now_iso = utc_now().isoformat()

    record = {
        "user_id":
            device["user_id"],

        "device_id":
            device["id"],

        "broker":
            event.broker,

        "broker_pair_id":
            pair_id,

        "position_external_id":
            position_id,

        "buy_fill_external_id":
            buy_fill_id,

        "sell_fill_external_id":
            sell_fill_id,

        "quantity":
            quantity,

        "source":
            event.source,

        "status":
            "waiting_for_fills",

        "raw_payload": {
            "fill_pair":
                event.payload,
        },

        "processing_error":
            reason,

        "updated_at":
            now_iso,
    }

    await supabase_upsert(
        "broker_completed_trades",
        records=record,
        on_conflict=(
            "user_id,broker,"
            "broker_pair_id"
        ),
    )


async def process_fill_pair_event(
    *,
    event: BrokerSyncEvent,
    device: dict[str, Any],
) -> dict[str, Any]:
    payload = event.payload

    pair_id = first_string(
        payload.get("pair_id"),
        payload.get("id"),
        event.broker_event_id,
    )

    buy_fill_id = first_string(
        payload.get("buy_fill_id"),
        payload.get("buyFillId"),
    )

    sell_fill_id = first_string(
        payload.get("sell_fill_id"),
        payload.get("sellFillId"),
    )

    position_id = first_string(
        payload.get("position_id"),
        payload.get("positionId"),
    )

    quantity = first_float(
        payload.get("qty"),
        payload.get("quantity"),
    )

    if (
        not pair_id
        or not buy_fill_id
        or not sell_fill_id
    ):
        raise RuntimeError(
            (
                "The fill-pair event is "
                "missing its pair or fill IDs."
            ),
        )

    buy_record = await fetch_broker_event(
        user_id=device["user_id"],
        broker=event.broker,
        event_type="fill",
        broker_event_id=buy_fill_id,
    )

    sell_record = await fetch_broker_event(
        user_id=device["user_id"],
        broker=event.broker,
        event_type="fill",
        broker_event_id=sell_fill_id,
    )

    if (
        buy_record is None
        or sell_record is None
    ):
        missing: list[str] = []

        if buy_record is None:
            missing.append(
                f"buy fill {buy_fill_id}",
            )

        if sell_record is None:
            missing.append(
                f"sell fill {sell_fill_id}",
            )

        reason = (
            "Waiting for "
            + " and ".join(missing)
            + "."
        )

        await upsert_waiting_trade(
            event=event,
            device=device,
            pair_id=pair_id,
            position_id=position_id,
            buy_fill_id=buy_fill_id,
            sell_fill_id=sell_fill_id,
            quantity=quantity,
            reason=reason,
        )

        return {
            "pair_id":
                pair_id,

            "status":
                "waiting_for_fills",

            "reason":
                reason,
        }

    buy_price = first_float(
        fill_price(buy_record),
        payload.get("buy_price"),
        payload.get("buyPrice"),
    )

    sell_price = first_float(
        fill_price(sell_record),
        payload.get("sell_price"),
        payload.get("sellPrice"),
    )

    if (
        buy_price is None
        or sell_price is None
    ):
        raise RuntimeError(
            (
                "The buy or sell fill did "
                "not contain a valid price."
            ),
        )

    quantity = first_float(
        quantity,
        fill_quantity(buy_record),
        fill_quantity(sell_record),
    )

    if (
        quantity is None
        or quantity <= 0
    ):
        raise RuntimeError(
            (
                "The fill pair did not "
                "contain a valid quantity."
            ),
        )

    buy_time = fill_timestamp(
        buy_record,
    )

    sell_time = fill_timestamp(
        sell_record,
    )

    if (
        buy_time is None
        or sell_time is None
    ):
        raise RuntimeError(
            (
                "The fill timestamps could "
                "not be determined."
            ),
        )

    if buy_time <= sell_time:
        direction = "long"
        entry_price = buy_price
        exit_price = sell_price
        entry_at = buy_time
        exit_at = sell_time
    else:
        direction = "short"
        entry_price = sell_price
        exit_price = buy_price
        entry_at = sell_time
        exit_at = buy_time

    duration_seconds = max(
        0.0,
        (
            exit_at - entry_at
        ).total_seconds(),
    )

    gross_points = (
        sell_price - buy_price
    )

    contract_id = first_string(
        fill_contract_id(
            buy_record,
        ),
        fill_contract_id(
            sell_record,
        ),
    )

    account_id = first_string(
        fill_account_id(
            buy_record,
        ),
        fill_account_id(
            sell_record,
        ),
    )

    metadata = None

    if contract_id:
        metadata = (
            await fetch_contract_metadata(
                user_id=device["user_id"],
                broker=event.broker,
                contract_external_id=(
                    contract_id
                ),
            )
        )

    symbol = None
    point_value = None

    if metadata:
        symbol = first_string(
            metadata.get(
                "root_symbol",
            ),
            metadata.get(
                "contract_name",
            ),
        )

        point_value = safe_float(
            metadata.get(
                "value_per_point",
            ),
        )

    gross_pnl = None

    if point_value is not None:
        gross_pnl = (
            gross_points
            * point_value
            * quantity
        )

    fee_state = (
        await get_trade_fee_state(
            user_id=device["user_id"],
            broker=event.broker,
            buy_fill_id=buy_fill_id,
            sell_fill_id=sell_fill_id,
        )
    )

    fees = fee_state[
        "total_fees"
    ]

    net_pnl = (
        gross_pnl - fees
        if (
            gross_pnl is not None
            and fees is not None
        )
        else None
    )

    metadata_complete = (
        symbol is not None
        and point_value is not None
        and gross_pnl is not None
    )

    fees_complete = bool(
        fee_state["complete"],
    )

    status = (
        "processed"
        if (
            metadata_complete
            and fees_complete
            and net_pnl is not None
        )
        else "ready"
    )

    processing_error = None

    if not metadata_complete:
        processing_error = (
            "Waiting for contract metadata."
        )
    elif not fees_complete:
        processing_error = (
            "Waiting for fill fees for: "
            + ", ".join(
                fee_state[
                    "missing_fill_ids"
                ],
            )
            + "."
        )

    now_iso = utc_now().isoformat()

    completed_trade = {
        "user_id":
            device["user_id"],

        "device_id":
            device["id"],

        "broker":
            event.broker,

        "broker_pair_id":
            pair_id,

        "position_external_id":
            position_id,

        "buy_fill_external_id":
            buy_fill_id,

        "sell_fill_external_id":
            sell_fill_id,

        "contract_external_id":
            contract_id,

        "account_external_id":
            account_id,

        "symbol":
            symbol,

        "direction":
            direction,

        "quantity":
            quantity,

        "buy_price":
            buy_price,

        "sell_price":
            sell_price,

        "entry_price":
            entry_price,

        "exit_price":
            exit_price,

        "entry_at":
            entry_at.isoformat(),

        "exit_at":
            exit_at.isoformat(),

        "duration_seconds":
            duration_seconds,

        "gross_points":
            gross_points,

        "point_value":
            point_value,

        "gross_pnl":
            gross_pnl,

        "fees":
            fees,

        "net_pnl":
            net_pnl,

        "source":
            event.source,

        "status":
            status,

        "raw_payload": {
            "fill_pair":
                payload,

            "buy_fill":
                extract_fill_payload(
                    buy_record,
                ),

            "sell_fill":
                extract_fill_payload(
                    sell_record,
                ),

            "buy_fill_fee":
                fee_state[
                    "buy_fee_payload"
                ],

            "sell_fill_fee":
                fee_state[
                    "sell_fee_payload"
                ],
        },

        "processing_error":
            processing_error,

        "processed_at":
            (
                now_iso
                if status == "processed"
                else None
            ),

        "updated_at":
            now_iso,
    }

    await supabase_upsert(
        "broker_completed_trades",
        records=completed_trade,
        on_conflict=(
            "user_id,broker,"
            "broker_pair_id"
        ),
    )

    logger.info(
        (
            "Completed %s %s trade: "
            "%s points, gross P&L %s, "
            "fees %s, net P&L %s."
        ),
        symbol or contract_id or "unknown",
        direction,
        gross_points,
        gross_pnl,
        fees,
        net_pnl,
    )

    return {
        "pair_id":
            pair_id,

        "status":
            status,

        "direction":
            direction,

        "symbol":
            symbol,

        "contract_id":
            contract_id,

        "account_id":
            account_id,

        "gross_points":
            gross_points,

        "point_value":
            point_value,

        "gross_pnl":
            gross_pnl,

        "fees":
            fees,

        "net_pnl":
            net_pnl,

        "missing_fee_fill_ids":
            fee_state[
                "missing_fill_ids"
            ],
    }


async def update_completed_trades_for_fill_fee(
    *,
    user_id: str,
    broker: str,
    fill_id: str,
) -> int:
    encoded_fill_id = quote(
        fill_id,
        safe="",
    )

    trades = await supabase_get(
        "broker_completed_trades",
        params={
            "select": (
                "id,buy_fill_external_id,"
                "sell_fill_external_id,"
                "gross_pnl,raw_payload,status"
            ),

            "user_id":
                f"eq.{user_id}",

            "broker":
                f"eq.{broker}",

            "or": (
                "("
                "buy_fill_external_id.eq."
                f"{encoded_fill_id},"
                "sell_fill_external_id.eq."
                f"{encoded_fill_id}"
                ")"
            ),
        },
    )

    updated_count = 0

    for trade in trades:
        trade_id = safe_string(
            trade.get("id"),
        )

        buy_fill_id = safe_string(
            trade.get(
                "buy_fill_external_id",
            ),
        )

        sell_fill_id = safe_string(
            trade.get(
                "sell_fill_external_id",
            ),
        )

        if (
            not trade_id
            or not buy_fill_id
            or not sell_fill_id
        ):
            continue

        fee_state = (
            await get_trade_fee_state(
                user_id=user_id,
                broker=broker,
                buy_fill_id=buy_fill_id,
                sell_fill_id=sell_fill_id,
            )
        )

        fees = fee_state[
            "total_fees"
        ]

        gross_pnl = safe_float(
            trade.get("gross_pnl"),
        )

        net_pnl = (
            gross_pnl - fees
            if (
                gross_pnl is not None
                and fees is not None
            )
            else None
        )

        raw_payload = trade.get(
            "raw_payload",
        )

        if not isinstance(
            raw_payload,
            dict,
        ):
            raw_payload = {}

        updated_raw_payload = {
            **raw_payload,

            "buy_fill_fee":
                fee_state[
                    "buy_fee_payload"
                ],

            "sell_fill_fee":
                fee_state[
                    "sell_fee_payload"
                ],
        }

        complete = (
            fee_state["complete"]
            and gross_pnl is not None
            and net_pnl is not None
        )

        processing_error = (
            None
            if complete
            else (
                "Waiting for fill fees for: "
                + ", ".join(
                    fee_state[
                        "missing_fill_ids"
                    ],
                )
                + "."
            )
        )

        values: dict[str, Any] = {
            "fees":
                fees,

            "net_pnl":
                net_pnl,

            "raw_payload":
                updated_raw_payload,

            "status":
                (
                    "processed"
                    if complete
                    else "ready"
                ),

            "processing_error":
                processing_error,

            "processed_at":
                (
                    utc_now().isoformat()
                    if complete
                    else None
                ),

            "updated_at":
                utc_now().isoformat(),
        }

        await supabase_patch(
            "broker_completed_trades",
            params={
                "id":
                    f"eq.{trade_id}",
            },
            values=values,
        )

        updated_count += 1

    return updated_count


async def process_fill_fee_event(
    *,
    event: BrokerSyncEvent,
    device: dict[str, Any],
) -> dict[str, Any]:
    payload = event.payload

    fill_id = first_string(
        payload.get("fill_id"),
        payload.get("fillId"),
    )

    if not fill_id:
        broker_event_id = (
            event.broker_event_id.strip()
        )

        prefix = "fill_fee:"

        if broker_event_id.startswith(
            prefix,
        ):
            fill_id = broker_event_id[
                len(prefix):
            ]
        else:
            fill_id = broker_event_id

    total_fee = (
        fill_fee_total_from_payload(
            payload,
        )
    )

    if total_fee is None:
        raise RuntimeError(
            (
                "The fill-fee event did not "
                "contain a valid fee amount."
            ),
        )

    updated_trades = (
        await update_completed_trades_for_fill_fee(
            user_id=device["user_id"],
            broker=event.broker,
            fill_id=fill_id,
        )
    )

    logger.info(
        (
            "Stored fill fee %s for fill %s "
            "and updated %s trade(s)."
        ),
        total_fee,
        fill_id,
        updated_trades,
    )

    return {
        "fill_id":
            fill_id,

        "total_fee":
            total_fee,

        "updated_trades":
            updated_trades,
    }


async def retry_waiting_trades_for_fill(
    *,
    event: BrokerSyncEvent,
    device: dict[str, Any],
) -> int:
    fill_id = (
        event.broker_event_id.strip()
    )

    encoded_fill_id = quote(
        fill_id,
        safe="",
    )

    waiting_trades = await supabase_get(
        "broker_completed_trades",
        params={
            "select": (
                "broker_pair_id,"
                "position_external_id,"
                "buy_fill_external_id,"
                "sell_fill_external_id,"
                "quantity,source,raw_payload"
            ),

            "user_id":
                f"eq.{device['user_id']}",

            "broker":
                f"eq.{event.broker}",

            "status":
                "eq.waiting_for_fills",

            "or": (
                "("
                "buy_fill_external_id.eq."
                f"{encoded_fill_id},"
                "sell_fill_external_id.eq."
                f"{encoded_fill_id}"
                ")"
            ),
        },
    )

    processed_count = 0

    for waiting in waiting_trades:
        raw_payload = waiting.get(
            "raw_payload",
        )

        pair_payload: dict[str, Any] = {}

        if isinstance(
            raw_payload,
            dict,
        ):
            stored_pair = raw_payload.get(
                "fill_pair",
            )

            if isinstance(
                stored_pair,
                dict,
            ):
                pair_payload = {
                    **stored_pair,
                }

        pair_id = safe_string(
            waiting.get(
                "broker_pair_id",
            ),
        )

        buy_fill_id = safe_string(
            waiting.get(
                "buy_fill_external_id",
            ),
        )

        sell_fill_id = safe_string(
            waiting.get(
                "sell_fill_external_id",
            ),
        )

        if (
            not pair_id
            or not buy_fill_id
            or not sell_fill_id
        ):
            continue

        pair_payload.setdefault(
            "pair_id",
            pair_id,
        )

        pair_payload.setdefault(
            "position_id",
            waiting.get(
                "position_external_id",
            ),
        )

        pair_payload.setdefault(
            "buy_fill_id",
            buy_fill_id,
        )

        pair_payload.setdefault(
            "sell_fill_id",
            sell_fill_id,
        )

        pair_payload.setdefault(
            "qty",
            waiting.get(
                "quantity",
            ),
        )

        synthetic_event = BrokerSyncEvent(
            broker=event.broker,
            event_type="fill_pair",
            broker_event_id=pair_id,
            occurred_at=event.occurred_at,
            source=(
                waiting.get("source")
                if waiting.get("source")
                in (
                    "live",
                    "reconciliation",
                    "manual_test",
                )
                else "live"
            ),
            payload=pair_payload,
        )

        result = await process_fill_pair_event(
            event=synthetic_event,
            device=device,
        )

        if result.get("status") in (
            "ready",
            "processed",
        ):
            processed_count += 1

    return processed_count


def raw_trade_account_id(
    raw_payload: Any,
) -> str | None:
    if not isinstance(
        raw_payload,
        dict,
    ):
        return None

    buy_fill = raw_payload.get(
        "buy_fill",
    )

    sell_fill = raw_payload.get(
        "sell_fill",
    )

    if not isinstance(
        buy_fill,
        dict,
    ):
        buy_fill = {}

    if not isinstance(
        sell_fill,
        dict,
    ):
        sell_fill = {}

    return first_string(
        buy_fill.get("account_id"),
        buy_fill.get("accountId"),
        sell_fill.get("account_id"),
        sell_fill.get("accountId"),
    )


async def enrich_completed_trades_for_contract(
    *,
    user_id: str,
    broker: str,
    contract_id: str,
    symbol: str | None,
    value_per_point: float | None,
) -> int:
    trades = await supabase_get(
        "broker_completed_trades",
        params={
            "select": (
                "id,quantity,gross_points,"
                "fees,account_external_id,"
                "raw_payload,status,"
                "processing_error"
            ),

            "user_id":
                f"eq.{user_id}",

            "broker":
                f"eq.{broker}",

            "contract_external_id":
                f"eq.{contract_id}",
        },
    )

    updated_count = 0

    for trade in trades:
        trade_id = safe_string(
            trade.get("id"),
        )

        if not trade_id:
            continue

        quantity = safe_float(
            trade.get("quantity"),
        )

        gross_points = safe_float(
            trade.get("gross_points"),
        )

        fees = safe_float(
            trade.get("fees"),
        )

        gross_pnl = None
        net_pnl = None

        if (
            value_per_point is not None
            and quantity is not None
            and gross_points is not None
        ):
            gross_pnl = (
                value_per_point
                * quantity
                * gross_points
            )

            if fees is not None:
                net_pnl = (
                    gross_pnl - fees
                )

        account_id = first_string(
            trade.get(
                "account_external_id",
            ),
            raw_trade_account_id(
                trade.get(
                    "raw_payload",
                ),
            ),
        )

        metadata_complete = (
            symbol is not None
            and value_per_point is not None
            and gross_pnl is not None
        )

        fully_processed = (
            metadata_complete
            and fees is not None
            and net_pnl is not None
        )

        processing_error = None

        if not metadata_complete:
            processing_error = (
                "Waiting for contract metadata."
            )
        elif fees is None:
            processing_error = (
                trade.get(
                    "processing_error",
                )
                or "Waiting for fill fees."
            )

        values: dict[str, Any] = {
            "symbol":
                symbol,

            "point_value":
                value_per_point,

            "gross_pnl":
                gross_pnl,

            "account_external_id":
                account_id,

            "status":
                (
                    "processed"
                    if fully_processed
                    else "ready"
                ),

            "processing_error":
                processing_error,

            "processed_at":
                (
                    utc_now().isoformat()
                    if fully_processed
                    else None
                ),

            "updated_at":
                utc_now().isoformat(),
        }

        if net_pnl is not None:
            values["net_pnl"] = (
                net_pnl
            )

        await supabase_patch(
            "broker_completed_trades",
            params={
                "id":
                    f"eq.{trade_id}",
            },
            values=values,
        )

        updated_count += 1

    return updated_count


async def ensure_tradingview_account_record(
    *,
    user_id: str,
    account_external_id: str,
    account_name: str | None,
    is_paper: bool,
    connected_broker: str | None,
) -> None:
    # Only maintain TradingView paper/session rows here. Prop firm fills
    # connected through TradingView stay on completed trades, not broker_accounts.
    if connected_broker and not is_paper:
        return

    broker_name = "TradingView"

    resolved_name = account_name or (
        "TradingView Paper"
        if is_paper
        else "TradingView Session"
    )

    existing_accounts = await supabase_get(
        "broker_accounts",
        params={
            "select":
                "id",
            "user_id":
                f"eq.{user_id}",
            "broker_name":
                f"eq.{broker_name}",
            "account_name":
                f"eq.{resolved_name}",
            "limit":
                "1",
        },
    )

    now_iso = utc_now().isoformat()

    values = {
        "status":
            "connected",
        "is_active":
            True,
        "last_synced_at":
            now_iso,
        "account_name":
            resolved_name,
    }

    if existing_accounts:
        await supabase_patch(
            "broker_accounts",
            params={
                "id":
                    f"eq.{existing_accounts[0]['id']}",
            },
            values=values,
        )
        return

    insert_values = {
        **values,
        "user_id":
            user_id,
        "broker_name":
            broker_name,
        "account_number_masked":
            account_external_id[-12:],
        "environment":
            "demo"
            if is_paper
            else "live",
        "currency":
            "USD",
    }

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            response = await client.post(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    "broker_accounts"
                ),
                json=insert_values,
                headers=service_headers(
                    prefer="return=minimal",
                ),
            )
    except httpx.RequestError:
        return

    if response.status_code not in (
        200,
        201,
    ):
        return


async def find_semantic_duplicate_trade(
    *,
    user_id: str,
    broker: str,
    symbol: str,
    direction: str,
    quantity: float,
    entry_price: float,
    exit_price: float,
    entry_at: datetime,
    exit_at: datetime,
) -> dict[str, Any] | None:
    candidates = await supabase_get(
        "broker_completed_trades",
        params={
            "user_id": f"eq.{user_id}",
            "broker": f"eq.{broker}",
            "symbol": f"eq.{symbol}",
            "direction": f"eq.{direction}",
            "quantity": f"eq.{quantity}",
            "select": (
                "id,broker_pair_id,entry_price,"
                "exit_price,entry_at,exit_at,net_pnl"
            ),
            "order": "exit_at.desc",
            "limit": "25",
        },
    )

    for row in candidates:
        row_entry = parse_datetime(
            row.get("entry_at"),
        )
        row_exit = parse_datetime(
            row.get("exit_at"),
        )
        row_entry_price = safe_float(
            row.get("entry_price"),
        )
        row_exit_price = safe_float(
            row.get("exit_price"),
        )

        if (
            row_entry is None
            or row_exit is None
            or row_entry_price is None
            or row_exit_price is None
        ):
            continue

        if abs(row_entry_price - entry_price) > 0.05:
            continue

        if abs(row_exit_price - exit_price) > 0.05:
            continue

        if abs(
            (
                row_entry - entry_at
            ).total_seconds(),
        ) > 120:
            continue

        if abs(
            (
                row_exit - exit_at
            ).total_seconds(),
        ) > 120:
            continue

        return row

    return None


async def get_active_trading_profile_id(
    user_id: str,
) -> str | None:
    rows = await supabase_get(
        "trading_profiles",
        params={
            "select": "id,name",
            "user_id": f"eq.{user_id}",
            "is_active": "eq.true",
            "limit": "1",
        },
    )

    if not rows:
        return None

    profile_id = first_string(
        rows[0].get("id"),
    )

    return profile_id


async def get_active_trading_profile(
    user_id: str,
) -> dict[str, Any] | None:
    rows = await supabase_get(
        "trading_profiles",
        params={
            "select": "id,name",
            "user_id": f"eq.{user_id}",
            "is_active": "eq.true",
            "limit": "1",
        },
    )

    if not rows:
        return None

    return rows[0]


async def resolve_trading_profile_id(
    *,
    user_id: str,
    payload: dict[str, Any],
) -> str | None:
    requested = first_string(
        payload.get("trading_profile_id"),
    )

    if requested:
        rows = await supabase_get(
            "trading_profiles",
            params={
                "select": "id",
                "user_id": f"eq.{user_id}",
                "id": f"eq.{requested}",
                "limit": "1",
            },
        )

        if rows:
            return requested

    return await get_active_trading_profile_id(
        user_id,
    )


async def process_completed_trade_event(
    *,
    event: BrokerSyncEvent,
    device: dict[str, Any],
) -> dict[str, Any]:
    payload = event.payload

    pair_id = first_string(
        payload.get("pair_id"),
        event.broker_event_id,
    )

    symbol = first_string(
        payload.get("symbol"),
        event.symbol,
    )

    direction = first_string(
        payload.get("direction"),
    )

    quantity = first_float(
        payload.get("quantity"),
    )

    entry_price = first_float(
        payload.get("entry_price"),
        payload.get("entryPrice"),
    )

    exit_price = first_float(
        payload.get("exit_price"),
        payload.get("exitPrice"),
    )

    entry_at = parse_datetime(
        first_string(
            payload.get("entry_at"),
            payload.get("entryAt"),
        ),
    )

    exit_at = parse_datetime(
        first_string(
            payload.get("exit_at"),
            payload.get("exitAt"),
        ),
    ) or parse_datetime(event.occurred_at)

    if (
        not pair_id
        or not symbol
        or direction not in (
            "long",
            "short",
        )
        or quantity is None
        or quantity <= 0
        or entry_price is None
        or exit_price is None
        or entry_at is None
        or exit_at is None
    ):
        raise RuntimeError(
            (
                "The completed trade event is "
                "missing required trade fields."
            ),
        )

    buy_price = (
        entry_price
        if direction == "long"
        else exit_price
    )

    sell_price = (
        exit_price
        if direction == "long"
        else entry_price
    )

    duration_seconds = max(
        0.0,
        (
            exit_at - entry_at
        ).total_seconds(),
    )

    gross_points = (
        exit_price - entry_price
        if direction == "long"
        else entry_price - exit_price
    )

    point_value = first_float(
        payload.get("point_value"),
    )

    if point_value is None:
        point_value = get_futures_point_value(
            symbol,
        )

    fees = first_float(
        payload.get("fees"),
    ) or 0.0

    net_pnl = first_float(
        payload.get("net_pnl"),
    )

    gross_pnl = (
        gross_points
        * point_value
        * quantity
    )

    if net_pnl is None:
        net_pnl = gross_pnl - fees

    duplicate = await find_semantic_duplicate_trade(
        user_id=device["user_id"],
        broker=event.broker,
        symbol=symbol,
        direction=direction,
        quantity=quantity,
        entry_price=entry_price,
        exit_price=exit_price,
        entry_at=entry_at,
        exit_at=exit_at,
    )

    if (
        duplicate
        and duplicate.get("broker_pair_id") != pair_id
    ):
        return {
            "pair_id":
                duplicate.get("broker_pair_id"),

            "status":
                "duplicate_skipped",

            "symbol":
                symbol,

            "net_pnl":
                safe_float(
                    duplicate.get("net_pnl"),
                ),
        }

    account_external_id = first_string(
        payload.get(
            "account_external_id",
        ),
        event.account_external_id,
    ) or "tv:unknown"

    account_name = first_string(
        payload.get("account_name"),
    )

    is_paper = bool(
        payload.get("is_paper"),
    )

    connected_broker = first_string(
        payload.get("connected_broker"),
    )

    buy_fill_id = first_string(
        payload.get("buy_fill_id"),
    ) or f"tv-buy:{pair_id}"

    sell_fill_id = first_string(
        payload.get("sell_fill_id"),
    ) or f"tv-sell:{pair_id}"

    now_iso = utc_now().isoformat()

    trading_profile_id = await resolve_trading_profile_id(
        user_id=device["user_id"],
        payload=payload,
    )

    completed_trade = {
        "user_id":
            device["user_id"],

        "device_id":
            device["id"],

        "trading_profile_id":
            trading_profile_id,

        "broker":
            event.broker,

        "broker_pair_id":
            pair_id,

        "buy_fill_external_id":
            buy_fill_id,

        "sell_fill_external_id":
            sell_fill_id,

        "account_external_id":
            account_external_id,

        "symbol":
            symbol,

        "direction":
            direction,

        "quantity":
            quantity,

        "buy_price":
            buy_price,

        "sell_price":
            sell_price,

        "entry_price":
            entry_price,

        "exit_price":
            exit_price,

        "entry_at":
            entry_at.isoformat(),

        "exit_at":
            exit_at.isoformat(),

        "duration_seconds":
            duration_seconds,

        "gross_points":
            gross_points,

        "point_value":
            point_value,

        "gross_pnl":
            gross_pnl,

        "fees":
            fees,

        "net_pnl":
            net_pnl,

        "source":
            event.source,

        "status":
            "processed",

        "processing_error":
            None,

        "processed_at":
            now_iso,

        "updated_at":
            now_iso,

        "raw_payload": {
            "completed_trade":
                payload,

            "import_source":
                "extension",

            "account_name":
                account_name,

            "is_paper":
                is_paper,

            "connected_broker":
                connected_broker,
        },
    }

    await supabase_upsert(
        "broker_completed_trades",
        records=completed_trade,
        on_conflict=(
            "user_id,broker,"
            "broker_pair_id"
        ),
    )

    if event.broker == "tradingview":
        await ensure_tradingview_account_record(
            user_id=device["user_id"],
            account_external_id=account_external_id,
            account_name=account_name,
            is_paper=is_paper,
            connected_broker=connected_broker,
        )

    return {
        "pair_id":
            pair_id,

        "status":
            "processed",

        "symbol":
            symbol,

        "net_pnl":
            net_pnl,
    }


async def process_received_event(
    *,
    event: BrokerSyncEvent,
    device: dict[str, Any],
) -> dict[str, Any]:
    event_type = (
        event.event_type
        .strip()
        .lower()
    )

    if event_type == "contract_metadata":
        result = (
            await process_contract_metadata_event(
                event=event,
                device=device,
            )
        )

        return {
            "event_type":
                event_type,

            "broker_event_id":
                event.broker_event_id,

            "result":
                result,
        }

    if event_type == "fill_fee":
        result = await process_fill_fee_event(
            event=event,
            device=device,
        )

        return {
            "event_type":
                event_type,

            "broker_event_id":
                event.broker_event_id,

            "result":
                result,
        }

    if event_type == "fill_pair":
        result = await process_fill_pair_event(
            event=event,
            device=device,
        )

        return {
            "event_type":
                event_type,

            "broker_event_id":
                event.broker_event_id,

            "result":
                result,
        }

    if event_type == "completed_trade":
        result = (
            await process_completed_trade_event(
                event=event,
                device=device,
            )
        )

        return {
            "event_type":
                event_type,

            "broker_event_id":
                event.broker_event_id,

            "result":
                result,
        }

    if event_type in (
        "fill",
        "execution",
    ):
        retried = (
            await retry_waiting_trades_for_fill(
                event=event,
                device=device,
            )
        )

        return {
            "event_type":
                event_type,

            "broker_event_id":
                event.broker_event_id,

            "result": {
                "waiting_trades_retried":
                    retried,
            },
        }

    return {
        "event_type":
            event_type,

        "broker_event_id":
            event.broker_event_id,

        "result": {
            "status":
                "stored_only",
        },
    }


async def update_device_sync_status(
    *,
    device: dict[str, Any],
    events: list[BrokerSyncEvent],
) -> None:
    latest_fill_id: str | None = None

    for event in reversed(events):
        if (
            event.event_type
            .strip()
            .lower()
            in (
                "fill",
                "execution",
            )
        ):
            latest_fill_id = (
                event
                .broker_event_id
                .strip()
            )

            break

    sync_time = utc_now().isoformat()

    device_update: dict[str, Any] = {
        "last_seen_at":
            sync_time,

        "last_successful_sync_at":
            sync_time,
    }

    if latest_fill_id:
        device_update[
            "last_synced_fill_id"
        ] = latest_fill_id

    try:
        await supabase_patch(
            "sync_devices",
            params={
                "id":
                    f"eq.{device['id']}",
            },
            values=device_update,
        )
    except RuntimeError as exc:
        logger.warning(
            (
                "Events were saved, but the "
                "device sync time was not "
                "updated: %s"
            ),
            exc,
        )


@router.post("/events")
async def receive_broker_events(
    request: BrokerSyncEventsRequest,
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

    if not request.events:
        raise HTTPException(
            status_code=400,
            detail=(
                "At least one broker event "
                "is required."
            ),
        )

    if (
        len(request.events)
        > MAX_EVENTS_PER_REQUEST
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "A maximum of "
                f"{MAX_EVENTS_PER_REQUEST} events "
                "may be sent at once."
            ),
        )

    records = [
        normalize_event_record(
            event,
            device,
        )
        for event in request.events
    ]

    inserted_events = (
        await save_broker_events(
            records,
        )
    )

    processing_results: list[
        dict[str, Any]
    ] = []

    processing_errors: list[
        dict[str, str]
    ] = []

    for event in request.events:
        try:
            result = (
                await process_received_event(
                    event=event,
                    device=device,
                )
            )

            processing_results.append(
                result,
            )
        except Exception as exc:
            logger.exception(
                (
                    "Broker event processing "
                    "failed for %s:%s"
                ),
                event.event_type,
                event.broker_event_id,
            )

            processing_errors.append(
                {
                    "event_type":
                        event.event_type,

                    "broker_event_id":
                        (
                            event
                            .broker_event_id
                        ),

                    "error":
                        str(exc),
                }
            )

    await update_device_sync_status(
        device=device,
        events=request.events,
    )

    inserted_count = len(
        inserted_events,
    )

    duplicate_count = max(
        0,
        len(records) - inserted_count,
    )

    response_message = (
        f"Saved {inserted_count} new event"
        f"{'' if inserted_count == 1 else 's'} "
        "and processed "
        f"{len(processing_results)} event"
        f"{'' if len(processing_results) == 1 else 's'}."
    )

    if processing_errors:
        response_message = (
            f"{response_message} "
            f"First error: {processing_errors[0]['error']}"
        )

    return {
        "success":
            len(processing_errors) == 0,

        "received_count":
            len(records),

        "inserted_count":
            inserted_count,

        "duplicate_count":
            duplicate_count,

        "processed_count":
            len(processing_results),

        "processing_error_count":
            len(processing_errors),

        "processing_results":
            processing_results,

        "processing_errors":
            processing_errors,

        "message": response_message,
    }


class BrokerSessionRequest(BaseModel):
    broker: Literal["tradingview"]
    page_url: str | None = None


BROKER_SESSION_NAMES = {
    "tradingview": "TradingView",
}


async def register_broker_session(
    *,
    user_id: str,
    broker: str,
    page_url: str | None = None,
) -> dict[str, Any]:
    broker_name = BROKER_SESSION_NAMES.get(
        broker,
        broker,
    )

    now = utc_now().isoformat()

    existing_accounts = await supabase_get(
        "broker_accounts",
        params={
            "select":
                "id,status",
            "user_id":
                f"eq.{user_id}",
            "broker_name":
                f"eq.{broker_name}",
            "limit":
                "1",
        },
    )

    values = {
        "status":
            "connected",
        "is_active":
            True,
        "last_synced_at":
            now,
    }

    if page_url:
        values["account_name"] = (
            "TradingView Session"
            if broker == "tradingview"
            else f"{broker_name} Web Session"
        )

    if existing_accounts:
        account_id = existing_accounts[0]["id"]

        await supabase_patch(
            "broker_accounts",
            params={
                "id":
                    f"eq.{account_id}",
            },
            values=values,
        )

        return {
            "broker":
                broker,
            "broker_name":
                broker_name,
            "account_id":
                account_id,
            "status":
                "connected",
            "updated":
                True,
        }

    insert_values = {
        **values,
        "user_id":
            user_id,
        "broker_name":
            broker_name,
        "account_name":
            values.get(
                "account_name",
                (
                    "TradingView Session"
                    if broker == "tradingview"
                    else f"{broker_name} Web Session"
                ),
            ),
        "environment":
            "live",
        "currency":
            "USD",
    }

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
        ) as client:
            response = await client.post(
                (
                    f"{SUPABASE_URL}/rest/v1/"
                    "broker_accounts"
                ),
                json=insert_values,
                headers=service_headers(
                    prefer=(
                        "return=representation"
                    ),
                ),
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not save the broker "
                "connection."
            ),
        ) from exc

    if response.status_code not in (
        200,
        201,
    ):
        raise HTTPException(
            status_code=502,
            detail=response_error(
                response,
                (
                    "Supabase rejected the broker "
                    "connection update."
                ),
            ),
        )

    created = response_json(response)

    account_id = None

    if (
        isinstance(created, list)
        and created
        and isinstance(created[0], dict)
    ):
        account_id = created[0].get("id")

    return {
        "broker":
            broker,
        "broker_name":
            broker_name,
        "account_id":
            account_id,
        "status":
            "connected",
        "updated":
            False,
    }


@router.post("/broker-session")
async def save_broker_session(
    request: BrokerSessionRequest,
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

    result = await register_broker_session(
        user_id=device["user_id"],
        broker=request.broker,
        page_url=request.page_url,
    )

    return {
        "success":
            True,
        **result,
        "message": (
            f"{result['broker_name']} is now "
            "connected in TradeCoach."
        ),
    }