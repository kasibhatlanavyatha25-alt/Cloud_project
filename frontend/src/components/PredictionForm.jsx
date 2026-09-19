import React, { useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";

const initialForm = {
  age: "",
  sex: "1",
  cp: "0",
  trestbps: "",
  chol: "",
  fbs: "0",
  restecg: "0",
  thalach: "",
  exang: "0",
  oldpeak: "",
  slope: "1",
  ca: "0",
  thal: "2",
  patientName: "",
};

export default function PredictionForm({ onPrediction }) {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setResult(null);
    setError("");

    try {
      // Separate patient name from ML features
      const { patientName, ...features } = form;

      // Basic validation
      if (!patientName.trim()) {
        throw new Error("Please enter the patient name.");
      }

      if (Number(form.age) < 1 || Number(form.age) > 120) {
        throw new Error("Please enter a valid age.");
      }

      if (Number(form.trestbps) <= 0) {
        throw new Error("Please enter a valid blood pressure.");
      }

      if (Number(form.chol) <= 0) {
        throw new Error("Please enter a valid cholesterol value.");
      }

      if (Number(form.thalach) <= 0) {
        throw new Error("Please enter a valid maximum heart rate.");
      }

      if (Number(form.oldpeak) < 0) {
        throw new Error("ST depression cannot be negative.");
      }

      if (Number(form.ca) < 0 || Number(form.ca) > 3) {
        throw new Error("Major vessels must be between 0 and 3.");
      }

      // Send data to Flask backend
      const res = await axios.post(`${API_URL}/predict`, features);

      setResult(res.data);

      // Send result + patient information to Dashboard
      // Dashboard is responsible for Firestore saving.
      if (onPrediction) {
        await onPrediction(res.data, {
          patientName: patientName.trim(),
          ...features,
        });
      }
    } catch (err) {
      console.error("Prediction error:", err);

      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError(err.message || "Prediction failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="prediction-form">
      <h2>Heart Disease Risk Prediction</h2>

      <form onSubmit={handleSubmit}>

        {/* Patient Name */}
        <input
          name="patientName"
          value={form.patientName}
          placeholder="Patient Name"
          onChange={handleChange}
          required
        />

        {/* Age */}
        <input
          name="age"
          value={form.age}
          type="number"
          min="1"
          max="120"
          placeholder="Age"
          onChange={handleChange}
          required
        />

        {/* Sex */}
        <select
          name="sex"
          value={form.sex}
          onChange={handleChange}
        >
          <option value="1">Male</option>
          <option value="0">Female</option>
        </select>

        {/* Chest Pain */}
        <select
          name="cp"
          value={form.cp}
          onChange={handleChange}
        >
          <option value="0">
            Chest Pain: Typical Angina
          </option>
          <option value="1">
            Chest Pain: Atypical Angina
          </option>
          <option value="2">
            Chest Pain: Non-anginal
          </option>
          <option value="3">
            Chest Pain: Asymptomatic
          </option>
        </select>

        {/* Blood Pressure */}
        <input
          name="trestbps"
          value={form.trestbps}
          type="number"
          min="1"
          placeholder="Resting Blood Pressure"
          onChange={handleChange}
          required
        />

        {/* Cholesterol */}
        <input
          name="chol"
          value={form.chol}
          type="number"
          min="1"
          placeholder="Cholesterol (mg/dl)"
          onChange={handleChange}
          required
        />

        {/* Fasting Blood Sugar */}
        <select
          name="fbs"
          value={form.fbs}
          onChange={handleChange}
        >
          <option value="0">
            Fasting Blood Sugar &lt; 120 mg/dl
          </option>
          <option value="1">
            Fasting Blood Sugar &gt; 120 mg/dl
          </option>
        </select>

        {/* Maximum Heart Rate */}
        <input
          name="thalach"
          value={form.thalach}
          type="number"
          min="1"
          placeholder="Max Heart Rate Achieved"
          onChange={handleChange}
          required
        />

        {/* Exercise Angina */}
        <select
          name="exang"
          value={form.exang}
          onChange={handleChange}
        >
          <option value="0">
            No Exercise-Induced Angina
          </option>
          <option value="1">
            Exercise-Induced Angina
          </option>
        </select>

        {/* ST Depression */}
        <input
          name="oldpeak"
          value={form.oldpeak}
          type="number"
          min="0"
          step="0.1"
          placeholder="ST Depression (oldpeak)"
          onChange={handleChange}
          required
        />

        {/* Major Vessels */}
        <input
          name="ca"
          value={form.ca}
          type="number"
          min="0"
          max="3"
          placeholder="Number of Major Vessels (0-3)"
          onChange={handleChange}
          required
        />

        {/* Submit */}
        <button type="submit" disabled={loading}>
          {loading ? "Predicting..." : "Predict"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Result */}
      {result && !error && (
        <div
          className={`result-card ${
            result.risk_level?.toLowerCase() || ""
          }`}
        >
          <h3>{result.prediction_label}</h3>

          <p>
            Risk Level:{" "}
            <strong>{result.risk_level}</strong>
          </p>

          <p>
            Confidence:{" "}
            {(result.probability * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </div>
  );
}