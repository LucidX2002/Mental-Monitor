from __future__ import annotations

from collections import Counter
import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from backend.recommendations import project_embeddings, top_k_neighbors
from backend.repository import MentalRepository
from backend.text_analysis import TextPersonalityAnalyzer


DEFAULT_NEUROTICISM_THRESHOLD = 0.70
DEFAULT_EXTRAVERSION_THRESHOLD = 0.35


class MentalHealthService:
    def __init__(self, repository: MentalRepository | None = None) -> None:
        self.repository = repository or MentalRepository()
        self._recommendation_cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        self._projection_cache: np.ndarray | None = None
        self._text_analyzer: TextPersonalityAnalyzer | None = None
        self._local_text_encoder: Any | None = None
        self._emotion_reference_embedding: np.ndarray | None = None

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

    def get_dashboard(
        self,
        scatter_limit: int = 900,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> dict[str, Any]:
        frame = self._with_risk(neuro_threshold, extra_threshold)
        dominant_trait_counts = (
            frame["dominant_trait"].value_counts().sort_values(ascending=False).to_dict()
        )

        high_risk = int(frame["is_at_risk"].sum())
        medium_risk = int(
            (
                (~frame["is_at_risk"])
                & (
                    (frame["prob_Neuroticism"] >= max(0.5, neuro_threshold - 0.1))
                    | (frame["night_ratio"] >= 0.75)
                )
            ).sum()
        )
        low_risk = max(0, int(len(frame)) - high_risk - medium_risk)

        subreddit_counter: Counter[str] = Counter()
        for subreddits in frame["subreddits"]:
            subreddit_counter.update(subreddits)

        top_subreddits = [
            {"name": name, "count": count}
            for name, count in subreddit_counter.most_common(8)
        ]

        return {
            "summary": self.get_summary(neuro_threshold, extra_threshold),
            "scatter": self.get_scatter(
                limit=scatter_limit,
                neuro_threshold=neuro_threshold,
                extra_threshold=extra_threshold,
            ),
            "dominant_traits": dominant_trait_counts,
            "risk_bands": {
                "高风险": high_risk,
                "重点观察": medium_risk,
                "相对稳定": low_risk,
            },
            "top_subreddits": top_subreddits,
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
                frame["sim_user_id"].astype(str).str.contains(query_text, regex=False, na=False)
                | frame["dominant_trait"].str.lower().str.contains(query_text, regex=False, na=False)
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
        case_state_map = self.repository.get_case_state_snapshot()
        items = [self._compact_user_payload(row, case_state_map) for _, row in window.iterrows()]
        return {"total": int(total), "items": items}

    def _compact_user_payload(
        self,
        row: pd.Series,
        case_state_map: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        case_state = (case_state_map or {}).get(
            str(int(row["sim_user_id"])),
            {"status": "pending", "notes": []},
        )
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

    def _get_cached_recommendation_matrix(self, k: int) -> tuple[np.ndarray, np.ndarray]:
        effective_k = max(0, min(int(k), len(self.frame) - 1))
        if effective_k not in self._recommendation_cache:
            self._recommendation_cache[effective_k] = top_k_neighbors(self.repository.embeddings, k=effective_k)
        return self._recommendation_cache[effective_k]

    def _get_cached_projection(self) -> np.ndarray:
        if self._projection_cache is None:
            self._projection_cache = project_embeddings(self.repository.embeddings)
        return self._projection_cache

    def _get_text_analyzer(self) -> TextPersonalityAnalyzer:
        if self._text_analyzer is None:
            self._text_analyzer = TextPersonalityAnalyzer()
        return self._text_analyzer

    def _get_local_text_encoder(self) -> Any:
        if self._local_text_encoder is None:
            from sentence_transformers import SentenceTransformer
            import torch

            explicit_path = os.getenv("MENTAL_LOCAL_TEXT_ENCODER")
            candidates = [
                Path(explicit_path) if explicit_path else None,
                Path(__file__).resolve().parents[1] / "legacy" / "models" / "all-MiniLM-L6-v2",
                Path(__file__).resolve().parents[1] / "models" / "all-MiniLM-L6-v2",
            ]

            model_path = next((path for path in candidates if path and path.exists()), None)
            if model_path is None:
                raise RuntimeError("未找到本地文本编码模型 all-MiniLM-L6-v2。")

            device = "cuda" if torch.cuda.is_available() else "cpu"
            self._local_text_encoder = SentenceTransformer(str(model_path), device=device)
        return self._local_text_encoder

    def _get_emotion_reference_embedding(self) -> np.ndarray:
        if self._emotion_reference_embedding is None:
            encoder = self._get_local_text_encoder()
            ref_text = "I feel depressed, hopeless, anxious and worthless. I don't want to live anymore."
            embedding = encoder.encode([ref_text], convert_to_numpy=True, show_progress_bar=False)[0].astype(np.float32)
            self._emotion_reference_embedding = embedding / (np.linalg.norm(embedding) + 1e-8)
        return self._emotion_reference_embedding

    def _score_post_texts(self, posts: list[str]) -> list[float]:
        if not posts:
            return []

        encoder = self._get_local_text_encoder()
        vectors = encoder.encode(posts, convert_to_numpy=True, show_progress_bar=False).astype(np.float32)
        vectors = vectors / (np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-8)
        ref = self._get_emotion_reference_embedding()
        scores = (vectors @ ref).astype(np.float32)
        scores = (scores + 1.0) / 2.0
        return [float(score) for score in scores.tolist()]

    def _analyze_text_via_neighbors(self, text: str) -> dict[str, Any]:
        content = str(text).strip()
        if not content:
            raise ValueError("请输入至少一段有效文本。")

        encoder = self._get_local_text_encoder()
        query = encoder.encode([content], convert_to_numpy=True, show_progress_bar=False)[0].astype(np.float32)
        query = query / (np.linalg.norm(query) + 1e-8)

        bank = self.repository.embeddings.astype(np.float32)
        bank = bank / (np.linalg.norm(bank, axis=1, keepdims=True) + 1e-8)
        sims = bank @ query

        topk = min(20, len(sims))
        top_idx = np.argpartition(-sims, topk - 1)[:topk]
        top_idx = top_idx[np.argsort(-sims[top_idx])]
        top_scores = sims[top_idx]

        weights = np.clip(top_scores, 0.0, None)
        if float(weights.sum()) <= 1e-8:
            weights = np.ones_like(weights, dtype=np.float32)
        weights = weights / weights.sum()

        cols = [
            "prob_Agreeableness",
            "prob_Conscientiousness",
            "prob_Extraversion",
            "prob_Neuroticism",
            "prob_Openness",
        ]
        values = self.frame.iloc[top_idx][cols].to_numpy(dtype=np.float32)
        probs = (values * weights[:, None]).sum(axis=0)

        trait_names = [
            "Agreeableness",
            "Conscientiousness",
            "Extraversion",
            "Neuroticism",
            "Openness",
        ]
        dominant_index = int(np.argmax(probs))

        return {
            "traits": {trait_names[index]: float(probs[index]) for index in range(len(trait_names))},
            "dominant_trait": trait_names[dominant_index],
            "dominant_score": float(probs[dominant_index]),
            "raw_logits": [],
            "token_count_estimate": int(len(content.split())),
            "inference_mode": "nearest_neighbor_fallback",
            "neighbor_examples": [
                {
                    "sim_user_id": int(self.frame.iloc[index]["sim_user_id"]),
                    "score": float(score),
                }
                for index, score in zip(top_idx[:5].tolist(), top_scores[:5].tolist())
            ],
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

    @staticmethod
    def _preview_posts(posts: list[str], limit: int = 2, max_chars: int = 180) -> list[str]:
        previews: list[str] = []
        for post in posts[:limit]:
            text = " ".join(str(post).split())
            if len(text) > max_chars:
                text = text[: max_chars - 3] + "..."
            previews.append(text)
        return previews

    @staticmethod
    def _similarity_hint(source_row: pd.Series, neighbor_row: pd.Series) -> str:
        if (
            float(source_row["prob_Neuroticism"]) >= 0.6
            and float(neighbor_row["prob_Neuroticism"]) >= 0.6
            and float(source_row["prob_Extraversion"]) <= 0.4
            and float(neighbor_row["prob_Extraversion"]) <= 0.4
        ):
            return "两者都表现出较高神经质、较低外向性的风险倾向。"
        if source_row["dominant_trait"] == neighbor_row["dominant_trait"]:
            return f"两者都以 {neighbor_row['dominant_trait']} 作为主导人格特征。"
        return "两者在融合表示空间中距离较近，文本与行为模式更相似。"

    def get_recommendations(self, user_id: int, k: int = 5) -> list[dict[str, Any]]:
        source_index = self.repository.require_user_index(user_id)
        indices, scores = self._get_cached_recommendation_matrix(k)
        neighbor_ids = indices[source_index]
        neighbor_scores = scores[source_index]
        source_row = self.frame.iloc[source_index]

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
                    "post_preview": self._preview_posts(row["posts"]),
                    "comparison_hint": self._similarity_hint(source_row, row),
                }
            )
        return results

    def get_user_timeline(self, user_id: int) -> dict[str, Any]:
        detail = self.get_user(user_id)
        posts = [str(post).strip() for post in detail["posts"] if str(post).strip()]
        dates = detail["dates"]
        subreddits = detail["subreddits"]

        event_count = min(len(posts), len(dates))
        posts = posts[:event_count]
        dates = dates[:event_count]
        subreddits = subreddits[:event_count] if subreddits else ["unknown"] * event_count

        if event_count == 0:
            return {
                "sim_user_id": detail["sim_user_id"],
                "events": [],
                "summary": {
                    "post_count": 0,
                    "avg_emotion_score": 0.0,
                    "max_emotion_score": 0.0,
                },
            }

        emotion_scores = self._score_post_texts(posts)
        events = []
        for index in range(event_count):
            events.append(
                {
                    "date": str(dates[index])[:10],
                    "subreddit": subreddits[index] if index < len(subreddits) else "unknown",
                    "emotion_score": float(emotion_scores[index]) if index < len(emotion_scores) else 0.0,
                    "post_preview": self._preview_posts([posts[index]], limit=1, max_chars=220)[0],
                    "post_full": posts[index],
                }
            )

        events.sort(key=lambda item: item["date"])
        scores = [event["emotion_score"] for event in events]

        return {
            "sim_user_id": detail["sim_user_id"],
            "events": events,
            "summary": {
                "post_count": len(events),
                "avg_emotion_score": float(np.mean(scores)) if scores else 0.0,
                "max_emotion_score": float(np.max(scores)) if scores else 0.0,
                "latest_date": events[-1]["date"] if events else "",
            },
        }

    def get_scatter(
        self,
        limit: int = 800,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> dict[str, Any]:
        frame = self._with_risk(neuro_threshold, extra_threshold)
        projection = self._get_cached_projection()
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

    def get_trends(
        self,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> dict[str, Any]:
        frame = self._with_risk(neuro_threshold, extra_threshold)

        timeline = frame[["sim_user_id", "dates", "is_at_risk"]].explode("dates")
        timeline = timeline[timeline["dates"].notna() & (timeline["dates"] != "")]

        month_points: list[dict[str, Any]] = []
        if not timeline.empty:
            timeline = timeline.copy()
            timeline["date"] = pd.to_datetime(timeline["dates"], errors="coerce")
            timeline = timeline[timeline["date"].notna()]
            timeline["month"] = timeline["date"].dt.to_period("M").astype(str)

            if not timeline.empty:
                total_posts = timeline.groupby("month").size()
                risk_posts = timeline[timeline["is_at_risk"]].groupby("month").size()
                active_users = timeline.groupby("month")["sim_user_id"].nunique()

                for month in total_posts.index.tolist():
                    month_points.append(
                        {
                            "month": month,
                            "post_count": int(total_posts.loc[month]),
                            "risk_post_count": int(risk_posts.get(month, 0)),
                            "active_user_count": int(active_users.get(month, 0)),
                        }
                    )

        risk_frame = frame[frame["is_at_risk"]]
        stable_frame = frame[~frame["is_at_risk"]]

        def behavior_block(block: pd.DataFrame) -> dict[str, Any]:
            if block.empty:
                return {
                    "user_count": 0,
                    "avg_posts_per_day": 0.0,
                    "avg_night_ratio": 0.0,
                    "avg_post_count": 0.0,
                }
            return {
                "user_count": int(len(block)),
                "avg_posts_per_day": float(block["posts_per_day"].mean()),
                "avg_night_ratio": float(block["night_ratio"].mean()),
                "avg_post_count": float(block["post_count"].mean()),
            }

        return {
            "monthly_activity": month_points,
            "group_comparison": {
                "high_risk": behavior_block(risk_frame),
                "stable": behavior_block(stable_frame),
                "overall": behavior_block(frame),
            },
        }

    def analyze_text(
        self,
        text: str,
        neuro_threshold: float = DEFAULT_NEUROTICISM_THRESHOLD,
        extra_threshold: float = DEFAULT_EXTRAVERSION_THRESHOLD,
    ) -> dict[str, Any]:
        content = str(text).strip()
        if not content:
            raise ValueError("请输入至少一段有效文本。")

        try:
            result = self._get_text_analyzer().analyze(content)
        except FileNotFoundError:
            result = self._analyze_text_via_neighbors(content)
        except ImportError as exc:
            raise RuntimeError("文本研判依赖未安装，请补充 torch、transformers 或 sentence-transformers。") from exc
        except Exception as exc:
            classifier_error = str(exc)
            try:
                result = self._analyze_text_via_neighbors(content)
            except Exception as fallback_exc:
                raise RuntimeError(
                    f"文本研判模型加载或推理失败：{classifier_error}；离线近邻推断也失败：{fallback_exc}"
                ) from fallback_exc
        traits = result["traits"]

        reasons: list[str] = []
        if traits["Neuroticism"] >= neuro_threshold:
            reasons.append("神经质得分高于当前风险阈值")
        if traits["Extraversion"] <= extra_threshold:
            reasons.append("外向性低于当前风险上限")
        if traits["Openness"] >= 0.6:
            reasons.append("开放性较高，文本表达更丰富")

        is_flagged = (
            traits["Neuroticism"] >= neuro_threshold
            and traits["Extraversion"] <= extra_threshold
        )

        result.update(
            {
                "is_flagged": bool(is_flagged),
                "risk_label": "需要重点关注" if is_flagged else "暂未触发高风险规则",
                "reasons": reasons,
                "thresholds": {
                    "neuroticism_min": float(neuro_threshold),
                    "extraversion_max": float(extra_threshold),
                },
            }
        )
        if result.get("inference_mode") == "nearest_neighbor_fallback":
            result["reasons"].append("当前结果来自本地文本编码器与相似用户近邻协同推断")
        return result

    def update_case_state(self, user_id: int, status: str, note: str = "") -> dict[str, Any]:
        self.repository.require_user_index(user_id)
        return self.repository.update_case_state(user_id, status=status, note=note or None)
