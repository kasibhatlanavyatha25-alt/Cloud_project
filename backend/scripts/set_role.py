"""Promote an already-registered account using trusted Firebase Admin credentials.

Examples from the backend directory:
  python scripts/set_role.py person@example.com admin
  python scripts/set_role.py clinician@example.com doctor --specialization Cardiology
"""
import argparse
import os

import firebase_admin
from firebase_admin import auth, credentials, firestore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    parser.add_argument("role", choices=["admin", "doctor", "patient"])
    parser.add_argument("--specialization", default="General practice")
    args = parser.parse_args()
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    if not project_id:
        parser.error("Set FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS first.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    user = auth.get_user_by_email(args.email)
    db = firestore.client()
    ref = db.collection("users").document(user.uid)
    snap = ref.get()
    if not snap.exists:
        raise SystemExit("That Firebase Auth account has no app profile. Register it in the frontend first.")
    ref.update({"role": args.role})
    if args.role == "doctor":
        profile = snap.to_dict() or {}
        db.collection("doctors").document(user.uid).set({
            "doctorId": user.uid, "userId": user.uid,
            "name": profile.get("name", user.display_name or "Doctor"),
            "email": user.email or args.email,
            "specialization": args.specialization,
            "createdAt": profile.get("createdAt"),
        })
    elif args.role != "doctor":
        db.collection("doctors").document(user.uid).delete()
    print(f"Updated {args.email} to role={args.role}. Sign out and back in to refresh the app profile.")


if __name__ == "__main__":
    main()
