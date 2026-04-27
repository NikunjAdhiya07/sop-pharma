const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const ids = ['QAGE129', 'QAGE13', 'QAGE130', 'QAGE131', 'QAGE132'];
  console.log(`Searching for ${ids.join(', ')} in database...`);

  for (const id of ids) {
    const sops = await db.collection('sops').find({
      identifier: { $regex: new RegExp(id, 'i') }
    }).toArray();

    console.log(`\nSOP: ${id}`);
    if (sops.length === 0) {
      console.log('  No matching SOPs found in sops collection.');
    }
    for (const s of sops) {
      console.log(`  - ID: ${s.identifier} | reviewDate: ${s.reviewDate || 'NULL'} | expiryDate: ${s.expiryDate || 'NULL'}`);
    }
  }

  await client.close();
}

main().catch(console.error);
