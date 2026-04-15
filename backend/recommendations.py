from __future__ import annotations

import numpy as np


def l2_normalize(embeddings: np.ndarray, eps: float = 1e-8) -> np.ndarray:
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    return embeddings / (norms + eps)


def top_k_neighbors(embeddings: np.ndarray, k: int = 5) -> tuple[np.ndarray, np.ndarray]:
    matrix = np.asarray(embeddings, dtype=np.float32)
    if matrix.ndim != 2:
        raise ValueError(f"Expected a 2D embedding matrix, got shape {matrix.shape}")

    num_rows = matrix.shape[0]
    if num_rows == 0:
        return np.empty((0, 0), dtype=np.int64), np.empty((0, 0), dtype=np.float32)

    effective_k = max(0, min(int(k), num_rows - 1))
    if effective_k == 0:
        return (
            np.empty((num_rows, 0), dtype=np.int64),
            np.empty((num_rows, 0), dtype=np.float32),
        )

    normalized = l2_normalize(matrix)
    sims = normalized @ normalized.T
    np.fill_diagonal(sims, -np.inf)

    partial = np.argpartition(-sims, kth=effective_k - 1, axis=1)[:, :effective_k]
    partial_scores = np.take_along_axis(sims, partial, axis=1)
    order = np.argsort(-partial_scores, axis=1)

    indices = np.take_along_axis(partial, order, axis=1).astype(np.int64)
    scores = np.take_along_axis(partial_scores, order, axis=1).astype(np.float32)
    return indices, scores


def project_embeddings(embeddings: np.ndarray) -> np.ndarray:
    matrix = np.asarray(embeddings, dtype=np.float32)
    if matrix.size == 0:
        return np.zeros((0, 2), dtype=np.float32)

    if matrix.shape[1] >= 2:
        try:
            from sklearn.decomposition import PCA

            return PCA(n_components=2, random_state=42).fit_transform(matrix).astype(np.float32)
        except Exception:
            return matrix[:, :2].astype(np.float32)

    zeros = np.zeros((matrix.shape[0], 2), dtype=np.float32)
    zeros[:, 0] = matrix[:, 0]
    return zeros

