// Script to drop the unique index on SOP identifier field
// This allows multiple uploads of the same SOP

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function dropUniqueIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('sops');

    console.log('📋 Listing current indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Drop the unique index on identifier
    try {
      console.log('🗑️ Dropping unique index on identifier...');
      await collection.dropIndex('identifier_1');
      console.log('✅ Successfully dropped unique index on identifier');
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️ Index already dropped or does not exist');
      } else {
        throw error;
      }
    }

    console.log('📋 Listing indexes after drop...');
    const indexesAfter = await collection.indexes();
    console.log('Indexes after drop:', JSON.stringify(indexesAfter, null, 2));

    console.log('✅ Index cleanup complete!');
    console.log('🎉 You can now upload the same SOP multiple times!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

dropUniqueIndex();
