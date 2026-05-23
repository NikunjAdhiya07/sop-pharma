const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

function isStandardRegistrySopNumber(sopNo) {
  if (!sopNo) return false;
  const m = String(sopNo || '').trim().match(/^[A-Z]{1,6}(\d+)-(\d+)$/);
  return m && !(/^0+$/.test(m[1]));
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('=== ALL NON-COMPLETED STORE SOPs ===\n');

  const nonCompleted = await db.collection('sops').find({
    department: { $regex: 'Store', $options: 'i' },
    isObsolete: { $ne: true },
    status: { $ne: 'completed' }
  }).toArray();

  const valid = nonCompleted.filter(s => isStandardRegistrySopNumber(s.identifier));

  console.log(`Found ${valid.length} non-completed Store SOPs:\n`);
  valid.forEach((s, i) => {
    console.log(`${i+1}. ${s.identifier}`);
    console.log(`   Status: ${s.status}`);
    console.log(`   Name: ${s.name.substring(0, 80)}`);
    console.log(`   Uploaded: ${s.uploadedAt}`);
    console.log();
  });

  console.log('\n💡 THESE ARE THE MISSING SOPs FROM THE REGISTRY:\n');
  console.log('To fix the count from 43 → 42 (or make registry show all 43):');
  console.log('Option 1: Mark these as completed');
  valid.forEach(s => {
    console.log(`  - Update ${s.identifier}: status → "completed"`);
  });
  console.log('\nOption 2: Verify if these should be in the registry at all');

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
