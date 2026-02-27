import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runPatch() {
  console.log("🎰 Booting up the Roulette Wheel Patch...");

  try {
    const pokedexRef = db.collection('pokedex');
    const snapshot = await pokedexRef.get();

    if (snapshot.empty) {
      console.log("No cards found in the database.");
      return;
    }

    console.log(`Found ${snapshot.size} cards. Assigning random target indexes...`);

    let batch = db.batch();
    let operationCount = 0;
    let totalProcessed = 0;

    for (const doc of snapshot.docs) {
      const cardRef = pokedexRef.doc(doc.id);
      
      // Generate a random number between 1 and 10,000
      const randomTargetIndex = Math.floor(Math.random() * 10000) + 1;

      batch.update(cardRef, { targetIndex: randomTargetIndex });
      operationCount++;
      totalProcessed++;

      // Firebase batches have a hard limit of 500 operations
      if (operationCount === 490) {
        await batch.commit();
        console.log(`✅ Processed ${totalProcessed} cards...`);
        batch = db.batch(); // Start a new batch
        operationCount = 0;
        await delay(300); // Breathe to respect Firebase rate limits
      }
    }

    // Commit any remaining updates in the final batch
    if (operationCount > 0) {
      await batch.commit();
      console.log(`✅ Processed ${totalProcessed} cards...`);
    }

    console.log("🎉 Database patching complete! All cards are now ready for the Autonomous Market Engine.");
  } catch (error) {
    console.error("❌ Error patching database:", error);
  }
}

runPatch();