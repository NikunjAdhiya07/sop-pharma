const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sop';

const sopLibrarySchema = new mongoose.Schema({}, { strict: false });
const SOPLibrary = mongoose.model('SOPLibrary', sopLibrarySchema, 'soplibraries');

async function debug() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const count = await SOPLibrary.countDocuments({});
    console.log(`Total SOPLibrary documents: ${count}`);

    if (count > 0) {
      const sample = await SOPLibrary.find({}).limit(1).lean();
      if (sample.length > 0) {
        const doc = sample[0];
        console.log('\nFirst SOPLibrary document structure:');
        console.log(`  sopIdentifier: ${doc.sopIdentifier}`);
        console.log(`  sopName: ${doc.sopName}`);
        console.log(`  department: ${doc.department}`);
        console.log(`  videos: ${JSON.stringify(doc.videos, null, 2)}`);
        console.log(`  slides: ${JSON.stringify(doc.slides, null, 2)}`);
        console.log(`  Has videos field: ${!!doc.videos}`);
        console.log(`  Videos type: ${Array.isArray(doc.videos) ? 'array' : typeof doc.videos}`);
        if (Array.isArray(doc.videos)) {
          console.log(`  Videos count: ${doc.videos.length}`);
          if (doc.videos.length > 0) {
            console.log(`  First video: ${JSON.stringify(doc.videos[0])}`);
          }
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debug();
