// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyD0hBWo7aPiE1mo8De-EBJ5tjpE3UdUvFY",
    authDomain: "procurewise-9e599.firebaseapp.com",
    databaseURL: "https://procurewise-9e599-default-rtdb.firebaseio.com",
    projectId: "procurewise-9e599",
    storageBucket: "procurewise-9e599.firebasestorage.app",
    messagingSenderId: "153747280861",
    appId: "1:153747280861:web:a22c17181063ae152c5c34",
    measurementId: "G-E7PTNF6H1J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getDatabase(app);
