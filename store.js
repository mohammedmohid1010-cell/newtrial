import { config } from "./config.js";

/*
  Trial request log. Persists to Firestore when a service account is provided,
  otherwise falls back to an in-memory array (cleared on restart). The admin
  dashboard reads through getTrials().
*/

let db = null;
const memory = []; // newest first

async function initFirestore() {
  if (!config.firebaseServiceAccount) return null;
  try {
    const admin = (await import("firebase-admin")).default;
    if (!admin.apps.length) {
      const creds = JSON.parse(config.firebaseServiceAccount);
      admin.initializeApp({ credential: admin.credential.cert(creds) });
    }
    console.log("[store] Firestore persistence enabled.");
    return admin.firestore();
  } catch (err) {
    console.error("[store] Firestore init failed, using in-memory store:", err.message);
    return null;
  }
}

export async function initStore() {
  db = await initFirestore();
}

/** Record a trial attempt. Returns the stored record. */
export async function saveTrial(record) {
  const entry = {
    name: record.name || "",
    email: record.email || "",
    device: record.device || "",
    status: record.status, // "success" | "failed"
    username: record.username || "",
    error: record.error || "",
    ip: record.ip || "",
    createdAt: new Date().toISOString(),
  };

  if (db) {
    try {
      const ref = await db.collection("trialRequests").add(entry);
      return { id: ref.id, ...entry };
    } catch (err) {
      console.error("[store] Firestore write failed:", err.message);
    }
  }
  const withId = { id: `mem_${Date.now()}`, ...entry };
  memory.unshift(withId);
  return withId;
}

/** Return all trial records, newest first. */
export async function getTrials() {
  if (db) {
    try {
      const snap = await db
        .collection("trialRequests")
        .orderBy("createdAt", "desc")
        .limit(500)
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error("[store] Firestore read failed:", err.message);
    }
  }
  return memory;
}
