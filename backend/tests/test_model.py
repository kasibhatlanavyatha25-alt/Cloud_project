"""Small local checks for the model and API's auth/validation boundary."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as api
from app import app, FEATURE_ORDER, model, validate_features
import pandas as pd


VALID = {"age": 52, "sex": 1, "cp": 0, "trestbps": 125, "chol": 212,
         "fbs": 0, "restecg": 1, "thalach": 168, "exang": 0,
         "oldpeak": 1.0, "slope": 2, "ca": 2, "thal": 3}


class ModelAndApiTests(unittest.TestCase):
    def test_dataset_backed_model_is_loaded_and_returns_binary_class(self):
        self.assertIsNotNone(model, "Run python -m ml.train_model before testing")
        values, issue = validate_features(VALID)
        self.assertIsNone(issue)
        self.assertEqual(set(values), set(FEATURE_ORDER))
        self.assertIn(int(model.predict(pd.DataFrame([[values[key] for key in FEATURE_ORDER]], columns=FEATURE_ORDER))[0]), (0, 1))

    def test_validation_rejects_missing_and_out_of_range_values(self):
        _, issue = validate_features({"age": 50})
        self.assertIn("Missing model inputs", issue)
        invalid = {**VALID, "cp": 9}
        _, issue = validate_features(invalid)
        self.assertIn("cp must be one of", issue)
        invalid = {**VALID, "chol": float("nan")}
        _, issue = validate_features(invalid)
        self.assertIn("finite number", issue)

    def test_prediction_requires_bearer_token_and_own_patient_id(self):
        class Ref:
            id = "prediction-1"
            def get(self): return SimpleNamespace(exists=True, to_dict=lambda: {"role": "patient"})
            def set(self, value): self.value = value
        class Collection:
            def __init__(self): self.ref = Ref()
            def document(self, *args): return self.ref
            def add(self, value): self.added = value
        class FakeDb:
            def __init__(self): self.collections = {}
            def collection(self, name): return self.collections.setdefault(name, Collection())
        fake_db = FakeDb()
        fake_auth = SimpleNamespace(verify_id_token=lambda token, check_revoked=True: {"uid": "patient-1"})
        fake_firestore = SimpleNamespace(SERVER_TIMESTAMP="server-timestamp")
        previous = (api.auth_ready, api.db, api.firebase_auth, api.firestore)
        try:
            api.auth_ready, api.db, api.firebase_auth, api.firestore = True, fake_db, fake_auth, fake_firestore
            client = app.test_client()
            self.assertEqual(client.post("/api/predict", json=VALID).status_code, 401)
            result = client.post("/api/predict", json={**VALID, "patientId": "patient-2"}, headers={"Authorization": "Bearer valid"})
            self.assertEqual(result.status_code, 403)
            result = client.post("/api/predict", json={**VALID, "patientId": "patient-1"}, headers={"Authorization": "Bearer valid"})
            self.assertEqual(result.status_code, 201, result.get_json())
            self.assertEqual(fake_db.collections["predictions"].ref.value["patientId"], "patient-1")
            self.assertEqual(fake_db.collections["audit_logs"].added["action"], "prediction.created")
        finally:
            api.auth_ready, api.db, api.firebase_auth, api.firestore = previous


if __name__ == "__main__":
    unittest.main()
