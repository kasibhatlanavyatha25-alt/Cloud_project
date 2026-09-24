# Cloud-Based Healthcare Data Management System with AI-Powered Disease Prediction

An academic, deployable React + Flask + Firebase application. Firebase Authentication, Firestore, and Cloud Storage handle accounts and patient-controlled records. A separate Flask REST API uses a trained scikit-learn model on structured inputs from the heart-disease data bundled with the linked project repository.

> **Medical safety:** AI output is decision-support for an academic demonstration. It is not a diagnosis, treatment recommendation, or substitute for a qualified healthcare professional. Do not enter real patient information.

## Features

- Patient registration and sign-in with Firebase Email/Password Authentication, reset email, protected routes, and roles stored in Firestore.
- Patient profile, symptoms, medical history, vital measurements, report uploads, prediction history, a printable/downloadable PDF summary, and explicit doctor sharing/revocation.
- Doctor dashboard lists only active patient grants; doctors can review shared records, reports, predictions, and write clinical notes.
- Admin dashboard reads Firestore counts/activity and can promote existing accounts to doctor/admin roles.
- Firebase Storage upload validation (PDF/JPG/PNG, under 10 MB), metadata in Firestore, and an authenticated Flask download proxy that checks the current access grant on every request.
- Actual Logistic Regression pipeline trained on the repository's 303-row, 13-feature heart-disease dataset. Training metrics are generated from a stratified 80/20 holdout split and saved with the model.
- Firestore and Storage rules default to denial and enforce role, ownership, sharing, file type, and file-size checks.
- Local Firebase Emulator Suite configuration and a Render free web-service blueprint are included.

## Architecture

```text
React (Firebase Auth) ────────┬──── Firestore (rules protected)
        │                      ├──── Firebase Storage (rules protected)
        │ Firebase ID token    └──── Firebase Hosting (static SPA)
        ▼
Flask REST API (Render free web service)
        ├── verifies Firebase ID token and patient role
        ├── predicts with trained scikit-learn Pipeline
        └── writes prediction + audit record to Firestore using Admin SDK
```

## Technology and folders

