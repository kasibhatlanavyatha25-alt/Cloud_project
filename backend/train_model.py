"""
train_model.py

Trains a heart disease prediction model using the current
heart.csv dataset and saves the trained model and scaler
for the Flask API.
"""

import os
import joblib
import pandas as pd

from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(__file__)

DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "heart.csv"
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "model.pkl"
)

SCALER_PATH = os.path.join(
    BASE_DIR,
    "scaler.pkl"
)


# ============================================================
# DATASET FEATURES
# ============================================================

# IMPORTANT:
# These are the 13 INPUT features.
# "condition" is the TARGET and must NOT be included here.

FEATURE_COLUMNS = [
    "age",
    "sex",
    "cp",
    "trestbps",
    "chol",
    "fbs",
    "restecg",
    "thalach",
    "exang",
    "oldpeak",
    "slope",
    "ca",
    "thal"
]

TARGET_COLUMN = "condition"


# ============================================================
# LOAD DATA
# ============================================================

def load_data():

    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"\nDataset not found at:\n{DATA_PATH}\n"
            "\nMake sure heart.csv is inside:\n"
            "backend/data/heart.csv"
        )

    df = pd.read_csv(DATA_PATH)

    return df


# ============================================================
# TRAIN MODEL
# ============================================================

def train():

    # --------------------------------------------------------
    # Load dataset
    # --------------------------------------------------------

    df = load_data()

    print("\n========================================")
    print("HEART DISEASE AI MODEL TRAINING")
    print("========================================")

    print(
        f"\nLoaded dataset: "
        f"{df.shape[0]} rows, {df.shape[1]} columns"
    )

    print("\nDataset columns:")
    print(list(df.columns))


    # --------------------------------------------------------
    # Check required columns
    # --------------------------------------------------------

    required_columns = FEATURE_COLUMNS + [TARGET_COLUMN]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:

        raise ValueError(
            f"\nMissing columns in dataset: "
            f"{missing_columns}"
        )


    # --------------------------------------------------------
    # Separate input features and target
    # --------------------------------------------------------

    X = df[FEATURE_COLUMNS].copy()

    y = df[TARGET_COLUMN].copy()


    # --------------------------------------------------------
    # Verify feature count
    # --------------------------------------------------------

    print("\n========================================")
    print("FEATURE INFORMATION")
    print("========================================")

    print("\nInput features:")
    print(FEATURE_COLUMNS)

    print(f"\nNumber of input features: {X.shape[1]}")
    print(f"Number of samples: {X.shape[0]}")
    print(f"Target column: {TARGET_COLUMN}")


    if X.shape[1] != 13:

        raise ValueError(
            f"\nERROR: Expected 13 input features, "
            f"but found {X.shape[1]}."
        )


    # --------------------------------------------------------
    # Check missing values
    # --------------------------------------------------------

    print("\nMissing values:")

    missing_values = X.isnull().sum()

    print(missing_values)

    if missing_values.sum() > 0:

        print(
            "\nMissing values detected. "
            "Filling numeric missing values with median."
        )

        X = X.fillna(X.median())


    # --------------------------------------------------------
    # Train-test split
    # --------------------------------------------------------

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y
    )

    print("\n========================================")
    print("DATA SPLIT")
    print("========================================")

    print(f"Training samples: {len(X_train)}")
    print(f"Testing samples: {len(X_test)}")


    # --------------------------------------------------------
    # Feature scaling
    # --------------------------------------------------------

    scaler = StandardScaler()

    X_train_scaled = scaler.fit_transform(X_train)

    X_test_scaled = scaler.transform(X_test)

    print(
        f"\nScaler input features: "
        f"{scaler.n_features_in_}"
    )


    # --------------------------------------------------------
    # Candidate models
    # --------------------------------------------------------

    candidates = {

        "LogisticRegression":
            LogisticRegression(
                max_iter=1000,
                random_state=42
            ),

        "SVM":
            SVC(
                probability=True,
                random_state=42
            ),

        "RandomForest":
            RandomForestClassifier(
                random_state=42
            )
    }


    # --------------------------------------------------------
    # Train and compare models
    # --------------------------------------------------------

    print("\n========================================")
    print("MODEL COMPARISON")
    print("========================================")

    best_model = None
    best_score = -1
    best_name = ""

    for name, model in candidates.items():

        model.fit(
            X_train_scaled,
            y_train
        )

        predictions = model.predict(
            X_test_scaled
        )

        accuracy = accuracy_score(
            y_test,
            predictions
        )

        print(
            f"{name}: "
            f"accuracy = {accuracy:.4f}"
        )

        if accuracy > best_score:

            best_score = accuracy
            best_model = model
            best_name = name


    # --------------------------------------------------------
    # Best model
    # --------------------------------------------------------

    print("\n========================================")
    print("BEST MODEL")
    print("========================================")

    print(
        f"Best model: {best_name}"
    )

    print(
        f"Accuracy: {best_score:.4f}"
    )


    # --------------------------------------------------------
    # Classification report
    # --------------------------------------------------------

    best_predictions = best_model.predict(
        X_test_scaled
    )

    print("\n========================================")
    print("CLASSIFICATION REPORT")
    print("========================================")

    print(
        classification_report(
            y_test,
            best_predictions
        )
    )


    # --------------------------------------------------------
    # Confusion matrix
    # --------------------------------------------------------

    print("\n========================================")
    print("CONFUSION MATRIX")
    print("========================================")

    print(
        confusion_matrix(
            y_test,
            best_predictions
        )
    )


    # --------------------------------------------------------
    # Random Forest hyperparameter tuning
    # --------------------------------------------------------

    if best_name == "RandomForest":

        print("\n========================================")
        print("RANDOM FOREST TUNING")
        print("========================================")

        param_grid = {

            "n_estimators": [
                100,
                200
            ],

            "max_depth": [
                None,
                5,
                10
            ],

            "min_samples_split": [
                2,
                5
            ]
        }

        grid = GridSearchCV(
            RandomForestClassifier(
                random_state=42
            ),
            param_grid,
            cv=5,
            scoring="accuracy",
            n_jobs=-1
        )

        grid.fit(
            X_train_scaled,
            y_train
        )

        best_model = grid.best_estimator_

        tuned_predictions = best_model.predict(
            X_test_scaled
        )

        tuned_accuracy = accuracy_score(
            y_test,
            tuned_predictions
        )

        print(
            f"Tuned RandomForest accuracy: "
            f"{tuned_accuracy:.4f}"
        )

        print(
            f"Best parameters: "
            f"{grid.best_params_}"
        )


    # --------------------------------------------------------
    # Save model
    # --------------------------------------------------------

    joblib.dump(
        best_model,
        MODEL_PATH
    )

    joblib.dump(
        scaler,
        SCALER_PATH
    )


    # --------------------------------------------------------
    # Final information
    # --------------------------------------------------------

    print("\n========================================")
    print("TRAINING COMPLETE")
    print("========================================")

    print(
        f"\nModel saved to:\n{MODEL_PATH}"
    )

    print(
        f"\nScaler saved to:\n{SCALER_PATH}"
    )

    print(
        f"\nFinal scaler feature count: "
        f"{scaler.n_features_in_}"
    )

    print("\n========================================\n")


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    train()