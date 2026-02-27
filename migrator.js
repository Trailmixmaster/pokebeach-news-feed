/**
 * TCG PULSE - IMAGE MIGRATION ENGINE (CDN)
 * Downloads images from TCGdex and permanently hosts them on your Firebase Storage Bucket.
 */

import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin with BOTH Database and Storage Access
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // This is the specific bucket for your project
  storageBucket: "poketcghub-9f9a5.firebasestorage.app"
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function migrateImages() {
  console.log("🚀 Waking up TCG Pulse Image Migration Engine...");

  try {
    // 1. Get all cards from your database
    console.log("🔍 Scanning Firebase for unhosted images...");
    const snapshot = await db.collection("pokedex").get();
    
    // 2. Filter out cards that we've already migrated (in case the script crashes and we restart)
    const cardsToMigrate = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.imageUrlHigh && data.imageUrlHigh.includes("tcgdex.net");
    });

    console.log(`Found ${cardsToMigrate.length} cards that need their images migrated.\n`);

    if (cardsToMigrate.length === 0) {
      console.log("🎉 All images are already hosted on your Firebase CDN!");
      return;
    }

    let count = 1;
    const total = cardsToMigrate.length;

    // 3. Process them one by one
    for (const doc of cardsToMigrate) {
      const card = doc.data();
      const docId = doc.id;
      const tcgdexUrl = card.imageUrlHigh;

      console.log(`[${count}/${total}] Migrating: ${card.name} (${card.setId})...`);

      try {
        // A. Download the image file from TCGdex into our server's temporary memory
        const response = await fetch(tcgdexUrl);
        if (!response.ok) throw new Error(`Failed to download image from TCGdex: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // B. Define where it will live in your Firebase Storage Bucket
        // e.g., cards/sv04.5/charizard-ex-234.png
        const filePath = `cards/${card.setId}/${docId}.png`;
        const file = bucket.file(filePath);

        // C. Upload it to Firebase Storage
        await file.save(buffer, {
          metadata: { contentType: 'image/png' },
          public: true // Required so the URL works on the website
        });

        // D. Generate the permanent, lightning-fast public URL
        const firebasePublicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;

        // E. Update your Firestore database to use the new URL
        await db.collection("pokedex").doc(docId).update({
          imageUrlHigh: firebasePublicUrl,
          imageHostedLocally: true,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`   ✅ Success! Now hosted on Firebase.`);

        // F. Pause for half a second so we don't accidentally DDOS TCGdex's free servers
        await delay(500);

      } catch (error) {
        console.error(`   ❌ Failed to migrate ${card.name}:`, error.message);
      }
      
      count++;
    }

    console.log("\n🎉 Image Migration Complete! Your database is now blazing fast.");

  } catch (error) {
    console.error("❌ Fatal Error:", error.message);
  }
}

migrateImages().catch(console.error);