- `frontend/` — React 18, Vite, Firebase JS SDK, React Router, Chart.js, jsPDF.
- `backend/` — Flask API, Firebase Admin SDK, pandas, NumPy, scikit-learn, training pipeline, and admin role bootstrap script.
- `backend/data/heart.csv` — cleaned Cleveland heart-disease data distributed with the source repository.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` — cloud rules, required indexes, static SPA hosting and emulator configuration.

## Data and model

The supplied CSV contains 297 examples, 13 structured features, and binary target `condition`. It is a cleaned dataset associated with the Cleveland subset of the UCI Heart Disease dataset; UCI lists the dataset and attributes at [UCI Machine Learning Repository: Heart Disease](https://archive.ics.uci.edu/dataset/45/heart+disease). The source repository includes the CSV; the app does not fetch or fabricate training records at runtime.

The pipeline is `StandardScaler` + `LogisticRegression`, trained with a fixed, stratified 80/20 split (`random_state=42`). Accuracy, precision, recall, F1, and the confusion matrix are calculated on the held-out portion when the model is trained. These single-split metrics describe only this small dataset and do not establish clinical performance. The app does not show model probabilities or claim a calibrated clinical risk score. “Elevated model flag” is the model's positive class, not a diagnosis.

Run training from the `backend/` directory:

```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m ml.train_model
```

Artifacts are written to `backend/ml/artifacts/` and are ignored by Git. Render's build command trains the model during deployment. Retrain with a new, properly licensed dataset before changing the feature schema.

The model expects these 13 fields, in this order: `age`, `sex`, `cp`, `trestbps`, `chol`, `fbs`, `restecg`, `thalach`, `exang`, `oldpeak`, `slope`, `ca`, `thal`. The API rejects missing, non-finite, out-of-range, or invalid category values. PDF/image uploads are stored as files only; they are not extracted or passed to the model.

## Firebase project setup

1. Create/select a Firebase project and a **Standard Firestore database** in a location appropriate for your demo. Apply `firestore.rules` and `firestore.indexes.json` from the Firebase Console or CLI.
2. In Authentication, enable Email/Password and add `localhost` and the deployed frontend host to authorized domains.
3. Register a Web App and copy its config values to `frontend/.env.local` (use `.env.example` as a template). Firebase web API keys identify a project and are intended for browser use; Firestore/Storage rules provide the authorization boundary. Never put service-account credentials in the frontend.
4. Enable Firestore and publish the rules. Never use test-mode/open rules.
5. Cloud Storage is integrated in the app. **Firebase currently requires the Blaze pay-as-you-go plan to use Cloud Storage for Firebase, including the default bucket.** The Spark plan alone therefore cannot deploy the required cloud file-upload feature. This repo does not upgrade a project or create billing resources. If you require strict Spark-only / no-billing setup, use the local Storage Emulator for development and leave hosted uploads disabled. To deploy hosted Storage, a project owner must explicitly choose Blaze and monitor usage; Firebase's no-cost allowance is not a guarantee against charges. See the [Firebase Storage FAQ](https://firebase.google.com/docs/storage/faq-and-troubleshooting) and [Firebase pricing](https://firebase.google.com/pricing).
6. Publish `storage.rules`. Create a bucket only when you have selected a compatible project plan; uploads are limited to PDF/JPEG/PNG under 10 MiB.
7. Configure Firebase Authentication, Firestore, and Storage before using the frontend. No fake/demo data is seeded automatically.

### Firestore model

| Collection | Document ID / important fields | Access |
|---|---|---|
| `users` | UID; name, email, role, createdAt | User reads own profile; admins manage roles. Client signup can create only a patient role. |
| `patients` | UID; patientId, userId, name, demographics, profile/history fields, vitalSigns | Patient owner, currently authorized doctor, or admin. |
| `doctors` | UID; doctorId, name, email, specialization | Readable to signed-in app users for patient sharing; managed by admin. |
| `medical_records` | Auto ID; patientId, symptoms/history/vitalSigns, optional clinical note | Owner and active doctor; only patient can edit their health data; a shared doctor may add a note. |
| `lab_reports` | Report ID; patientId, storagePath, MIME, type, description, uploadedAt | Owner, active doctor, or admin. File body stays in Storage. |
| `predictions` | Prediction ID; patientId, feature snapshot, model, class and timestamp | Owner, active doctor, or admin can read. Browser writes are denied; Flask Admin SDK writes after token/role verification. |
| `doctor_access` | `{patientId}_{doctorId}`; active/revoked status | Patient grants/revokes; doctor sees their grant; active grant gates all data/file reads. |
| `audit_logs` | Auto ID; userId, action, patientId, timestamp | Admin reads; allowed user actions are recorded. |

User roles are never accepted from public signup input. To bootstrap the first administrator, first register that email as a patient, then run the trusted backend role script with Firebase Admin credentials. Repeat for doctor accounts. This avoids a public self-promotion route.

```powershell
# From backend/, with ADC or GOOGLE_APPLICATION_CREDENTIALS set
$env:FIREBASE_PROJECT_ID = "your-firebase-project-id"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\service-account.json"
python scripts/set_role.py admin@example.com admin
python scripts/set_role.py doctor@example.com doctor --specialization Cardiology
```

Keep service account JSON outside the repository. On Render, set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` as private environment variables. The private key must be stored as the original multiline key; the API handles `\n` escaped values too.

## Run locally

### Frontend

```bash
cd frontend
Copy-Item ..\.env.example .env.local
# Fill the VITE_FIREBASE_* values and VITE_API_BASE_URL.
npm install
npm run dev
```

### Flask backend

In a second terminal:

```bash
cd backend
python -m venv .venv
# Activate the environment using the command for your OS.
pip install -r requirements.txt
python -m ml.train_model
python app.py
```

