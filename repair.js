import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const DIGITAL_POCKET_SETS = ['a1', 'a1a', 'a2', 'a2a', 'p-a', 'p-a1'];

async function repairDirectory() {
  console.log("🛠️ Waking up the Directory Repair Tool...");
  
  try {
    const response = await fetch("https://api.tcgdex.net/v2/en/sets");
    const allSets = await response.json();
    
    // Filter out the mobile game sets right out of the gate
    const physicalSets = allSets.filter(set => !DIGITAL_POCKET_SETS.includes(set.id.toLowerCase()));

    let addedCount = 0;
    console.log(`\n🔍 Cross-referencing your Firebase inventory with the global database...\n`);

    for (const set of physicalSets) {
      // Check if your Pokedex collection contains at least 1 card from this set
      const snapshot = await db.collection("pokedex").where("setId", "==", set.id).limit(1).get();
      
      if (!snapshot.empty) {
        console.log(`✅ Inventory found for [${set.name}]. Linking to active_sets...`);
        await db.collection("active_sets").doc(set.id).set({
          id: set.id,
          name: set.name
        });
        addedCount++;
      }
    }

    console.log(`\n🎉 Repair Complete! Successfully linked ${addedCount} major expansions to your dropdown menu.`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

repairDirectory().catch(console.error);