from __future__ import annotations

import json
from functools import cached_property
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from backend.config import BackendPaths
from backend.parsing import parse_post_list, parse_string_list, parse_timestamp_list


class MentalRepository:
    def __init__(self, paths: BackendPaths | None = None) -> None:
        self.paths = paths or BackendPaths.from_environment()
        self.paths.state_json.parent.mkdir(parents=True, exist_ok=True)

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

    def load_case_state(self) -> dict[str, Any]:
        if not self.paths.state_json.exists():
            return {}
        try:
            return json.loads(self.paths.state_json.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def save_case_state(self, state: dict[str, Any]) -> None:
        self.paths.state_json.write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def update_case_state(self, user_id: int, status: str, note: str | None = None) -> dict[str, Any]:
        state = self.load_case_state()
        entry = state.setdefault(str(user_id), {"status": "pending", "notes": []})
        entry["status"] = status
        if note:
            entry["notes"].append(note)
        self.save_case_state(state)
        return entry

    def get_case_state(self, user_id: int) -> dict[str, Any]:
        state = self.load_case_state()
        return state.get(str(user_id), {"status": "pending", "notes": []})

    def get_user_row(self, user_id: int) -> pd.Series:
        index = self.require_user_index(user_id)
        return self.frame.iloc[index]

