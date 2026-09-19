// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA3Hj7gT_bl8jb-vNlDrqUf4E8TVLj3IsU",
  authDomain: "health-care-system-c84b3.firebaseapp.com",
  projectId: "health-care-system-c84b3",
  storageBucket: "health-care-system-c84b3.firebasestorage.app",
  messagingSenderId: "40472593288",
  appId: "1:40472593288:web:a1b0d6cebee50a29a3b03d",
  measurementId: "G-SX5Q44XZB5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);