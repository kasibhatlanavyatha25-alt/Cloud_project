import React, { useState } from "react";
import "./dashboard.css";
import { signOut } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import PredictionForm from "./PredictionForm";

export default function Dashboard() {
  const [showPrediction, setShowPrediction] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [saving, setSaving] = useState(false);

  const user = auth.currentUser;

  const handlePrediction = async (result, patientData) => {
    setPrediction(result);

    try {
      setSaving(true);

     await addDoc(collection(db, "predictions"), {
  doctorId: user?.uid || "",
  doctorEmail: user?.email || "",

  patient: {
    name: patientData.patientName,
    age: Number(patientData.age),
    sex: Number(patientData.sex),
    chestPain: Number(patientData.cp),
    restingBloodPressure: Number(patientData.trestbps),
    cholesterol: Number(patientData.chol),
    fastingBloodSugar: Number(patientData.fbs),
    maxHeartRate: Number(patientData.thalach),
    exerciseAngina: Number(patientData.exang),
    stDepression: Number(patientData.oldpeak),
    majorVessels: Number(patientData.ca),
  },

  prediction: result.prediction,
  predictionLabel: result.prediction_label,
  probability: result.probability,
  riskLevel: result.risk_level,

  createdAt: serverTimestamp(),
});
    } catch (error) {
      console.error("Firestore error:", error);
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <div className="dashboard">

      {/* SIDEBAR */}
      <aside className="sidebar">

        <div className="side-brand">
          <div className="side-logo">❤</div>
          <div>
            <strong>Health<span>AI</span></strong>
            <small>Healthcare Platform</small>
          </div>
        </div>

        <nav>
          <button className="nav-item active">
            <span>⌂</span>
            Dashboard
          </button>

          <button className="nav-item">
            <span>♙</span>
            Patients
          </button>

          <button
            className={`nav-item ${showPrediction ? "active" : ""}`}
            onClick={() => setShowPrediction(true)}
          >
            <span>❤</span>
            AI Prediction
          </button>

          <button className="nav-item">
            <span>▣</span>
            Medical Records
          </button>

          <button className="nav-item">
            <span>◔</span>
            Analytics
          </button>
        </nav>

        <div className="sidebar-bottom">

          <button className="nav-item">
            <span>⚙</span>
            Settings
          </button>

          <button className="logout-btn" onClick={logout}>
            <span>↪</span>
            Sign out
          </button>

        </div>
      </aside>

      {/* MAIN */}
      <main className="main-content">

        {/* HEADER */}
        <header className="topbar">

          <div className="mobile-title">
            <strong>Health<span>AI</span></strong>
          </div>

          <div className="search">
            <span>⌕</span>
            <input placeholder="Search patients, records..." />
          </div>

          <div className="doctor-area">

            <div className="notification">
              ♢
              <span></span>
            </div>

            <div className="doctor-profile">
              <div className="avatar">
                {user?.email?.charAt(0).toUpperCase() || "D"}
              </div>

              <div>
                <strong>Doctor</strong>
                <small>{user?.email}</small>
              </div>
            </div>

          </div>

        </header>

        {/* CONTENT */}
        <section className="content">

          <div className="welcome">

            <div>
              <div className="online-pill">
                <span></span>
                System operational
              </div>

              <h1>
                Good morning, Doctor 👋
              </h1>

              <p>
                Here's your healthcare overview for today.
              </p>
            </div>

            <button
              className="new-prediction"
              onClick={() => setShowPrediction(true)}
            >
              + New AI Assessment
            </button>

          </div>

          {/* STAT CARDS */}
          <div className="stats-grid">

            <div className="stat-card">
              <div className="stat-icon blue">♙</div>
              <div>
                <small>Total Patients</small>
                <h2>128</h2>
                <p>↑ 12% this month</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">✓</div>
              <div>
                <small>Assessments</small>
                <h2>42</h2>
                <p>↑ 8% this week</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon orange">!</div>
              <div>
                <small>High Risk</small>
                <h2>18</h2>
                <p className="warning">Needs attention</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon purple">AI</div>
              <div>
                <small>Model Accuracy</small>
                <h2>92%</h2>
                <p>Heart disease model</p>
              </div>
            </div>

          </div>

          {/* AI SECTION */}
          <div className="dashboard-grid">

            <div className="prediction-card">

              <div className="card-heading">

                <div>
                  <div className="ai-label">
                    <span>✦</span> AI POWERED
                  </div>

                  <h2>Heart Disease Assessment</h2>

                  <p>
                    Analyze patient health parameters using our
                    machine learning model.
                  </p>
                </div>

                <div className="heart-animation">
                  ❤
                </div>

              </div>

              {!showPrediction ? (

                <div className="assessment-start">

                  <div className="assessment-icon">
                    ❤
                  </div>

                  <h3>Start a new assessment</h3>

                  <p>
                    Enter patient vitals and clinical information
                    to generate an AI-powered risk assessment.
                  </p>

                  <button
                    onClick={() => setShowPrediction(true)}
                    className="assessment-btn"
                  >
                    Start Assessment →
                  </button>

                </div>

              ) : (

                <PredictionForm
                  onPrediction={handlePrediction}
                />

              )}

            </div>

            {/* RIGHT PANEL */}
            <div className="side-panel">

              <div className="cloud-card">

                <div className="cloud-icon">☁</div>

                <div>
                  <h3>Cloud Connected</h3>
                  <p>Your data is securely synchronized.</p>
                </div>

                <span className="connected">
                  ● Connected
                </span>

              </div>

              <div className="recent-card">

                <div className="recent-header">
                  <h3>Recent Activity</h3>
                  <button>View all</button>
                </div>

                <div className="activity">
                  <div className="activity-icon high">❤</div>
                  <div>
                    <strong>Heart assessment</strong>
                    <small>High risk detected</small>
                  </div>
                  <span>2m</span>
                </div>

                <div className="activity">
                  <div className="activity-icon low">✓</div>
                  <div>
                    <strong>Patient assessment</strong>
                    <small>Low risk detected</small>
                  </div>
                  <span>1h</span>
                </div>

                <div className="activity">
                  <div className="activity-icon cloud">☁</div>
                  <div>
                    <strong>Record synchronized</strong>
                    <small>Cloud Firestore</small>
                  </div>
                  <span>3h</span>
                </div>

              </div>

              {/* MODEL CARD */}
              <div className="model-card">

                <div className="model-header">
                  <span>AI</span>
                  <div>
                    <strong>Prediction Engine</strong>
                    <small>Random Forest</small>
                  </div>
                </div>

                <div className="accuracy">
                  <div>
                    <strong>92%</strong>
                    <span>Accuracy</span>
                  </div>

                  <div className="progress">
                    <div></div>
                  </div>
                </div>

              </div>

            </div>

          </div>

          {/* RESULT */}
          {prediction && (
            <div className="result-card">

              <div>
                <small>Latest AI Assessment</small>

                <h2>
                  {prediction.prediction_label}
                </h2>

                <p>
                  Probability:{" "}
                  <strong>
                    {(prediction.probability * 100).toFixed(1)}%
                  </strong>
                </p>
              </div>

              <div
                className={`risk-badge ${prediction.risk_level?.toLowerCase()}`}
              >
                {prediction.risk_level} Risk
              </div>

              <div className="saved-status">
                {saving ? "Saving..." : "✓ Saved to Cloud"}
              </div>

            </div>
          )}

        </section>

      </main>
    </div>
  );
}