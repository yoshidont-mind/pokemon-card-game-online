// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB1JGRn5RaGLxr3JNCfoF2MjqmW7X3Uflw",
    authDomain: "pokemon-card-game-online-80212.firebaseapp.com",
    projectId: "pokemon-card-game-online-80212",
    storageBucket: "pokemon-card-game-online-80212.appspot.com",
    messagingSenderId: "386079812657",
    appId: "1:386079812657:web:08bd4ecd5948ce71e0b910"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default db;