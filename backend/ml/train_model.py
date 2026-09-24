"""Train and evaluate the dataset-backed binary classifier reproducibly."""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "heart.csv"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
FEATURES = ["age", "sex", "cp", "trestbps", "chol", "fbs", "restecg", "thalach", "exang", "oldpeak", "slope", "ca", "thal"]
TARGET = "condition"


def train() -> dict:
    frame = pd.read_csv(DATA)
    required = FEATURES + [TARGET]
    missing = sorted(set(required) - set(frame.columns))
    if missing:
        raise ValueError(f"Dataset is missing columns: {missing}")
    frame = frame[required].dropna()
    if len(frame) < 50 or set(frame[TARGET].unique()) != {0, 1}:
        raise ValueError("Expected at least 50 complete rows and binary 0/1 targets.")
    x_train, x_test, y_train, y_test = train_test_split(
        frame[FEATURES], frame[TARGET].astype(int), test_size=0.2,
        random_state=42, stratify=frame[TARGET].astype(int),
    )
    estimator = Pipeline([
        ("scale", StandardScaler()),
        ("classifier", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)),
    ])
    estimator.fit(x_train, y_train)
    predicted = estimator.predict(x_test)
    metrics = {
        "model": "Logistic Regression with StandardScaler",
        "dataset": "Cleaned Cleveland-derived heart disease subset bundled with the linked project repository",
        "rows": int(len(frame)), "features": FEATURES, "target": TARGET,
        "holdout": {"testRows": int(len(y_test)), "trainRows": int(len(y_train)), "split": "80/20 stratified", "randomState": 42},
        "accuracy": round(float(accuracy_score(y_test, predicted)), 4),
        "precision": round(float(precision_score(y_test, predicted, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, predicted, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, predicted, zero_division=0)), 4),
        "confusionMatrix": confusion_matrix(y_test, predicted, labels=[0, 1]).tolist(),
        "note": "Single stratified holdout metrics are educational and are not evidence of clinical performance or suitability.",
    }
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump(estimator, ARTIFACTS / "heart_disease.joblib")
    (ARTIFACTS / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    return metrics


if __name__ == "__main__":
    train()
