import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

from backend.config import BackendPaths
from backend.repository import MentalRepository
from backend.service import MentalHealthService


class StubTextAnalyzer:
    def analyze(self, text: str) -> dict:
        return {
            "traits": {
                "Agreeableness": 0.2,
                "Conscientiousness": 0.3,
                "Extraversion": 0.2,
                "Neuroticism": 0.9,
                "Openness": 0.4,
            },
            "dominant_trait": "Neuroticism",
            "dominant_score": 0.9,
            "raw_logits": [0.0] * 5,
            "token_count_estimate": len(text.split()),
        }


class MissingTextAnalyzer:
    def analyze(self, text: str) -> dict:
        raise FileNotFoundError("missing local classifier")


class StubNeighborEncoder:
    def encode(self, texts, convert_to_numpy=True, show_progress_bar=False):
        import numpy as np

        return np.array([[1.0, 0.0]], dtype=np.float32)


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
        self.assertTrue(len(recs[0]["post_preview"]) >= 1)
        self.assertIn("comparison_hint", recs[0])

    def test_search_treats_user_input_as_literal_text(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        self.assertEqual(service.list_users(limit=5, query="[")["total"], 0)
        self.assertEqual(service.list_users(limit=5, query="(")["total"], 0)
        self.assertEqual(service.list_users(limit=5, query="adhd")["items"][0]["sim_user_id"], 11)

    def test_case_state_updates_persist_and_are_reflected_in_list_payloads(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        service.update_case_state(10, status="observing", note="needs follow-up")
        users = service.list_users(limit=10)

        self.assertEqual(users["items"][0]["case_state"]["status"], "observing")
        self.assertEqual(users["items"][0]["case_state"]["notes"], ["needs follow-up"])
        self.assertEqual(len(users["items"][0]["case_state"]["history"]), 1)
        self.assertEqual(users["items"][0]["case_state"]["history"][0]["status"], "observing")

    def test_service_caches_recommendation_results_by_k(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        fake_indices = np.array([[1], [0]], dtype=np.int64)
        fake_scores = np.array([[0.9], [0.9]], dtype=np.float32)

        with patch("backend.service.top_k_neighbors", return_value=(fake_indices, fake_scores)) as mock_topk:
            service.get_recommendations(10, k=1)
            service.get_recommendations(10, k=1)
            self.assertEqual(mock_topk.call_count, 1)

    def test_service_caches_projection_for_scatter_requests(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        fake_projection = np.array([[0.0, 0.0], [1.0, 1.0]], dtype=np.float32)

        with patch("backend.service.project_embeddings", return_value=fake_projection) as mock_projection:
            service.get_scatter(limit=2)
            service.get_scatter(limit=1)
            self.assertEqual(mock_projection.call_count, 1)

    def test_dashboard_payload_contains_distributions_and_scatter(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        dashboard = service.get_dashboard(scatter_limit=2)

        self.assertEqual(dashboard["summary"]["total_users"], 2)
        self.assertIn("Neuroticism", dashboard["dominant_traits"])
        self.assertEqual(dashboard["scatter"]["count"], 2)
        self.assertIn("高风险", dashboard["risk_bands"])

    def test_trends_payload_contains_monthly_activity_and_group_comparison(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        trends = service.get_trends()

        self.assertTrue(len(trends["monthly_activity"]) >= 1)
        self.assertEqual(trends["group_comparison"]["high_risk"]["user_count"], 1)
        self.assertEqual(trends["group_comparison"]["stable"]["user_count"], 1)

    def test_user_timeline_contains_sorted_posts_and_scores(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        with patch.object(service, "_score_post_texts", return_value=[0.9, 0.2]):
            timeline = service.get_user_timeline(10)

        self.assertEqual(timeline["sim_user_id"], 10)
        self.assertEqual(len(timeline["events"]), 2)
        self.assertEqual(timeline["events"][0]["date"], "2018-03-28")
        self.assertEqual(timeline["events"][0]["emotion_score"], 0.9)
        self.assertEqual(timeline["events"][1]["emotion_score"], 0.2)
        self.assertIn("avg_emotion_score", timeline["summary"])

    def test_analyze_text_returns_flagged_result_from_model_output(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        with patch.object(service, "_get_text_analyzer", return_value=StubTextAnalyzer()):
            result = service.analyze_text("I feel bad and isolated lately.")

        self.assertTrue(result["is_flagged"])
        self.assertEqual(result["risk_label"], "需要重点关注")
        self.assertIn("神经质得分高于当前风险阈值", result["reasons"])

    def test_analyze_text_falls_back_to_local_neighbor_inference(self) -> None:
        paths = BackendPaths(
            personality_csv=self.root / "personality.csv",
            behavior_csv=self.root / "behavior.csv",
            posts_csv=self.root / "posts.csv",
            embeddings_npy=self.root / "embeddings.npy",
            state_json=self.root / "state.json",
        )
        service = MentalHealthService(MentalRepository(paths))

        with patch.object(service, "_get_text_analyzer", return_value=MissingTextAnalyzer()):
            with patch.object(service, "_get_local_text_encoder", return_value=StubNeighborEncoder()):
                result = service.analyze_text("offline fallback text")

        self.assertEqual(result["inference_mode"], "nearest_neighbor_fallback")
        self.assertTrue(len(result["neighbor_examples"]) >= 1)
        self.assertIn("当前结果来自本地文本编码器与相似用户近邻协同推断", result["reasons"])


if __name__ == "__main__":
    unittest.main()
