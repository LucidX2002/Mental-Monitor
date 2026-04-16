from __future__ import annotations

import copy
from datetime import datetime, timezone
import json
from functools import cached_property
from pathlib import Path
import threading
from typing import Any

import numpy as np
import pandas as pd

from backend.config import BackendPaths
from backend.parsing import parse_post_list, parse_string_list, parse_timestamp_list


class MentalRepository:
    def __init__(self, paths: BackendPaths | None = None) -> None:
        self.paths = paths or BackendPaths.from_environment()
        self.paths.state_json.parent.mkdir(parents=True, exist_ok=True)
        self._state_lock = threading.RLock()
        self._state_cache: dict[str, Any] | None = None

    @cached_property
    def frame(self) -> pd.DataFrame:
        personality = pd.read_csv(self.paths.personality_csv).sort_values("sim_user_id")
        behavior = pd.read_csv(self.paths.behavior_csv).sort_values("sim_user_id")
        posts = pd.read_csv(self.paths.posts_csv).sort_values("sim_user_id")

        merged = personality.merge(behavior, on="sim_user_id", how="inner")
        merged = merged.merge(posts, on="sim_user_id", how="inner")
        merged = merged.reset_index(drop=True)

        merged["posts"] = merged["post"].apply(parse_post_list)
        merged["dates"] = merged["date"].apply(parse_timestamp_list)
        merged["subreddits"] = merged["subreddit"].apply(parse_string_list)
        merged["sim_user_id"] = merged["sim_user_id"].astype(int)

        return merged

    @cached_property
    def embeddings(self) -> np.ndarray:
        matrix = np.load(self.paths.embeddings_npy).astype(np.float32)
        if matrix.ndim != 2:
            raise ValueError(f"Expected 2D embeddings, got shape {matrix.shape}")
        if matrix.shape[0] != len(self.frame):
            raise ValueError(
                "Embedding rows do not match merged dataframe rows: "
                f"{matrix.shape[0]} != {len(self.frame)}"
            )
        return matrix

    @cached_property
    def id_to_index(self) -> dict[int, int]:
        return {user_id: index for index, user_id in enumerate(self.frame["sim_user_id"].tolist())}

    def require_user_index(self, user_id: int) -> int:
        try:
            return self.id_to_index[int(user_id)]
        except KeyError as exc:
            raise KeyError(f"Unknown sim_user_id: {user_id}") from exc

    def _read_case_state_from_disk(self) -> dict[str, Any]:
        if not self.paths.state_json.exists():
            return {}
        try:
            state = json.loads(self.paths.state_json.read_text(encoding="utf-8"))
            return self._normalize_state(state)
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _default_case_state() -> dict[str, Any]:
        return {"status": "pending", "notes": [], "history": []}

    def _normalize_entry(self, entry: dict[str, Any]) -> dict[str, Any]:
        normalized = self._default_case_state()
        normalized["status"] = str(entry.get("status", "pending"))

        notes = entry.get("notes", [])
        normalized["notes"] = [str(note) for note in notes if str(note).strip()]

        history = entry.get("history", [])
        normalized_history = []
        for item in history:
            if not isinstance(item, dict):
                continue
            normalized_history.append(
                {
                    "ts": str(item.get("ts", "")),
                    "status": str(item.get("status", normalized["status"])),
                    "note": str(item.get("note", "")),
                }
            )
        normalized["history"] = normalized_history
        return normalized

    def _normalize_state(self, state: dict[str, Any]) -> dict[str, Any]:
        normalized: dict[str, Any] = {}
        for key, value in state.items():
            if isinstance(value, dict):
                normalized[str(key)] = self._normalize_entry(value)
        return normalized

    def load_case_state(self) -> dict[str, Any]:
        with self._state_lock:
            if self._state_cache is None:
                self._state_cache = self._read_case_state_from_disk()
            return copy.deepcopy(self._state_cache)

    def save_case_state(self, state: dict[str, Any]) -> None:
        with self._state_lock:
            payload = json.dumps(state, ensure_ascii=False, indent=2)
            temp_path = self.paths.state_json.with_suffix(f"{self.paths.state_json.suffix}.tmp")
            temp_path.write_text(payload, encoding="utf-8")
            temp_path.replace(self.paths.state_json)
            self._state_cache = copy.deepcopy(state)

    def update_case_state(self, user_id: int, status: str, note: str | None = None) -> dict[str, Any]:
        with self._state_lock:
            if self._state_cache is None:
                self._state_cache = self._read_case_state_from_disk()
            entry = self._state_cache.setdefault(str(user_id), self._default_case_state())
            entry = self._normalize_entry(entry)
            self._state_cache[str(user_id)] = entry
            entry["status"] = status
            if note:
                entry["notes"].append(note)
            entry.setdefault("history", []).append(
                {
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "status": status,
                    "note": note or "",
                }
            )
            self.save_case_state(self._state_cache)
            return copy.deepcopy(entry)

    def get_case_state(self, user_id: int) -> dict[str, Any]:
        state = self.load_case_state()
        return state.get(str(user_id), self._default_case_state())

    def get_case_state_snapshot(self) -> dict[str, Any]:
        return self.load_case_state()

    def get_user_row(self, user_id: int) -> pd.Series:
        index = self.require_user_index(user_id)
        return self.frame.iloc[index]
