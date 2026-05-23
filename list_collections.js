const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sop';

async function debug() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\nCollections in database:`);
    collections.forEach((col, i) => {
      console.log(`  ${i + 1}. ${col.name}`);
    });

    // Check TrainingVideo specifically
    const tvCollection = mongoose.connection.db.collection('trainingvideos');
    const tvCount = await tvCollection.countDocuments({});
    console.log(`\nTraining Videos count: ${tvCount}`);

    // List first few records
    const tvSample = await tvCollection.find({}).limit(3).toArray();
    if (tvSample.length > 0) {
      console.log(`\nFirst 3 Training Video documents:`);
      tvSample.forEach((doc, i) => {
        console.log(`  [${i + 1}] ${JSON.stringify({ sopNo: doc.sopNo, title: doc.title, videoKind: doc.videoKind, active: doc.active })}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debug();
