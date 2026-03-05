from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any


def _normalize_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def emit_notification_event(logger: logging.Logger, *, event: str, **fields: Any) -> None:
    payload = {"event": event, **{k: _normalize_value(v) for k, v in fields.items()}}
    logger.info("notification_event %s", json.dumps(payload, sort_keys=True, ensure_ascii=True))
