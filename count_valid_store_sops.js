const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

function isStandardRegistrySopNumber(sopNo) {
  if (!sopNo) return false;
  const m = String(sopNo || '').trim().match(/^[A-Z]{1,6}(\d+)-(\d+)$/);
  if (!m) return false;
  const docNum = m[1];
  return !(/^0+$/.test(docNum));
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('=== VALID STORE SOP COUNT ===\n');

  const allStoreSops = await db.collection('sops').find({
    department: { $regex: 'Store', $options: 'i' },
    isObsolete: { $ne: true }
  }).toArray();
  
  const validSops = allStoreSops.filter(s => isStandardRegistrySopNumber(s.identifier));
  const invalidSops = allStoreSops.filter(s => !isStandardRegistrySopNumber(s.identifier));

  console.log(`Total Store SOPs (non-obsolete): ${allStoreSops.length}`);
  console.log(`Valid SOP identifiers: ${validSops.length}`);
  console.log(`Invalid SOP identifiers: ${invalidSops.length}`);
  
  console.log('\n✓ VALID SOPs:');
  validSops.map(s => s.identifier).sort().forEach(id => console.log(`  ${id}`));
  
  console.log('\n⚠️  INVALID SOPs (should be removed or fixed):');
  invalidSops.map(s => s.identifier).forEach(id => console.log(`  ${id}`));

  // Count unique SOP families (SOPCODE without revision)
  const families = new Set();
  validSops.forEach(s => {
    const base = s.identifier.toUpperCase().replace(/-\d+$/, '');
    families.add(base);
  });
  
  console.log(`\n✓ Unique SOP families: ${families.size}`);
  console.log('SOP families:');
  Array.from(families).sort().forEach(f => console.log(`  ${f}`));

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
