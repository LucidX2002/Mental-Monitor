from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from backend.recommendations import project_embeddings, top_k_neighbors
from backend.repository import MentalRepository


DEFAULT_NEUROTICISM_THRESHOLD = 0.70
DEFAULT_EXTRAVERSION_THRESHOLD = 0.35


class MentalHealthService:
    def __init__(self, repository: MentalRepository | None = None) -> None:
        self.repository = repository or MentalRepository()

    @property
    def frame(self) -> pd.DataFrame:
        return self.repository.frame

    def _with_risk(
        self,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> pd.DataFrame:
        frame = self.frame.copy()
        frame["is_at_risk"] = (
            (frame["prob_Neuroticism"] >= neuro_threshold)
            & (frame["prob_Extraversion"] <= extra_threshold)
        )
        return frame

    def get_summary(
        self,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> dict[str, Any]:
        frame = self._with_risk(neuro_threshold, extra_threshold)
        return {
            "total_users": int(len(frame)),
            "at_risk_users": int(frame["is_at_risk"].sum()),
            "avg_neuroticism": float(frame["prob_Neuroticism"].mean()),
            "avg_extraversion": float(frame["prob_Extraversion"].mean()),
            "avg_posts_per_day": float(frame["posts_per_day"].mean()),
            "thresholds": {
                "neuroticism_min": float(neuro_threshold),
                "extraversion_max": float(extra_threshold),
            },
        }

    def list_users(
        self,
        limit: int = 100,
        offset: int = 0,
        query: str = "",
        risk_only: bool = False,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> dict[str, Any]:
        frame = self._with_risk(neuro_threshold, extra_threshold)
        query_text = query.strip().lower()

        if risk_only:
            frame = frame[frame["is_at_risk"]]

        if query_text:
            frame = frame[
                frame["sim_user_id"].astype(str).str.contains(query_text)
                | frame["dominant_trait"].str.lower().str.contains(query_text)
                | frame["subreddits"].apply(
                    lambda values: any(query_text in item.lower() for item in values)
                )
            ]

        frame = frame.sort_values(
            by=["is_at_risk", "prob_Neuroticism", "post_count"],
            ascending=[False, False, False],
        )

        total = len(frame)
        window = frame.iloc[offset : offset + max(1, min(limit, 500))]
        items = [self._compact_user_payload(row) for _, row in window.iterrows()]
        return {"total": int(total), "items": items}

    def _compact_user_payload(self, row: pd.Series) -> dict[str, Any]:
        case_state = self.repository.get_case_state(int(row["sim_user_id"]))
        return {
            "sim_user_id": int(row["sim_user_id"]),
            "dominant_trait": row["dominant_trait"],
            "dominant_score": float(row["dominant_score"]),
            "prob_neuroticism": float(row["prob_Neuroticism"]),
            "prob_extraversion": float(row["prob_Extraversion"]),
            "post_count": int(row["post_count"]),
            "posts_per_day": float(row["posts_per_day"]),
            "night_ratio": float(row["night_ratio"]),
            "subreddits": row["subreddits"][:3],
            "is_at_risk": bool(row["is_at_risk"]),
            "case_state": case_state,
        }

    def get_user(
        self,
        user_id: int,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> dict[str, Any]:
        frame = self._with_risk(neuro_threshold, extra_threshold)
        index = self.repository.require_user_index(user_id)
        row = frame.iloc[index]

        return {
            "sim_user_id": int(row["sim_user_id"]),
            "is_at_risk": bool(row["is_at_risk"]),
            "dominant_trait": row["dominant_trait"],
            "dominant_score": float(row["dominant_score"]),
            "traits": {
                "Agreeableness": float(row["prob_Agreeableness"]),
                "Conscientiousness": float(row["prob_Conscientiousness"]),
                "Extraversion": float(row["prob_Extraversion"]),
                "Neuroticism": float(row["prob_Neuroticism"]),
                "Openness": float(row["prob_Openness"]),
            },
            "behavior": {
                "post_count": int(row["post_count"]),
                "avg_words": float(row["avg_words"]),
                "avg_chars": float(row["avg_chars"]),
                "posts_per_day": float(row["posts_per_day"]),
                "night_ratio": float(row["night_ratio"]),
                "weekday_ratio": float(row["weekday_ratio"]),
            },
            "posts": row["posts"],
            "dates": row["dates"],
            "subreddits": row["subreddits"],
            "case_state": self.repository.get_case_state(user_id),
        }

    def get_recommendations(self, user_id: int, k: int = 5) -> list[dict[str, Any]]:
        source_index = self.repository.require_user_index(user_id)
        indices, scores = top_k_neighbors(self.repository.embeddings, k=k)
        neighbor_ids = indices[source_index]
        neighbor_scores = scores[source_index]

        results: list[dict[str, Any]] = []
        for neighbor_index, score in zip(neighbor_ids.tolist(), neighbor_scores.tolist()):
            row = self.frame.iloc[neighbor_index]
            results.append(
                {
                    "sim_user_id": int(row["sim_user_id"]),
                    "score": float(score),
                    "dominant_trait": row["dominant_trait"],
                    "prob_neuroticism": float(row["prob_Neuroticism"]),
                    "prob_extraversion": float(row["prob_Extraversion"]),
                    "subreddits": row["subreddits"][:3],
                }
            )
        return results

    def get_scatter(
        self,
        limit: int = 800,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> dict[str, Any]:
        frame = self._with_risk(neuro_threshold, extra_threshold)
        projection = project_embeddings(self.repository.embeddings)
        if len(projection) != len(frame):
            raise ValueError("Projection row count does not match dataframe row count.")

        sample_count = min(max(1, int(limit)), len(frame))
        sample_indices = np.linspace(0, len(frame) - 1, num=sample_count, dtype=int)

        points = []
        for index in sample_indices.tolist():
            row = frame.iloc[index]
            points.append(
                {
                    "sim_user_id": int(row["sim_user_id"]),
                    "x": float(projection[index, 0]),
                    "y": float(projection[index, 1]),
                    "is_at_risk": bool(row["is_at_risk"]),
                }
            )

        return {"points": points, "count": len(points)}

    def update_case_state(self, user_id: int, status: str, note: str = "") -> dict[str, Any]:
        self.repository.require_user_index(user_id)
        return self.repository.update_case_state(user_id, status=status, note=note or None)

