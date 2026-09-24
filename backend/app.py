"""Authenticated Flask API for the healthcare decision-support application."""
from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_file
from io import BytesIO

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth, credentials, firestore, storage as firebase_storage
except ImportError:  # Keep model training and local validation available before cloud setup.
    firebase_admin = firebase_auth = credentials = firestore = firebase_storage = None

BASE_DIR = Path(__file__).resolve().parent
FEATURE_ORDER = [
    "age", "sex", "cp", "trestbps", "chol", "fbs", "restecg",
    "thalach", "exang", "oldpeak", "slope", "ca", "thal",
]
ENUMS = {
    "sex": {0, 1}, "cp": {0, 1, 2, 3}, "fbs": {0, 1},
    "restecg": {0, 1, 2}, "exang": {0, 1}, "slope": {0, 1, 2},
    "ca": {0, 1, 2, 3}, "thal": {0, 1, 2, 3},
}
RANGES = {
    "age": (18, 120), "trestbps": (60, 280), "chol": (80, 800),
    "thalach": (40, 260), "oldpeak": (0, 15),
}
MODEL_PATH = Path(os.getenv("MODEL_PATH", str(BASE_DIR / "ml/artifacts/heart_disease.joblib")))
METRICS_PATH = Path(os.getenv("METRICS_PATH", str(BASE_DIR / "ml/artifacts/metrics.json")))

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("healthcare-api")
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
origins = [item.strip() for item in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",") if item.strip()]
@app.after_request
def cors_headers(response):
    origin = request.headers.get("Origin")
    if origin in origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

model = None
db = None
auth_ready = False


def initialize_firebase() -> None:
    global db, auth_ready
    if firebase_admin is None:
        logger.warning("Firebase Admin SDK is not installed; authenticated cloud endpoints will return 503.")
        return
    if firebase_admin._apps:
        app_ref = firebase_admin.get_app()
    else:
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
        private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
        if project_id and client_email and private_key:
            credential = credentials.Certificate({
                "type": "service_account", "project_id": project_id,
                "private_key": private_key, "client_email": client_email,
                "token_uri": "https://oauth2.googleapis.com/token",
            })
            app_ref = firebase_admin.initialize_app(credential, {
                "projectId": project_id,
                **({"storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET")} if os.getenv("FIREBASE_STORAGE_BUCKET") else {}),
            })
        elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            app_ref = firebase_admin.initialize_app(options={"projectId": project_id} if project_id else None)
        else:
            logger.warning("Firebase Admin is not configured; authenticated cloud endpoints will return 503.")
            return
    db = firestore.client(app_ref)
    auth_ready = True


def load_model() -> None:
    global model
    if MODEL_PATH.exists():
        model = joblib.load(MODEL_PATH)
        logger.info("Loaded model artifact from %s", MODEL_PATH)
    else:
        logger.error("Model artifact is missing. Run: python -m ml.train_model")


def error(message: str, status: int):
    return jsonify({"error": message}), status


def require_firebase_user(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        if not auth_ready or db is None:
            return error("Firebase backend is not configured. Follow the setup instructions in README.md.", 503)
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return error("Sign in is required.", 401)
        try:
            identity = firebase_auth.verify_id_token(header[7:].strip(), check_revoked=True)
            profile = db.collection("users").document(identity["uid"]).get()
            if not profile.exists:
                return error("Account profile is missing. Sign out and sign in again.", 403)
            request.identity = identity
            request.profile = profile.to_dict() or {}
        except Exception:
            logger.info("Rejected invalid or expired Firebase ID token")
            return error("Your session expired. Sign in again.", 401)
        return handler(*args, **kwargs)
    return wrapped


def validate_features(payload):
    if not isinstance(payload, dict):
        return None, "A JSON object is required."
    missing = [key for key in FEATURE_ORDER if key not in payload]
    if missing:
        return None, "Missing model inputs: " + ", ".join(missing)
    values = {}
    for key in FEATURE_ORDER:
        value = payload[key]
        if isinstance(value, bool):
            return None, f"{key} must be numeric."
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None, f"{key} must be numeric."
        if not math.isfinite(numeric):
            return None, f"{key} must be a finite number."
        if key in RANGES and not RANGES[key][0] <= numeric <= RANGES[key][1]:
            low, high = RANGES[key]
            return None, f"{key} must be between {low} and {high}."
        if key in ENUMS and (numeric not in ENUMS[key] or not numeric.is_integer()):
            return None, f"{key} must be one of {sorted(ENUMS[key])}."
        values[key] = numeric
    return values, None


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "modelReady": model is not None, "firebaseReady": auth_ready})


