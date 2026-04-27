const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('Searching for QAGE100 in database...');

  // 1. Search in sops collection
  const sops = await db.collection('sops').find({
    identifier: { $regex: /QAGE100/i }
  }).toArray();

  console.log(`\nFound ${sops.length} matching SOPs in 'sops' collection:`);
  for (const s of sops) {
    console.log(`  ID: ${s.identifier}`);
    console.log(`  Name: ${s.name}`);
    console.log(`  reviewDate: ${s.reviewDate || 'NULL'}`);
    console.log(`  expiryDate: ${s.expiryDate || 'NULL'}`);
    console.log(`  nextReviewDate: ${s.nextReviewDate || 'NULL'}`);
    console.log('---');
  }

  // 2. Search in soplibraries collection
  const libs = await db.collection('soplibraries').find({
    sopIdentifier: { $regex: /QAGE100/i }
  }).toArray();

  console.log(`\nFound ${libs.length} matching entries in 'soplibraries' collection:`);
  for (const l of libs) {
    console.log(`  sopIdentifier: ${l.sopIdentifier}`);
    console.log(`  sopName: ${l.sopName}`);
    console.log(`  expiryDate: ${l.expiryDate || 'NULL'}`);
    console.log(`  lastReviewDate: ${l.lastReviewDate || 'NULL'}`);
    console.log('---');
  }

  await client.close();
}

main().catch(console.error);
