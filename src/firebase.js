import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB1JGRn5RaGLxr3JNCfoF2MjqmW7X3Uflw',
  authDomain: 'pokemon-card-game-online-80212.firebaseapp.com',
  projectId: 'pokemon-card-game-online-80212',
  storageBucket: 'pokemon-card-game-online-80212.appspot.com',
  messagingSenderId: '386079812657',
  appId: '1:386079812657:web:08bd4ecd5948ce71e0b910',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const useEmulators = process.env.REACT_APP_USE_FIREBASE_EMULATORS === 'true';
let emulatorsConnected = false;

if (useEmulators && !emulatorsConnected) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  emulatorsConnected = true;
}

export { app, auth, db };
export default db;
