const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('=== STORE SOP DIAGNOSTIC ===\n');

  // Count all Store SOPs (not obsolete)
  const allStoreSops = await db.collection('sops').find({
    department: { $regex: 'Store', $options: 'i' },
    isObsolete: { $ne: true }
  }).toArray();
  
  console.log(`Total Store SOPs (non-obsolete): ${allStoreSops.length}`);
  console.log('SOPs by identifier:');
  const identifiers = allStoreSops.map(s => s.identifier).sort();
  identifiers.forEach(id => console.log(`  - ${id}`));

  // Check for duplicates
  const idCounts = new Map();
  identifiers.forEach(id => {
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  });
  const dups = Array.from(idCounts.entries()).filter(([, count]) => count > 1);
  if (dups.length > 0) {
    console.log('\n⚠️  DUPLICATE IDENTIFIERS FOUND:');
    dups.forEach(([id, count]) => console.log(`  - ${id}: ${count} times`));
  } else {
    console.log('\n✓ No duplicate identifiers');
  }

  // Check if any are marked obsolete
  const obsoleteStoreSops = await db.collection('sops').find({
    department: { $regex: 'Store', $options: 'i' },
    isObsolete: true
  }).toArray();
  
  if (obsoleteStoreSops.length > 0) {
    console.log(`\nObsolete Store SOPs: ${obsoleteStoreSops.length}`);
    obsoleteStoreSops.forEach(s => console.log(`  - ${s.identifier}`));
  }

  // Check for any Store entries in the training matrix upload
  const uploads = await db.collection('trainingmatricesupload').find({
    department: 'Store',
    fileType: 'main'
  }).sort({ uploadedAt: -1 }).toArray();

  if (uploads.length > 0) {
    const latestUpload = uploads[0];
    console.log(`\nLatest Store Training Matrix Upload: ${latestUpload.uploadedAt}`);
    console.log(`Snapshot SOP Count: ${latestUpload.snapshot?.sopCodes?.length || 0}`);
    console.log(`Snapshot SOPs:`);
    (latestUpload.snapshot?.sopCodes || [])
      .map(c => c.toUpperCase().replace(/-\d+$/, '').trim())
      .filter((v, i, a) => a.indexOf(v) === i)  // unique
      .sort()
      .forEach(code => console.log(`  - ${code}`));
  }

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
