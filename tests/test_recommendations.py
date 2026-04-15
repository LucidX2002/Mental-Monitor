import unittest

import numpy as np

from backend.recommendations import top_k_neighbors


class RecommendationTests(unittest.TestCase):
    def test_top_k_neighbors_excludes_self_and_orders_by_similarity(self) -> None:
        embeddings = np.array(
            [
                [1.0, 0.0],
                [0.9, 0.1],
                [0.0, 1.0],
            ],
            dtype=np.float32,
        )

        indices, scores = top_k_neighbors(embeddings, k=2)

        self.assertEqual(indices.shape, (3, 2))
        self.assertEqual(indices[0].tolist(), [1, 2])
        self.assertGreater(scores[0, 0], scores[0, 1])
        self.assertNotIn(0, indices[0].tolist())

    def test_top_k_neighbors_caps_k_to_available_neighbors(self) -> None:
        embeddings = np.eye(2, dtype=np.float32)
        indices, scores = top_k_neighbors(embeddings, k=5)
        self.assertEqual(indices.shape, (2, 1))
        self.assertEqual(scores.shape, (2, 1))


if __name__ == "__main__":
    unittest.main()
