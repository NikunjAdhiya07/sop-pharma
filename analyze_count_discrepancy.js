const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

function isStandardRegistrySopNumber(sopNo) {
  if (!sopNo) return false;
  const m = String(sopNo || '').trim().match(/^[A-Z]{1,6}(\d+)-(\d+)$/);
  return m && !(/^0+$/.test(m[1]));
}

function stripVersion(code) {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('=== ANALYZING COUNT DISCREPANCY ===\n');

  // Count by status (matching dashboard filter)
  const allStore = await db.collection('sops').find({
    department: { $regex: 'Store', $options: 'i' },
    isObsolete: { $ne: true }
  }).toArray();

  const completed = allStore.filter(s => s.status === 'completed' && isStandardRegistrySopNumber(s.identifier));
  const notCompleted = allStore.filter(s => s.status !== 'completed' && isStandardRegistrySopNumber(s.identifier));
  const allValid = allStore.filter(s => isStandardRegistrySopNumber(s.identifier));

  console.log(`📊 STORE SOP BREAKDOWN:\n`);
  console.log(`All valid (standard format), non-obsolete: ${allValid.length}`);
  console.log(`  - Status="completed": ${completed.length}`);
  console.log(`  - Other status: ${notCompleted.length}`);

  // Count unique families per status
  const completedFamilies = new Set();
  completed.forEach(s => completedFamilies.add(stripVersion(s.identifier)));

  const allFamilies = new Set();
  allValid.forEach(s => allFamilies.add(stripVersion(s.identifier)));

  console.log(`\nUnique SOP families:`);
  console.log(`  - All (regardless of status): ${allFamilies.size}`);
  console.log(`  - With status="completed": ${completedFamilies.size}`);

  // Find which families are NOT completed
  const missingFamilies = [];
  allFamilies.forEach(f => {
    if (!completedFamilies.has(f)) {
      const sops = allValid.filter(s => stripVersion(s.identifier) === f);
      const statuses = sops.map(s => `${s.identifier}(${s.status})`).join(', ');
      missingFamilies.push(`${f}: ${statuses}`);
    }
  });

  console.log(`\n❌ Families NOT showing (status ≠ "completed"):`);
  if (missingFamilies.length === 0) {
    console.log('  None found');
  } else {
    missingFamilies.forEach(m => console.log(`  ${m}`));
  }

  console.log(`\n📋 SUMMARY:`);
  console.log(`Dashboard count shows: 43`);
  console.log(`Registry display shows: 42`);
  console.log(`Actual completed families: ${completedFamilies.size}`);
  console.log(`\nExpected registry display: ${completedFamilies.size} families`);
  if (completedFamilies.size === 42) {
    console.log(`✓ Count is correct (42 completed families are displayed)\n`);
    console.log(`Missing from count of 43 to 42:`);
    missingFamilies.forEach(m => console.log(`  ${m}`));
  }

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
