import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';

let authReadyPromise = null;
let signInPromise = null;

export function waitForAuthReady() {
  if (authReadyPromise) {
    return authReadyPromise;
  }

  authReadyPromise = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve(auth.currentUser || null);
    });
  });

  return authReadyPromise;
}

export async function ensureSignedIn() {
  await waitForAuthReady();
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .finally(() => {
        signInPromise = null;
      });
  }

  return signInPromise;
}

export function getCurrentUid() {
  return auth.currentUser?.uid || null;
}
