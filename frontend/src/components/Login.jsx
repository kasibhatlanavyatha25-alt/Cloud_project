import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase";
import "./Healthcare.css";

export default function Login() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.replace("Firebase: Error (auth/", "").replace(").", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

      <div className="auth-left">
        <div className="brand">
          <div className="brand-icon">❤</div>
          <span>Health<span>AI</span></span>
        </div>

        <div className="hero-content">
          <div className="status-pill">
            <span></span>
            AI Healthcare Platform
          </div>

          <h1>
            Smarter healthcare.
            <br />
            <span>Better decisions.</span>
          </h1>

          <p>
            Securely manage patient records and use AI-powered
            heart disease risk prediction from one intelligent platform.
          </p>

          <div className="feature-row">
            <div>
              <strong>AI</strong>
              <small>Prediction</small>
            </div>

            <div>
              <strong>Cloud</strong>
              <small>Data Storage</small>
            </div>

            <div>
              <strong>24/7</strong>
              <small>Accessibility</small>
            </div>
          </div>
        </div>

        <div className="auth-footer">
          <span>● Secure Cloud Infrastructure</span>
          <span>● AI Assisted</span>
        </div>
      </div>

      <div className="auth-right">

        <div className="auth-card">

          <div className="mobile-brand">
            <div className="brand-icon">❤</div>
            <span>Health<span>AI</span></span>
          </div>

          <div className="auth-heading">
            <div className="mini-icon">🩺</div>

            <h2>
              {isSignup ? "Create your account" : "Welcome back"}
            </h2>

            <p>
              {isSignup
                ? "Create your secure doctor account"
                : "Sign in to your healthcare workspace"}
            </p>
          </div>

          {error && (
            <div className="error-box">
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>

            <label>Email address</label>

            <div className="input-box">
              <span>✉</span>
              <input
                type="email"
                placeholder="doctor@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <label>Password</label>

            <div className="input-box">
              <span>🔒</span>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {!isSignup && (
              <div className="forgot">
                <span>Secure doctor access</span>
                <span>Protected by Firebase</span>
              </div>
            )}

            <button className="primary-btn" disabled={loading}>
              {loading
                ? "Please wait..."
                : isSignup
                ? "Create Doctor Account →"
                : "Sign In to Dashboard →"}
            </button>

          </form>

          <div className="divider">
            <span>OR</span>
          </div>

          <p className="switch-text">
            {isSignup
              ? "Already have an account?"
              : "Don't have a doctor account?"}

            <button
              type="button"
              onClick={() => {
                setIsSignup(!isSignup);
                setError("");
              }}
            >
              {isSignup ? " Sign in" : " Create account"}
            </button>
          </p>

          <div className="security-note">
            🔐 Your healthcare workspace is protected
          </div>

        </div>

      </div>
    </div>
  );
}