import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 🚀 REMOVED the DIGITAL_POCKET_SETS exclusion list!

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkIfSetExists(setId) {
  const snapshot = await db.collection("pokedex").where("setId", "==", setId).limit(1).get();
  return !snapshot.empty;
}

async function seedDatabase() {
  console.log("🚀 Waking up TCG Pulse Master Archive Engine...");
  try {
    const setsResponse = await fetch("https://api.tcgdex.net/v2/en/sets");
    let allSets = await setsResponse.json();
    
    // 🚀 We now process ALL sets from the API, no exclusions.
    const setsToProcess = allSets.reverse(); 
    
    const setsToDownload = [];
    for (const set of setsToProcess) {
      const alreadyExists = await checkIfSetExists(set.id);
      if (!alreadyExists) setsToDownload.push(set);
    }

    if (setsToDownload.length === 0) {
      console.log("🎉 Database is already 100% historically complete!");
      return;
    }

    console.log(`\n📥 Downloading ${setsToDownload.length} missing expansions (including TCG Pocket!)...`);

    for (let i = 0; i < setsToDownload.length; i++) {
      const targetSet = setsToDownload[i];
      console.log(`\n📦 [${i + 1}/${setsToDownload.length}] Fetching: ${targetSet.name}...`);
      
      try {
        const response = await fetch(`https://api.tcgdex.net/v2/en/sets/${targetSet.id}`);
        const setData = await response.json();
        if (!setData.cards) continue;

        let batch = db.batch();
        let operationCount = 0;

        for (const card of setData.cards) {
          if (!card.image) continue;
          
          const cleanName = card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const docId = `${cleanName}-${targetSet.id}-${card.localId}`;
          const cardRef = db.collection("pokedex").doc(docId);

          // 🚀 ADDED: Automatically build the search array for the "Contains" text search
          const searchWords = card.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);

          batch.set(cardRef, {
            id: card.id,
            name: card.name,
            localId: card.localId,
            setId: targetSet.id,
            setName: setData.name,
            rarity: card.rarity || "Unknown",
            searchTerms: searchWords, // Saved directly to the DB!
            targetIndex: Math.floor(Math.random() * 10000) + 1, // 🚀 NEW: The Roulette Wheel Index
            imageUrlHigh: `${card.image}/high.png`,
            imageUrlLow: `${card.image}/low.png`,
            slug: docId, 
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          });

          operationCount++;
          if (operationCount === 490) {
            await batch.commit();
            batch = db.batch();
            operationCount = 0;
            await delay(500); 
          }
        }
        
        if (operationCount > 0) await batch.commit();

        console.log(`✅ Cards saved. Adding ${setData.name} to active_sets directory...`);
        await db.collection("active_sets").doc(targetSet.id).set({
          id: targetSet.id,
          name: setData.name
        });

        await delay(1500); 
        
      } catch (error) {
        console.error(`❌ Error processing set ${targetSet.name}:`, error.message);
      }
    }
    console.log("\n🎉 Master Archive Sync Complete!");
  } catch (error) {
    console.error("❌ Fatal Error:", error.message);
  }
}

seedDatabase().catch(console.error);