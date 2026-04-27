const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  // Check SOPLibrary for sopNo + expiryDate
  const libCount = await db.collection('soplibraries').countDocuments({ expiryDate: { $exists: true, $ne: null } });
  console.log(`SOPLibrary entries with expiryDate: ${libCount}`);

  const libSamples = await db.collection('soplibraries').find(
    { expiryDate: { $exists: true, $ne: null } },
    { projection: { sopIdentifier: 1, sopName: 1, expiryDate: 1 } }
  ).limit(10).toArray();
  
  console.log(`\nSOPLibrary samples with expiryDate:`);
  for (const s of libSamples) {
    console.log(`  ${s.sopIdentifier} | "${s.sopName}" | expiry: ${s.expiryDate}`);
  }

  // Check SOP for reviewDate (the actual field that has data)
  const sopReviewSamples = await db.collection('sops').find(
    { reviewDate: { $exists: true, $ne: null } },
    { projection: { identifier: 1, name: 1, reviewDate: 1 } }
  ).limit(15).toArray();
  
  console.log(`\nSOP samples with reviewDate (actual field with data):`);
  for (const s of sopReviewSamples) {
    console.log(`  ${s.identifier} | review: ${s.reviewDate}`);
  }

  // Check if QAGE01, QAGE02 etc have reviewDate
  const qaSOPs = await db.collection('sops').find(
    { identifier: { $regex: /^QAGE0[1-9]/ } },
    { projection: { identifier: 1, reviewDate: 1, expiryDate: 1, nextReviewDate: 1 } }
  ).toArray();

  console.log(`\nQAGE01-09 SOPs:`);
  for (const s of qaSOPs) {
    console.log(`  ${s.identifier} | review: ${s.reviewDate || 'NULL'} | expiry: ${s.expiryDate || 'NULL'} | nextReview: ${s.nextReviewDate || 'NULL'}`);
  }

  await client.close();
}

main().catch(console.error);
