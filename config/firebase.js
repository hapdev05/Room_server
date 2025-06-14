const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth } = require('firebase/auth');

// Import service account key
const serviceAccount = require('./room-online-d9d28-firebase-adminsdk-fbsvc-3037e53e37.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "room-online-d9d28",
  databaseURL: "https://room-online-d9d28-default-rtdb.asia-southeast1.firebasedatabase.app"
});

// Firebase Client SDK configuration
const firebaseConfig = {
  apiKey: "AIzaSyBqKr1cZgBHHvEQXgaJGZdJLXjqPmjKPqY",
  authDomain: "room-online-d9d28.firebaseapp.com",
  databaseURL: "https://room-online-d9d28-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "room-online-d9d28",
  storageBucket: "room-online-d9d28.firebasestorage.app",
  messagingSenderId: "491140370967",
  appId: "1:491140370967:web:a0b6b4c0d4e4f4g4h4i4j4"
};

// Initialize Firebase Client
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

module.exports = {
  admin,
  auth,
  firebaseApp
}; 