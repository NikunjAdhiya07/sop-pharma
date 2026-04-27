const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const id = 'QAGE100';
  console.log(`Searching for ${id} in MasterSOPRepository...`);

  const masters = await db.collection('mastersoprepositories').find({
    $or: [
      { sopIdentifier: { $regex: new RegExp(id, 'i') } },
      { identifier: { $regex: new RegExp(id, 'i') } }
    ]
  }).toArray();

  if (masters.length === 0) {
    console.log('  No matching entries found in mastersoprepositories.');
  }
  for (const m of masters) {
    console.log(`  - ID: ${m.sopIdentifier || m.identifier} | reviewDate: ${m.metadata?.reviewDate || 'NULL'} | expiryDate: ${m.metadata?.expiryDate || 'NULL'}`);
  }

  await client.close();
}

main().catch(console.error);
