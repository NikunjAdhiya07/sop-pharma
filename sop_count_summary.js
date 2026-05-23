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

  console.log('=== STORE SOP COUNT VERIFICATION ===\n');

  const allStoreSops = await db.collection('sops').find({
    department: { $regex: 'Store', $options: 'i' }
  }).toArray();
  
  const nonObsolete = allStoreSops.filter(s => !s.isObsolete);
  const validNonObsolete = nonObsolete.filter(s => isStandardRegistrySopNumber(s.identifier));
  
  const families = new Set();
  validNonObsolete.forEach(s => {
    const base = s.identifier.toUpperCase().replace(/-\d+$/, '');
    families.add(base);
  });
  
  const multiVersionFamilies = new Set();
  validNonObsolete.forEach(s => {
    const base = s.identifier.toUpperCase().replace(/-\d+$/, '');
    const count = validNonObsolete.filter(x => x.identifier.toUpperCase().replace(/-\d+$/, '') === base).length;
    if (count > 1) multiVersionFamilies.add(base);
  });

  console.log('📊 SOP COUNT BREAKDOWN:\n');
  console.log(`Total SOP records in Store collection: ${allStoreSops.length}`);
  console.log(`  - Non-obsolete: ${nonObsolete.length}`);
  console.log(`  - Obsolete: ${allStoreSops.length - nonObsolete.length}`);
  console.log(`\nValid (standard SOP format) Non-obsolete: ${validNonObsolete.length}`);
  console.log(`Invalid (malformed identifiers) Non-obsolete: ${nonObsolete.length - validNonObsolete.length}`);
  
  console.log(`\n✓ CORRECT COUNT (Unique SOP Families):`);
  console.log(`  ${families.size} unique families`);
  console.log(`  (STGE13 has 2 versions but counts as 1 family)`);
  
  console.log(`\n❌ INCORRECT COUNT (Records instead of Families):`);
  console.log(`  ${validNonObsolete.length} records`);
  console.log(`  (This counts each version separately)`);

  console.log(`\n📋 Families with Multiple Versions:`);
  Array.from(multiVersionFamilies).sort().forEach(family => {
    const records = validNonObsolete.filter(s => s.identifier.toUpperCase().replace(/-\d+$/, '') === family);
    console.log(`  ${family}: ${records.map(r => r.identifier).join(', ')}`);
  });

  console.log('\n⚠️  ISSUE IDENTIFIED:');
  console.log(`Dashboard shows: 43 SOPs`);
  console.log(`Actual unique families: ${families.size}`);
  console.log(`Difference: ${validNonObsolete.length - families.size} (likely from STGE13 having 2 versions)`);

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
