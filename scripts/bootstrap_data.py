from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def ensure_link(target: Path, source: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() or target.is_symlink():
        return
    target.symlink_to(source.resolve())


def main() -> None:
    mappings = {
        ROOT / "data" / "personality.csv": ROOT
        / "legacy"
        / "datasets"
        / "0_dataset"
        / "reddit_simulated_user_personality.csv",
        ROOT / "data" / "behavior.csv": ROOT
        / "legacy"
        / "datasets"
        / "0_dataset"
        / "reddit_simulated_user_behavior.csv",
        ROOT / "data" / "posts.csv": ROOT
        / "legacy"
        / "datasets"
        / "0_dataset"
        / "reddit_simulated_user_post.csv",
        ROOT / "data" / "embeddings" / "fused_embeddings.npy": ROOT
        / "legacy"
        / "experiments"
        / "2_code"
        / "fused_embeddings.npy",
    }

    created = 0
    for target, source in mappings.items():
        if not source.exists():
            print(f"skip: missing source {source}")
            continue
        ensure_link(target, source)
        print(f"linked: {target} -> {source}")
        created += 1

    print(f"done: prepared {created} data links")


if __name__ == "__main__":
    main()
