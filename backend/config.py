from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _first_existing_path(candidates: list[Path]) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


@dataclass(frozen=True)
class BackendPaths:
    personality_csv: Path
    behavior_csv: Path
    posts_csv: Path
    embeddings_npy: Path
    state_json: Path

    @classmethod
    def from_environment(cls, root_dir: Path | None = None) -> "BackendPaths":
        root = (root_dir or Path(__file__).resolve().parents[1]).resolve()

        data_root = Path(os.getenv("MENTAL_DATA_ROOT", root / "data"))
        state_json = Path(
            os.getenv("MENTAL_STATE_JSON", root / "backend" / "state" / "intervention_state.json")
        )

        personality_csv = Path(
            os.getenv(
                "MENTAL_PERSONALITY_CSV",
                _first_existing_path(
                    [
                        data_root / "personality.csv",
                        root / "legacy" / "datasets" / "0_dataset" / "reddit_simulated_user_personality.csv",
                    ]
                ),
            )
        )
        behavior_csv = Path(
            os.getenv(
                "MENTAL_BEHAVIOR_CSV",
                _first_existing_path(
                    [
                        data_root / "behavior.csv",
                        root / "legacy" / "datasets" / "0_dataset" / "reddit_simulated_user_behavior.csv",
                    ]
                ),
            )
        )
        posts_csv = Path(
            os.getenv(
                "MENTAL_POSTS_CSV",
                _first_existing_path(
                    [
                        data_root / "posts.csv",
                        root / "legacy" / "datasets" / "0_dataset" / "reddit_simulated_user_post.csv",
                    ]
                ),
            )
        )
        embeddings_npy = Path(
            os.getenv(
                "MENTAL_EMBEDDINGS_NPY",
                _first_existing_path(
                    [
                        data_root / "embeddings" / "fused_embeddings.npy",
                        root / "legacy" / "experiments" / "2_code" / "fused_embeddings.npy",
                        root / "legacy" / "experiments" / "2_code" / "embeddings" / "fused_embeddings.npy",
                        root / "legacy" / "artifacts" / "fused_embeddings.npy",
                    ]
                ),
            )
        )

        return cls(
            personality_csv=personality_csv,
            behavior_csv=behavior_csv,
            posts_csv=posts_csv,
            embeddings_npy=embeddings_npy,
            state_json=state_json,
        )
