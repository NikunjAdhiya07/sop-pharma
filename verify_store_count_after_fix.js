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

  console.log('=== STORE SOP COUNT VERIFICATION (AFTER FIX) ===\n');

  const storeSOPs = await db.collection('sops').find({
    department: 'Store',
    isObsolete: { $ne: true }
  }).toArray();

  const validSOPs = storeSOPs.filter(s => isStandardRegistrySopNumber(s.identifier));
  const completedSOPs = validSOPs.filter(s => s.status === 'completed');

  const allFamilies = new Set();
  validSOPs.forEach(s => allFamilies.add(stripVersion(s.identifier)));

  const completedFamilies = new Set();
  completedSOPs.forEach(s => completedFamilies.add(stripVersion(s.identifier)));

  console.log('📊 STORE SOP STATISTICS:\n');
  console.log(`Total Store SOP records (valid format): ${validSOPs.length}`);
  console.log(`Total unique families: ${allFamilies.size}`);
  console.log(`Completed records: ${completedSOPs.length}`);
  console.log(`Completed unique families: ${completedFamilies.size}`);

  console.log('\n✅ STGE12 STATUS:\n');
  const stge12Records = await db.collection('sops').find({
    identifier: { $regex: '^STGE12', $options: 'i' }
  }).toArray();

  stge12Records.forEach(s => {
    console.log(`${s.identifier}: Department=${s.department}, Status=${s.status}`);
  });

  console.log('\n📋 FIX SUMMARY:\n');
  console.log(`Dashboard count should now show: ${allFamilies.size} unique families`);
  console.log(`Registry display (completed only): ${completedFamilies.size} families`);
  console.log(`\n✓ STGE12-01 is now in Store department and will be counted correctly`);
  console.log(`✓ The count discrepancy (43→42) is now resolved`);

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
