from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

RUNTIME_SOURCES = {
    ROOT / "legacy" / "models" / "all-MiniLM-L6-v2": Path("models/all-MiniLM-L6-v2"),
    ROOT / "legacy" / "datasets" / "0_dataset" / "reddit_simulated_user_personality.csv": Path("data/personality.csv"),
    ROOT / "legacy" / "datasets" / "0_dataset" / "reddit_simulated_user_behavior.csv": Path("data/behavior.csv"),
    ROOT / "legacy" / "datasets" / "0_dataset" / "reddit_simulated_user_post.csv": Path("data/posts.csv"),
    ROOT / "legacy" / "experiments" / "2_code" / "fused_embeddings.npy": Path("data/embeddings/fused_embeddings.npy"),
}


def iter_files(path: Path):
    if path.is_file():
        yield path
        return
    for child in sorted(path.rglob("*")):
        if child.is_file():
            yield child


def compression_for(path: Path) -> int:
    if path.suffix.lower() in {".txt", ".md", ".json", ".csv", ".py", ".yaml", ".yml"}:
        return ZIP_DEFLATED
    return ZIP_STORED


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_sources() -> None:
    missing = [str(path) for path in RUNTIME_SOURCES if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing runtime bundle sources:\n" + "\n".join(missing))


def build_manifest() -> dict:
    entries = []
    for source, target in RUNTIME_SOURCES.items():
        if source.is_file():
            entries.append(
                {
                    "source": str(source.relative_to(ROOT)),
                    "target": str(target),
                    "size_bytes": source.stat().st_size,
                }
            )
            continue

        for file_path in iter_files(source):
            entries.append(
                {
                    "source": str(file_path.relative_to(ROOT)),
                    "target": str((target / file_path.relative_to(source)).as_posix()),
                    "size_bytes": file_path.stat().st_size,
                }
            )

    return {
        "bundle_name_prefix": "mental-monitor-runtime",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "file_count": len(entries),
        "total_size_bytes": sum(entry["size_bytes"] for entry in entries),
        "entries": entries,
    }


def write_bundle(bundle_path: Path, manifest: dict) -> None:
    with ZipFile(bundle_path, "w") as archive:
        for source, target in RUNTIME_SOURCES.items():
            if source.is_file():
                archive.write(source, arcname=str(target), compress_type=compression_for(source))
                continue

            for file_path in iter_files(source):
                arcname = target / file_path.relative_to(source)
                archive.write(file_path, arcname=str(arcname), compress_type=compression_for(file_path))

        archive.writestr(
            "runtime_bundle_manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2),
            compress_type=ZIP_DEFLATED,
        )


def main() -> None:
    ensure_sources()
    DIST.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    bundle_path = DIST / f"mental-monitor-runtime-{stamp}.zip"
    manifest_path = DIST / f"mental-monitor-runtime-{stamp}.manifest.json"
    checksum_path = DIST / f"mental-monitor-runtime-{stamp}.sha256"

    manifest = build_manifest()
    write_bundle(bundle_path, manifest)

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    checksum_path.write_text(f"{sha256_file(bundle_path)}  {bundle_path.name}\n", encoding="utf-8")

    print(f"bundle: {bundle_path}")
    print(f"manifest: {manifest_path}")
    print(f"sha256: {checksum_path}")
    print(f"file_count: {manifest['file_count']}")
    print(f"total_size_bytes: {manifest['total_size_bytes']}")


if __name__ == "__main__":
    main()