@app.get("/api/model/metrics")
def metrics():
    if not METRICS_PATH.exists():
        return error("Model evaluation is not available. Train the model first.", 503)
    import json
    return jsonify(json.loads(METRICS_PATH.read_text(encoding="utf-8")))


@app.get("/api/reports/<report_id>/download")
@require_firebase_user
def download_report(report_id):
    """Proxy a report only after checking the current sharing grant."""
    try:
        snapshot = db.collection("lab_reports").document(report_id).get()
        if not snapshot.exists:
            return error("Report not found.", 404)
        report = snapshot.to_dict() or {}
        patient_id = report.get("patientId", "")
        uid = request.identity["uid"]
        role = request.profile.get("role")
        allowed = role == "admin" or (role == "patient" and uid == patient_id)
        if role == "doctor":
            share = db.collection("doctor_access").document(f"{patient_id}_{uid}").get()
            allowed = share.exists and (share.to_dict() or {}).get("status") == "active"
        if not allowed:
            return error("This report is not shared with your account.", 403)
        storage_path = report.get("storagePath", "")
        if not storage_path.startswith(f"patients/{patient_id}/"):
            return error("Report storage metadata is invalid.", 409)
        content = firebase_storage.bucket().blob(storage_path).download_as_bytes()
        return send_file(
            BytesIO(content), mimetype=report.get("fileType", "application/octet-stream"),
            as_attachment=request.args.get("disposition") != "inline",
            download_name=Path(report.get("fileName", "medical-report")).name,
            max_age=0,
        )
    except Exception:
        logger.exception("Authorized report download failed")
        return error("The report could not be downloaded right now.", 502)


@app.post("/api/predict")
@require_firebase_user
def predict():
    if model is None:
        return error("The trained model is unavailable. Contact the administrator.", 503)
    if request.profile.get("role") != "patient":
        return error("Only patient accounts may request a prediction.", 403)
    payload = request.get_json(silent=True)
    features, validation_error = validate_features(payload)
    if validation_error:
        return error(validation_error, 400)
    uid = request.identity["uid"]
    supplied_patient_id = payload.get("patientId", uid)
    if supplied_patient_id != uid:
        return error("Predictions can only be saved to your own patient record.", 403)
    try:
        row = pd.DataFrame([[features[name] for name in FEATURE_ORDER]], columns=FEATURE_ORDER, dtype=float)
        label = int(model.predict(row)[0])
        # This class flag is not a calibrated probability or clinical risk score.
        result_label = "Model flagged the positive class" if label == 1 else "Model did not flag the positive class"
        risk = "Elevated model flag" if label == 1 else "No elevated model flag"
        prediction_ref = db.collection("predictions").document()
        now = datetime.now(timezone.utc)
        record = {
            "predictionId": prediction_ref.id,
            "patientId": uid,
            "modelName": "Logistic Regression (UCI Heart Disease dataset)",
            "inputFeatures": features,
            "predictedDisease": "Heart disease class 1" if label == 1 else "Heart disease class 0",
            "predictionLabel": result_label,
            "riskLevel": risk,
            "predictionTimestamp": firestore.SERVER_TIMESTAMP,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "modelVersion": "heart-disease-v1",
        }
        prediction_ref.set(record)
        db.collection("audit_logs").add({
            "userId": uid, "action": "prediction.created", "patientId": uid,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
        return jsonify({
            "predictionId": prediction_ref.id,
            "prediction": record["predictedDisease"],
            "predictionLabel": result_label,
            "riskLevel": risk,
            "modelName": record["modelName"],
            "timestamp": now.isoformat(),
            "disclaimer": "AI-generated predictions are intended only for educational and decision-support purposes and are not a substitute for professional medical diagnosis or treatment.",
        }), 201
    except Exception:
        logger.exception("Prediction or Firestore write failed")
        return error("Prediction could not be completed. Try again later.", 502)


if __name__ == "__main__":
    load_model()
    initialize_firebase()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
else:
    load_model()
    initialize_firebase()
