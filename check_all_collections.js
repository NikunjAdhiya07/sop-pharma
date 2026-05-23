const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sop';

async function debug() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    const collections = await mongoose.connection.db.listCollections().toArray();

    for (const colInfo of collections) {
      const col = mongoose.connection.db.collection(colInfo.name);
      const count = await col.countDocuments({});
      console.log(`${colInfo.name}: ${count} documents`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debug();
