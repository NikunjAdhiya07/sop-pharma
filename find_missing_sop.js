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

  console.log('=== FINDING MISSING STORE SOP ===\n');

  // Get all Store SOPs  
  const allStoreSops = await db.collection('sops').find({
    department: { $regex: 'Store', $options: 'i' }
  }).toArray();
  
  // Count by obsolete status
  const nonObsolete = allStoreSops.filter(s => !s.isObsolete);
  const obsolete = allStoreSops.filter(s => s.isObsolete);
  
  const validNonObsolete = nonObsolete.filter(s => isStandardRegistrySopNumber(s.identifier));
  
  // Extract families
  const families = new Map();
  validNonObsolete.forEach(s => {
    const base = s.identifier.toUpperCase().replace(/-\d+$/, '');
    if (!families.has(base)) {
      families.set(base, []);
    }
    families.get(base).push(s.identifier);
  });
  
  console.log(`Valid non-obsolete Store SOPs: ${validNonObsolete.length}`);
  console.log(`Unique SOP families: ${families.size}`);
  console.log('\nFamilies with multiple versions:');
  Array.from(families.entries()).forEach(([family, versions]) => {
    if (versions.length > 1) {
      console.log(`  ${family}: ${versions.join(', ')}`);
    }
  });

  console.log('\nObsolete Store SOPs:');
  obsolete.forEach(s => {
    console.log(`  ${s.identifier} (obsoleteReason: ${s.obsoleteReason || 'not specified'})`);
  });

  // Check for STOP03 (which we saw as obsolete earlier)
  console.log('\n=== STOP03 Analysis ===');
  const stop03Records = await db.collection('sops').find({
    identifier: { $regex: '^STOP03', $options: 'i' }
  }).toArray();
  
  console.log(`STOP03 records found: ${stop03Records.length}`);
  stop03Records.forEach(s => {
    console.log(`  ${s.identifier}: isObsolete=${s.isObsolete}, department=${s.department}`);
  });

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
