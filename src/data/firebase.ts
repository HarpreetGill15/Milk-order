import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

// Offline persistence: counts entered in the cooler with no signal are queued on the phone and
// sync automatically when it reconnects.
export const db: Firestore | undefined = firebaseConfigured
  ? (() => {
      const app = initializeApp(firebaseConfig)
      try {
        return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
      } catch {
        return initializeFirestore(app, {})
      }
    })()
  : undefined