The API is served at `http://localhost:5000`. `GET /api/health` reports model/Firebase readiness; `GET /api/model/metrics` returns generated evaluation metrics. `POST /api/predict` requires `Authorization: Bearer <Firebase ID token>`, a patient profile with role `patient`, and the 13 model fields. Predictions are saved to `predictions` and an audit entry to `audit_logs`. Cloud endpoints return 503 until trusted Firebase Admin credentials are configured.

### Firebase emulators

Emulators allow local Auth, Firestore, and Storage testing without a deployed Firebase project:

```bash
npx -y firebase-tools@latest emulators:start --only auth,firestore,storage
```

Set `VITE_USE_FIREBASE_EMULATORS=true` in `frontend/.env.local`. Deploying Storage still requires a compatible Firebase billing plan. The emulator does not exercise Firebase's real hosted quotas or billing setup.

## Test and verify

```bash
cd backend
python -m ml.train_model
python -m unittest discover -s tests -v
```

```bash
cd frontend
npm run build
```

The backend checks cover model loading, input validation, prediction ownership, an authenticated API flow with a mocked Firebase token verifier, and Firestore writes with a test double. Firebase signup, Firestore access rules, actual report upload, doctor revocation, and live Auth/Firestore/Storage end-to-end flows require Firebase project configuration; use the emulator for local rule testing, then repeat with authorized synthetic accounts before presenting. The Flask token test does not substitute for a live Firebase Auth integration test.

## Deployment (free service plans)

### Static React frontend on Firebase Hosting

Firebase Hosting can serve the SPA from the free Hosting quota. Build with the production API URL and web app settings in your environment:

```bash
cd frontend
npm install
npm run build
cd ..
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use YOUR_PROJECT_ID
npx -y firebase-tools@latest deploy --only hosting,firestore:rules,firestore:indexes,storage
```

Do not run this deploy command until you have selected the Firebase project and verified its plan/billing settings. With a strict Spark-only project, omit `storage` and hosted file upload will not work.

### Flask API on Render Free

Connect the GitHub repository in Render and use `backend/render.yaml`, or create a Python web service with root directory `backend`, build command `pip install -r requirements.txt && python -m ml.train_model`, start command `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`, and health path `/api/health`. Configure the Firebase Admin private environment values and `FRONTEND_ORIGINS` with the actual Hosting origin. Set frontend `VITE_API_BASE_URL` to the Render service URL before building.

Render's free services sleep when idle and can take about a minute to wake. Their local filesystem is ephemeral; the model is regenerated during builds, while patient data and reports remain in Firebase. Free services are intended for demos and preview, not production healthcare data. See [Render's free service limitations](https://render.com/docs/free).

## Security notes

- `firestore.rules` and `storage.rules` default to denial and limit access to authenticated owners, admins, or doctors with an active patient grant. Revoking a grant blocks later reads and API downloads.
- Prediction documents are client-read-only. Flask verifies Firebase ID tokens, checks the `users/{uid}` role, accepts inputs only for that user's patient ID, then writes the result with the Admin SDK.
- Report downloads go through Flask to re-check current sharing status. The app does not store tokenized public download URLs in Firestore.
- Service-account credentials are backend-only. Never commit `.env`, private keys, or service-account JSON.
- Admin roles must be granted through trusted Admin SDK/Console access. A browser signup cannot set its own role.
- These rules are an academic prototype and should be reviewed against every final query/schema before broad sharing.

## Limitations and future scope

- Model performance depends on a small historical dataset and one holdout split; it is not a clinically validated decision tool.
- Only the heart-disease dataset's structured fields are accepted by the model. Uploads are stored, not interpreted.
- Firebase Storage hosted upload requires Blaze, so strict Spark-only deployments cannot demonstrate hosted Storage until plan requirements change. The local emulator is available for no-cost development.
- Real hospital EHR integration, real patient information, regulatory compliance, and clinical workflow validation are outside this academic demo.
- Future scope: EHR integration, IoT health monitoring, additional disease datasets, medical-image analysis, validated report NLP, multi-hospital interoperability, and a mobile client.
