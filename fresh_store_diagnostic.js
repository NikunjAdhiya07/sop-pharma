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

  console.log('=== FRESH STORE SOP DIAGNOSTIC ===\n');

  // Use exact match for Store
  const allStore = await db.collection('sops').find({
    department: { $eq: 'Store' }
  }).toArray();

  console.log(`Total records with department="Store" (exact): ${allStore.length}\n`);

  const nonObsolete = allStore.filter(s => !s.isObsolete);
  console.log(`Non-obsolete: ${nonObsolete.length}`);

  const valid = nonObsolete.filter(s => isStandardRegistrySopNumber(s.identifier));
  console.log(`Valid SOP format: ${valid.length}\n`);

  const families = new Set();
  valid.forEach(s => families.add(stripVersion(s.identifier)));
  console.log(`Unique families: ${families.size}\n`);

  // Show all families
  console.log('All valid families:');
  Array.from(families).sort().forEach((f, i) => {
    const records = valid.filter(s => stripVersion(s.identifier) === f);
    const statuses = records.map(r => `${r.identifier}(${r.status})`).join(', ');
    console.log(`  ${(i+1).toString().padStart(2, ' ')}. ${f}: ${statuses}`);
  });

  // Status breakdown
  console.log('\nStatus breakdown:');
  const byStatus = new Map();
  valid.forEach(s => {
    byStatus.set(s.status, (byStatus.get(s.status) || 0) + 1);
  });
  Array.from(byStatus.entries()).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  // Video status breakdown - check for both Brief and Explainer videos
  console.log('\n=== VIDEO STATUS ===\n');

  const videoCollection = db.collection('trainingvideos');

  // First, count SOPs with both Brief and Explainer videos
  const sopCodesWithBothVideos = new Set();
  const allVideos = await videoCollection.find({ active: true }).toArray();

  const videosBySopCode = new Map();
  allVideos.forEach(v => {
    const baseCode = String(v.sopNo || '').toUpperCase().replace(/-\d+$/, '').trim();
    if (!videosBySopCode.has(baseCode)) {
      videosBySopCode.set(baseCode, []);
    }
    videosBySopCode.get(baseCode).push(v.videoKind);
  });

  videosBySopCode.forEach((kinds, code) => {
    const hasBrief = kinds.includes('brief');
    const hasExplainer = kinds.includes('explainer');
    if (hasBrief && hasExplainer) {
      sopCodesWithBothVideos.add(code);
    }
  });

  // SOP-wise video status count (similar to slide count)
  const uniqueFamilies = Array.from(families);
  const videoStatusCounts = {
    found: 0,
    notFound: 0
  };

  uniqueFamilies.forEach(family => {
    if (sopCodesWithBothVideos.has(family)) {
      videoStatusCounts.found++;
    } else {
      videoStatusCounts.notFound++;
    }
  });

  // Calculate expected videos based on SOP language types
  let expectedVideos = 0;
  uniqueFamilies.forEach(family => {
    const videosForFamily = allVideos.filter(v => {
      const baseCode = String(v.sopNo || '').toUpperCase().replace(/-\d+$/, '').trim();
      return baseCode === family;
    });
    const languages = new Set(videosForFamily.map(v => v.language || 'English'));
    // Dual language = 4 videos (brief + explainer in each language), single = 2
    expectedVideos += languages.size > 1 ? 4 : 2;
  });

  // Video count metric (Found / Expected)
  console.log(`Videos ${videoStatusCounts.found} / ${expectedVideos}`);

  // SOP-wise breakdown
  console.log('\nSOP-wise Video Status:');
  console.log(`  \x1b[32m✓ Found (with both videos): ${videoStatusCounts.found}\x1b[0m`);
  console.log(`  \x1b[31m✗ Not Found (missing videos): ${videoStatusCounts.notFound}\x1b[0m`);
  console.log(`  Total SOPs checked: ${uniqueFamilies.length}`);

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
