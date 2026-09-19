# Cloud-Based Healthcare Data Management System with AI-Powered Disease Prediction

Heart disease prediction, chosen because the UCI dataset is well-known, clean,
and gives you a confident story for your review ("well-documented public dataset,
13 clinically meaningful features").

## Architecture

```
React (Firebase Auth) --> Flask API (/predict) --> scikit-learn model (model.pkl)
        |
        v
Firebase Firestore (patient records + prediction history)
Firebase Storage (lab report uploads)
```

## 1. Get the dataset

Download **heart.csv** — the UCI Heart Disease dataset (303 rows, 13 features,
binary target: 0 = no disease, 1 = disease).
- Kaggle: search "Heart Disease UCI Dataset" (ronitf/heart-disease-uci)
- Or UCI ML Repository: "Heart Disease Data Set"

Place it at: `backend/data/heart.csv`

## 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python train_model.py           # trains + saves model.pkl, scaler.pkl
python app.py                   # starts API on http://localhost:5000
```

Test it:
```bash
curl -X POST http://localhost:5000/predict -H "Content-Type: application/json" -d '{
  "age":52,"sex":1,"cp":0,"trestbps":125,"chol":212,"fbs":0,"restecg":1,
  "thalach":168,"exang":0,"oldpeak":1.0,"slope":2,"ca":2,"thal":3
}'
```

## 3. Firebase setup

1. Go to console.firebase.google.com → Create project
2. Build → Authentication → Enable **Email/Password**
3. Build → Firestore Database → Create database (test mode is fine for a demo)
4. Build → Storage → Enable
5. Project settings → your apps → Web app → copy the config
6. Paste it into `frontend/src/firebase.js`

## 4. Frontend setup

```bash
cd frontend
npm create vite@latest . -- --template react   # if starting from empty folder, else skip
npm install
npm run dev
```

Open the printed localhost URL, sign up as a doctor, and you'll land on the
dashboard where you can enter patient data and get live predictions.

## 5. Deploying (optional, for a stronger review)

- **Backend**: Render.com or Railway.app (free tier, just point at `backend/`, start command `python app.py`)
- **Frontend**: Vercel or Netlify (connect your GitHub repo, root = `frontend/`)
- **Cloud**: Firebase is already cloud-hosted — mention this explicitly to faculty as your "cloud computing" component alongside the deployed backend.

## Why this satisfies every review question in your prep doc

| Question | Where it's answered |
|---|---|
| Why cloud? | Firebase Firestore/Storage/Auth = centralized, scalable, backed-up, accessible anywhere |
| Where is AI used? | `/predict` endpoint — scikit-learn model trained on real clinical data |
| What's the novelty? | Combines storage + AI prediction + live dashboard in one system, most student projects only do storage |
| Dataset | UCI Heart Disease — 303 patients, 13 features, well-documented |

## Presentation flow to practice

"Doctor logs in via Firebase Authentication → enters patient vitals in the
React form → Flask backend scales the input and runs it through the trained
Random Forest model → predicted disease + risk level is returned and saved to
Firestore → dashboard updates live with charts via Chart.js."
