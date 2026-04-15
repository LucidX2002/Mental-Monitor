import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from backend.config import BackendPaths
from backend.repository import MentalRepository
from backend.service import MentalHealthService


class ServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        pd.DataFrame(
            [
                {
                    "sim_user_id": 10,
                    "n_post_used": 2,
                    "prob_Agreeableness": 0.2,
                    "prob_Conscientiousness": 0.3,
                    "prob_Extraversion": 0.2,
                    "prob_Neuroticism": 0.9,
                    "prob_Openness": 0.4,
                    "dominant_trait": "Neuroticism",
                    "dominant_score": 0.9,
                },
                {
                    "sim_user_id": 11,
                    "n_post_used": 2,
                    "prob_Agreeableness": 0.6,
                    "prob_Conscientiousness": 0.7,
                    "prob_Extraversion": 0.8,
                    "prob_Neuroticism": 0.1,
                    "prob_Openness": 0.3,
                    "dominant_trait": "Extraversion",
                    "dominant_score": 0.8,
                },
            ]
        ).to_csv(self.root / "personality.csv", index=False)

        pd.DataFrame(
            [
                {
                    "sim_user_id": 10,
                    "post_count": 2,
                    "avg_words": 10.0,
                    "std_words": 1.0,
                    "avg_chars": 50.0,
                    "std_chars": 10.0,
                    "active_span_days": 5,
                    "posts_per_day": 0.4,
                    "chars_per_word": 5.0,
                    "night_ratio": 0.8,
                    "weekday_ratio": 0.4,
                },
                {
                    "sim_user_id": 11,
                    "post_count": 2,
                    "avg_words": 15.0,
                    "std_words": 2.0,
                    "avg_chars": 75.0,
                    "std_chars": 15.0,
                    "active_span_days": 4,
                    "posts_per_day": 0.5,
                    "chars_per_word": 5.0,
                    "night_ratio": 0.1,
                    "weekday_ratio": 0.6,
                },
            ]
        ).to_csv(self.root / "behavior.csv", index=False)

        pd.DataFrame(
            [
                {
                    "sim_user_id": 10,
                    "post": "['need help', 'feeling low']",
                    "date": "[Timestamp('2018-03-28 00:00:00'), Timestamp('2018-03-29 00:00:00')]",
                    "subreddit": "['mentalhealth', 'depression']",
                },
                {
                    "sim_user_id": 11,
                    "post": "['good day', 'making progress']",
                    "date": "[Timestamp('2018-03-28 00:00:00'), Timestamp('2018-03-30 00:00:00')]",
                    "subreddit": "['adhd', 'adhd']",
                },
            ]
        ).to_csv(self.root / "posts.csv", index=False)

        np.save(
            self.root / "embeddings.npy",
            np.array([[1.0, 0.0], [0.8, 0.2]], dtype=np.float32),
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_service_merges_data_and_computes_summary(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        summary = service.get_summary()
        self.assertEqual(summary["total_users"], 2)
        self.assertEqual(summary["at_risk_users"], 1)

        users = service.list_users(limit=10)
        self.assertEqual(users["total"], 2)
        self.assertTrue(users["items"][0]["is_at_risk"])

        detail = service.get_user(10)
        self.assertEqual(detail["posts"][0], "need help")
        self.assertEqual(detail["subreddits"], ["mentalhealth", "depression"])

        recs = service.get_recommendations(10, k=1)
        self.assertEqual(recs[0]["sim_user_id"], 11)


if __name__ == "__main__":
    unittest.main()
