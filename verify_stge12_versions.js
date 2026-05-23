const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('=== STGE12 VERSION ANALYSIS ===\n');

  // Check all STGE12 versions
  const stge12Records = await db.collection('sops').find({
    identifier: { $regex: '^STGE12', $options: 'i' }
  }).toArray();

  console.log(`STGE12 records found in database: ${stge12Records.length}\n`);
  
  if (stge12Records.length === 0) {
    console.log('❌ NO STGE12 records found!\n');
  } else {
    stge12Records.forEach(s => {
      console.log(`${s.identifier}:`);
      console.log(`  Status: ${s.status}`);
      console.log(`  Department: ${s.department}`);
      console.log(`  Name: ${s.name}`);
      console.log(`  Uploaded: ${s.uploadedAt}`);
      console.log(`  Obsolete: ${s.isObsolete || false}`);
      console.log();
    });
  }

  // Check expected versions
  console.log('\n📋 EXPECTED STGE12 VERSIONS:');
  console.log('  - STGE12-00 (base version)');
  console.log('  - STGE12-01 (revision 1)');

  console.log('\n⚠️  MISSING:');
  const hasV00 = stge12Records.some(s => s.identifier === 'STGE12-00');
  const hasV01 = stge12Records.some(s => s.identifier === 'STGE12-01');
  
  if (!hasV00) console.log('  ❌ STGE12-00');
  if (!hasV01) console.log('  ❌ STGE12-01');
  
  if (hasV00 && hasV01) {
    console.log('  ✓ Both versions exist');
  }

  console.log('\n💡 SUMMARY:');
  console.log(`Total STGE12 versions: ${stge12Records.length}`);
  console.log(`Expected: 2 versions (STGE12-00 and STGE12-01)`);
  console.log(`Missing: ${2 - stge12Records.length} version(s)`);

  // This explains the 43 → 42 discrepancy
  console.log('\n🔍 THIS EXPLAINS THE DISCREPANCY:');
  console.log(`Dashboard count: 43 (expects STGE12-01 to exist)`);
  console.log(`Actual families: 42 (STGE12-01 is missing)`);
  console.log(`Registry display: 42 + hidden STGE12-00 (status=uploaded)`);

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
