import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
} from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { initApp } from "./app.js";

const firebaseConfig = {
  apiKey: "AIzaSyCb4S4wKomomR3aq03WNm5OJ2_OD_iud8M",
  authDomain: "weightrack72.firebaseapp.com",
  projectId: "weightrack72",
  storageBucket: "weightrack72.firebasestorage.app",
  messagingSenderId: "526952934311",
  appId: "1:526952934311:web:3d5edae067f08873e06482",
  measurementId: "G-W9DDPG50LQ",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const authCard = document.getElementById("auth-card");
const appSection = document.getElementById("app-section");
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const formLogin = document.getElementById("form-login");
const formSignup = document.getElementById("form-signup");
const authMessage = document.getElementById("auth-message");
const btnLogout = document.getElementById("btn-logout");

function getFriendlyErrorMessage(errorCode) {
  switch (errorCode) {
    case "auth/email-already-in-use":
      return "This email is already registered. Please log in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password should be at least 6 characters long.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password. Please try again.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
}

function showMessage(text, type = "success") {
  if (!authMessage) return;
  authMessage.textContent = text;
  authMessage.className = `auth-message ${type}`;
}

function clearMessage() {
  if (!authMessage) return;
  authMessage.textContent = "";
  authMessage.className = "auth-message hidden";
}

// Auth State Observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (authCard) authCard.classList.add("hidden");
    if (appSection) appSection.classList.remove("hidden");
    initApp(app, user);
  } else {
    if (authCard) authCard.classList.remove("hidden");
    if (appSection) appSection.classList.add("hidden");
  }
});

// Tab Toggle Logic
if (tabLogin) {
  tabLogin.addEventListener("click", () => {
    clearMessage();
    tabLogin.classList.add("active");
    if (tabSignup) tabSignup.classList.remove("active");
    if (formLogin) formLogin.classList.remove("hidden");
    if (formSignup) formSignup.classList.add("hidden");
  });
}

if (tabSignup) {
  tabSignup.addEventListener("click", () => {
    clearMessage();
    tabSignup.classList.add("active");
    if (tabLogin) tabLogin.classList.remove("active");
    if (formSignup) formSignup.classList.remove("hidden");
    if (formLogin) formLogin.classList.add("hidden");
  });
}

// Log In Handler
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showMessage(getFriendlyErrorMessage(error.code), "error");
    }
  });
}

// Sign Up Handler
if (formSignup) {
  formSignup.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();

    const firstName = document.getElementById("signup-firstname").value;
    const lastName = document.getElementById("signup-lastname").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    const dob = document.getElementById("signup-dob").value;
    const targetWeight = document.getElementById("signup-target-weight").value;

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        firstName,
        lastName,
        email,
        dob,
        targetWeight: parseFloat(targetWeight),
        createdAt: new Date(),
      });
    } catch (error) {
      showMessage(getFriendlyErrorMessage(error.code), "error");
    }
  });
}

// Logout Handler
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    signOut(auth);
  });
}
