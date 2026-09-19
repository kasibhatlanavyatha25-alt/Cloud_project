"""
app.py — Flask REST API for the Cloud-Based Healthcare Data Management
System with AI-Powered Disease Prediction.

Endpoints:
  GET  /                -> health check
  POST /predict          -> takes patient data, returns disease prediction + risk
  POST /patients          -> save a patient record to Firestore
  GET  /patients/<uid>     -> fetch a doctor's patient records

Run:
  python app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import os

app = Flask(__name__)
CORS(app)  # allow the React frontend (different origin) to call this API

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "scaler.pkl")

FEATURE_ORDER = [
    "age", "sex", "cp", "trestbps", "chol", "fbs", "restecg",
    "thalach", "exang", "oldpeak", "slope", "ca", "thal"
]

model = None
scaler = None
if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
else:
    print("WARNING: model.pkl / scaler.pkl not found. Run train_model.py first.")

# --- Optional: Firebase Admin SDK for storing patient records server-side ---
# Uncomment once you've downloaded your Firebase service account key JSON
# and placed it as backend/serviceAccountKey.json
#
# import firebase_admin
# from firebase_admin import credentials, firestore
# cred = credentials.Certificate("serviceAccountKey.json")
# firebase_admin.initialize_app(cred)
# db = firestore.client()


@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "message": "Healthcare AI API is running"})


@app.route("/predict", methods=["POST"])
def predict():
    if model is None or scaler is None:
        return jsonify({"error": "Model not loaded. Run train_model.py first."}), 500

    data = request.get_json(force=True)

    missing = [f for f in FEATURE_ORDER if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        features = np.array([[float(data[f]) for f in FEATURE_ORDER]])
    except (ValueError, TypeError):
        return jsonify({"error": "All fields must be numeric"}), 400

    features_scaled = scaler.transform(features)
    prediction = model.predict(features_scaled)[0]
    probability = model.predict_proba(features_scaled)[0][1]  # prob of disease=1

    if probability >= 0.7:
        risk = "High"
    elif probability >= 0.4:
        risk = "Moderate"
    else:
        risk = "Low"

    return jsonify({
        "prediction": int(prediction),
        "prediction_label": "Heart Disease Likely" if prediction == 1 else "No Heart Disease Detected",
        "probability": round(float(probability), 3),
        "risk_level": risk
    })


# Example structure for saving a record — wire this up once Firebase is set up
@app.route("/patients", methods=["POST"])
def save_patient():
    data = request.get_json(force=True)
    # db.collection("patients").add(data)   # <-- uncomment once Firebase is connected
    return jsonify({"status": "received", "note": "Connect Firestore in app.py to persist this."})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
