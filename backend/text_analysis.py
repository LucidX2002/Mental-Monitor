from __future__ import annotations

import os
from functools import cached_property
from pathlib import Path
from typing import Any

import numpy as np


TRAIT_NAMES = [
    "Agreeableness",
    "Conscientiousness",
    "Extraversion",
    "Neuroticism",
    "Openness",
]

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_ID = os.getenv("MENTAL_TEXT_MODEL_ID")
DEFAULT_MAX_LENGTH = 275


def discover_local_classifier_model() -> str | None:
    explicit_dir = os.getenv("MENTAL_TEXT_MODEL_DIR")
    if explicit_dir:
        return explicit_dir

    candidates = [
        REPO_ROOT / "models" / "microsoft-finetuned-personality",
        REPO_ROOT / "legacy" / "models" / "microsoft-finetuned-personality",
        REPO_ROOT / "legacy" / "models" / "Nasserelsaman" / "microsoft-finetuned-personality",
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return DEFAULT_MODEL_ID


def sigmoid_np(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(values, -50.0, 50.0)
    return 1.0 / (1.0 + np.exp(-clipped))


class TextPersonalityAnalyzer:
    def __init__(self, model_id: str | None = None, max_length: int = DEFAULT_MAX_LENGTH) -> None:
        self.model_id = model_id or discover_local_classifier_model()
        self.max_length = max_length

    @cached_property
    def device(self) -> str:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"

    @cached_property
    def tokenizer(self) -> Any:
        from transformers import AutoTokenizer

        if not self.model_id:
            raise FileNotFoundError("未找到本地人格分类模型。")
        return AutoTokenizer.from_pretrained(self.model_id)

    @cached_property
    def model(self) -> Any:
        from transformers import AutoModelForSequenceClassification

        if not self.model_id:
            raise FileNotFoundError("未找到本地人格分类模型。")
        model = AutoModelForSequenceClassification.from_pretrained(self.model_id).to(self.device)
        model.eval()
        return model

    def analyze(self, text: str) -> dict[str, Any]:
        import torch

        content = str(text).strip()
        if not content:
            raise ValueError("请输入至少一段有效文本。")

        with torch.no_grad():
            inputs = self.tokenizer(
                [content],
                truncation=True,
                padding=True,
                max_length=self.max_length,
                return_tensors="pt",
            )
            inputs = {key: value.to(self.device) for key, value in inputs.items()}
            logits = self.model(**inputs).logits[0].detach().cpu().numpy().astype(np.float32)
        probs = sigmoid_np(logits)

        traits = {TRAIT_NAMES[index]: float(probs[index]) for index in range(len(TRAIT_NAMES))}
        dominant_index = int(np.argmax(probs))

        return {
            "traits": traits,
            "dominant_trait": TRAIT_NAMES[dominant_index],
            "dominant_score": float(probs[dominant_index]),
            "raw_logits": [float(value) for value in logits.tolist()],
            "token_count_estimate": int(min(len(content.split()), self.max_length)),
        }
