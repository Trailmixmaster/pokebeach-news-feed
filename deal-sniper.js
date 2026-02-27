import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const WORKER_URL = "https://lively-darkness-9d51tcgpulsemarket.tcgpulse.workers.dev/search";

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSniper() {
  console.log("🎯 Booting up the Midnight Sniper...");

  try {
    // 1. Roll the Roulette Wheel
    const randomStart = Math.floor(Math.random() * 8000) + 1;
    console.log(`🎲 Roulette landed on: ${randomStart}. Pulling heavy hitters...`);

    // 2. Fetch a MASSIVE batch of cards starting from that random number
    const snapshot = await db.collection("pokedex")
      .where("targetIndex", ">=", randomStart)
      .limit(3000) 
      .get();

    // 3. Filter for ONLY the absolute rarest, most desirable cards
    const highRarities = [
      "Special Illustration Rare", 
      "Secret Rare", 
      "Rare Secret", 
      "Rare Rainbow", 
      "Hyper Rare", 
      "Illustration Rare"
    ];
    
    let targetCards = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(card => highRarities.includes(card.rarity));

    // Shuffle and grab up to 100 to ensure maximum tier coverage
    targetCards = targetCards.sort(() => 0.5 - Math.random()).slice(0, 100); 
    console.log(`🔍 Locked onto ${targetCards.length} high-value targets. Scanning eBay...`);

    let bestDeals = {
      tier1: null, // $20 - $50
      tier2: null, // $50 - $100
      tier3: null  // $100+
    };

    // 4. The Hunt
    for (let i = 0; i < targetCards.length; i++) {
      const card = targetCards[i];
      const exactSearchTerm = `${card.name} ${card.localId} ${card.setName} pokemon card`;
      
      try {
        const response = await fetch(`${WORKER_URL}?q=${encodeURIComponent(exactSearchTerm)}`);
        const result = await response.json();

        if (result.status === "Success" && result.amv && result.amvConfidence === "PHASE_1_EXACT" && result.data?.itemSummaries) {
          const amv = parseFloat(result.amv);
          const cheapestListing = result.data.itemSummaries[0];
          const price = parseFloat(cheapestListing.price?.value || 0);

          if (price > 0) {
            const discountPercent = ((price - amv) / amv) * 100;

            const dealObj = {
              cardId: card.id,
              name: card.name,
              setName: card.setName,
              localId: card.localId,
              imageUrl: card.imageUrlHigh,
              amv: amv,
              price: price,
              discount: discountPercent,
              url: cheapestListing.itemAffiliateWebUrl || cheapestListing.itemWebUrl
            };

            // 🚀 UPGRADED: Accept ANY card priced below AMV, and let the math sort out the winner
            if (discountPercent < 0) {
              const isSteal = discountPercent <= -10;
              const badge = isSteal ? "🔥 STEAL " : "✅ DEAL  ";
              
              console.log(`   ${badge}: ${card.name} | AMV: $${amv.toFixed(2)} | Listed: $${price.toFixed(2)} (${discountPercent.toFixed(1)}%)`);

              // Compare against the current best deal in its tier and replace if this discount is deeper
              if (amv >= 20 && amv < 50) {
                if (!bestDeals.tier1 || discountPercent < bestDeals.tier1.discount) bestDeals.tier1 = dealObj;
              } else if (amv >= 50 && amv < 100) {
                if (!bestDeals.tier2 || discountPercent < bestDeals.tier2.discount) bestDeals.tier2 = dealObj;
              } else if (amv >= 100) {
                if (!bestDeals.tier3 || discountPercent < bestDeals.tier3.discount) bestDeals.tier3 = dealObj;
              }
            } else {
              console.log(`   ❌ Normal Price: ${card.name} | AMV: $${amv.toFixed(2)} | Listed: $${price.toFixed(2)}`);
            }
          }
        }
      } catch (error) {
         console.log(`   ⚠️ Failed to scan ${card.name}`);
      }

      // Breathe for 1 second
      await delay(1000);
    }

    // 5. Finalize and Save to Firebase
    console.log("\n==================================");
    console.log("🏆 DAILY DEALS SECURED");
    console.log("==================================");
    console.log(`Tier 1 ($20-$50): ${bestDeals.tier1 ? bestDeals.tier1.name + ' (-' + Math.abs(bestDeals.tier1.discount).toFixed(1) + '%)' : 'No deal found'}`);
    console.log(`Tier 2 ($50-$100): ${bestDeals.tier2 ? bestDeals.tier2.name + ' (-' + Math.abs(bestDeals.tier2.discount).toFixed(1) + '%)' : 'No deal found'}`);
    console.log(`Tier 3 ($100+): ${bestDeals.tier3 ? bestDeals.tier3.name + ' (-' + Math.abs(bestDeals.tier3.discount).toFixed(1) + '%)' : 'No deal found'}`);

    // Save the finalized payload to Firebase
    await db.collection("system_config").doc("daily_deals").set({
      ...bestDeals,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("\n✅ Payload successfully uploaded to Firebase. Frontend is ready to render.");

  } catch (error) {
    console.error("❌ Critical Sniper Failure:", error);
  }
}

runSniper();