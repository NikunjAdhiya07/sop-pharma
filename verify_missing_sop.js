const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('=== FINDING THE MISSING STORE SOP ===\n');

  // Check the two candidates with non-completed status
  const candidates = await db.collection('sops').find({
    identifier: { $in: ['BSGE01-05', 'STGE12-00'] }
  }).toArray();

  console.log('Candidates with non-completed status:\n');
  candidates.forEach(s => {
    console.log(`${s.identifier}:`);
    console.log(`  Department: ${s.department}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Is Obsolete: ${s.isObsolete}`);
    console.log(`  Name: ${s.name}`);
    console.log(`  Uploaded: ${s.uploadedAt}`);
    console.log();
  });

  // The dashboard filters by status: 'completed'
  // So the SOP with non-completed status is the missing one
  const incompleteStatus = candidates.filter(s => s.status !== 'completed');
  
  if (incompleteStatus.length > 0) {
    console.log('❌ MISSING SOP(S) - Filtered out by status check:\n');
    incompleteStatus.forEach(s => {
      console.log(`✗ ${s.identifier}: Status is "${s.status}" (not "completed")`);
      console.log(`  → This SOP is EXCLUDED from the registry display\n`);
    });
    
    console.log('\n💡 SOLUTION:');
    incompleteStatus.forEach(s => {
      console.log(`Update ${s.identifier}: set status to "completed"`);
    });
  } else {
    console.log('✓ Both candidates have "completed" status');
  }

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
