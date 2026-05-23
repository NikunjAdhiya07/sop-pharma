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

  console.log('=== IDENTIFYING MISSING STORE SOP FAMILY ===\n');

  // Get all valid, non-obsolete Store SOPs
  const storeSops = await db.collection('sops').find({
    department: { $regex: 'Store', $options: 'i' },
    isObsolete: { $ne: true }
  }).toArray();
  
  const validSops = storeSops.filter(s => isStandardRegistrySopNumber(s.identifier));
  
  // Build family map
  const familyMap = new Map();
  validSops.forEach(s => {
    const base = s.identifier.toUpperCase().replace(/-\d+$/, '');
    if (!familyMap.has(base)) {
      familyMap.set(base, {
        family: base,
        versions: [],
        highest: { identifier: '', revision: -1 },
        _ids: [],
        status: s.status,
        pipelineStatus: s.pipelineStatus
      });
    }
    const entry = familyMap.get(base);
    const rev = parseInt(s.identifier.match(/-(\d+)$/)[1], 10);
    entry.versions.push(s.identifier);
    entry._ids.push(s._id.toString());
    if (rev > entry.highest.revision) {
      entry.highest = { identifier: s.identifier, revision: rev };
    }
  });

  // Get unique families (highest revision per family)
  const families = Array.from(familyMap.values()).sort((a, b) => a.family.localeCompare(b.family));

  console.log(`📊 ALL 43 STORE SOP FAMILIES (deduplicated by highest revision):\n`);
  families.forEach((f, i) => {
    const versionNote = f.versions.length > 1 ? ` [${f.versions.length} versions]` : '';
    const statusNote = f.status !== 'completed' ? ` {status: ${f.status}}` : '';
    const pipelineNote = f.pipelineStatus && f.pipelineStatus !== 'idle' ? ` {pipeline: ${f.pipelineStatus}}` : '';
    console.log(`${(i+1).toString().padStart(2, ' ')}. ${f.highest.identifier}${versionNote}${statusNote}${pipelineNote}`);
  });

  console.log(`\n📋 Expected in registry display: 42 SOPs`);
  console.log(`📋 Actual in database: 43 families`);
  console.log(`\n⚠️  To find the missing SOP:`);
  console.log(`1. Check your dashboard SOP registry display`);
  console.log(`2. Verify all 43 families above are listed`);
  console.log(`3. The one family NOT in the display is the missing SOP\n`);

  // Check for status or pipeline issues that might cause filtering
  const nonCompleted = families.filter(f => f.status !== 'completed');
  const nonIdle = families.filter(f => f.pipelineStatus && f.pipelineStatus !== 'idle');
  
  if (nonCompleted.length > 0) {
    console.log(`⚠️  SOPs with non-completed status:\n`);
    nonCompleted.forEach(f => {
      console.log(`  ${f.highest.identifier}: status = ${f.status}`);
    });
  }
  
  if (nonIdle.length > 0) {
    console.log(`\n⚠️  SOPs with non-idle pipeline status:\n`);
    nonIdle.forEach(f => {
      console.log(`  ${f.highest.identifier}: pipeline = ${f.pipelineStatus}`);
    });
  }

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
