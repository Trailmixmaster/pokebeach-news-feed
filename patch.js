import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function patchSearchTerms() {
  console.log("🛠️ Waking up the Database Patcher...");
  let patchedCount = 0;
  let lastDoc = null;
  let hasMore = true;

  while (hasMore) {
    let q = db.collection("pokedex").limit(500);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snapshot = await q.get();
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    let batch = db.batch();
    snapshot.forEach(doc => {
      const data = doc.data();
      // Only patch if they don't already have the search array
      if (data.name && !data.searchTerms) {
        // Break name into lowercase array: "Mega Charizard EX" -> ["mega", "charizard", "ex"]
        const words = data.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);
        batch.update(doc.ref, { searchTerms: words });
        patchedCount++;
      }
    });

    await batch.commit();
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    console.log(`✅ Patched ${patchedCount} cards so far...`);
  }

  console.log(`\n🎉 Patch Complete! Your database is now ready for "Contains" searching.`);
}

patchSearchTerms().catch(console.error);