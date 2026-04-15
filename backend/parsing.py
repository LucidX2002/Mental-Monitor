from __future__ import annotations

import ast
import re
from datetime import datetime


TIMESTAMP_PATTERN = re.compile(r"Timestamp\('([^']+)'\)")


def _try_literal_eval(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, list):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return ast.literal_eval(text)
    except (SyntaxError, ValueError):
        return None


def parse_post_list(value: object) -> list[str]:
    parsed = _try_literal_eval(value)
    if isinstance(parsed, list):
        return [str(item) for item in parsed if str(item).strip()]
    if value is None:
        return []
    text = str(value)
    return [text] if text.strip() else []


def parse_string_list(value: object) -> list[str]:
    parsed = _try_literal_eval(value)
    if isinstance(parsed, list):
        return [str(item) for item in parsed if str(item).strip()]
    if value is None:
        return []
    text = str(value)
    return [text] if text.strip() else []


def _to_iso_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text).isoformat()
    except ValueError:
        return text


def parse_timestamp_list(value: object) -> list[str]:
    if value is None:
        return []

    text = str(value)
    matches = TIMESTAMP_PATTERN.findall(text)
    if matches:
        return [datetime.fromisoformat(item).isoformat() for item in matches]

    parsed = _try_literal_eval(value)
    if isinstance(parsed, list):
        return [iso_value for item in parsed if (iso_value := _to_iso_text(item))]

    return []

