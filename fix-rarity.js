import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// A small delay function to prevent us from getting blocked
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fixRarities() {
  console.log("🔍 Scanning Firebase for missing rarities...");
  
  const snapshot = await db.collection("pokedex").where("rarity", "==", "Unknown").get();
  
  if (snapshot.empty) {
    console.log("✅ No 'Unknown' rarities found!");
    return;
  }

  console.log(`🚨 Found ${snapshot.size} cards with 'Unknown' rarity. Starting API sync...`);
  
  let count = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // 🚀 THE FIX: Reconstruct the correct TCGdex API ID
    const properApiId = `${data.setId}-${data.localId}`;
    
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${properApiId}`);
      if (!res.ok) throw new Error("API Error");
      
      const apiData = await res.json();
      const actualRarity = apiData.rarity || "Promo"; 
      
      batch.update(doc.ref, { rarity: actualRarity });
      count++;
      batchCount++;

      if (batchCount === 100) {
        await batch.commit();
        console.log(`💾 Saved 100 updates... (${count}/${snapshot.size})`);
        batch = db.batch();
        batchCount = 0;
      }
      
      await sleep(50); 
      
    } catch (error) {
      // If it fails, log both so we can see what happened
      console.log(`⚠️ Failed to fetch rarity for ${properApiId} (Firebase ID: ${doc.id})`);
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`\n🎉 Rarity Patch Complete! Successfully updated ${count} cards.`);
}

fixRarities().catch(console.error);