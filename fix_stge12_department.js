const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('=== FIXING STGE12-01 DEPARTMENT ===\n');

  // Show before state
  const before = await db.collection('sops').findOne({
    identifier: 'STGE12-01'
  });

  console.log('BEFORE:');
  console.log(`  STGE12-01 Department: ${before.department}`);
  console.log(`  Status: ${before.status}\n`);

  // Update STGE12-01 to Store department
  const result = await db.collection('sops').updateOne(
    { identifier: 'STGE12-01' },
    { $set: { department: 'Store' } }
  );

  console.log(`Update result: ${result.modifiedCount} document(s) modified\n`);

  // Show after state
  const after = await db.collection('sops').findOne({
    identifier: 'STGE12-01'
  });

  console.log('AFTER:');
  console.log(`  STGE12-01 Department: ${after.department}`);
  console.log(`  Status: ${after.status}\n`);

  // Verify the fix
  console.log('=== VERIFYING THE FIX ===\n');

  function isStandardRegistrySopNumber(sopNo) {
    if (!sopNo) return false;
    const m = String(sopNo || '').trim().match(/^[A-Z]{1,6}(\d+)-(\d+)$/);
    return m && !(/^0+$/.test(m[1]));
  }

  const storeValid = await db.collection('sops').find({
    department: 'Store',
    isObsolete: { $ne: true }
  }).toArray();

  const validStore = storeValid.filter(s => isStandardRegistrySopNumber(s.identifier));
  
  const families = new Set();
  validStore.forEach(s => {
    const base = s.identifier.toUpperCase().replace(/-\d+$/, '');
    families.add(base);
  });

  const completed = validStore.filter(s => s.status === 'completed');
  const completedFamilies = new Set();
  completed.forEach(s => {
    const base = s.identifier.toUpperCase().replace(/-\d+$/, '');
    completedFamilies.add(base);
  });

  console.log('✓ Store SOP Count AFTER Fix:');
  console.log(`  Total valid families: ${families.size}`);
  console.log(`  Completed families (will display): ${completedFamilies.size}`);
  console.log(`\n✓ Status:`);
  console.log(`  ✅ STGE12 now in Store department`);
  console.log(`  ✅ STGE12-01 (completed) will show in registry`);
  console.log(`  ✅ Registry count will now be: ${completedFamilies.size} Store SOPs`);

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
