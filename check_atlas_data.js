const mongoose = require('mongoose');

// Use the same connection string as the app
const mongoUri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

const trainingVideoSchema = new mongoose.Schema({}, { strict: false });
const TrainingVideo = mongoose.model('TrainingVideo', trainingVideoSchema, 'trainingvideos');

async function debug() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Atlas');

    const videos = await TrainingVideo.find({ active: true }).lean();
    console.log(`\nTotal active videos: ${videos.length}`);

    if (videos.length > 0) {
      console.log('\n=== All Active Videos ===\n');
      const briefVideos = [];
      const explainerVideos = [];
      const sopCodes = new Set();

      videos.forEach((v, i) => {
        const sopNo = v.sopNo ? String(v.sopNo).toUpperCase().trim() : '';
        const title = v.title || '';
        const videoKind = v.videoKind || '';

        // Extract from title
        let titleMatch = '';
        let titleKind = '';
        if (title) {
          const m = title.match(/^([A-Z]{2,6}\d{1,4}-\d{1,3})/i);
          if (m) titleMatch = m[1].toUpperCase();

          if (title.toLowerCase().includes('brief')) {
            titleKind = 'brief';
            briefVideos.push({ sopNo, title });
          } else if (title.toLowerCase().includes('explainer')) {
            titleKind = 'explainer';
            explainerVideos.push({ sopNo, title });
          }
        }

        const baseCode = (sopNo || titleMatch).replace(/-\d+$/, '').trim();
        sopCodes.add(baseCode);

        console.log(`[${i + 1}] Title: "${title}"`);
        console.log(`    sopNo: "${sopNo}" | videoKind: "${videoKind}" | baseCode: "${baseCode}"`);
        console.log('');
      });

      console.log(`\n=== Summary ===`);
      console.log(`Total videos: ${videos.length}`);
      console.log(`Brief videos: ${briefVideos.length}`);
      briefVideos.forEach(v => console.log(`  - ${v.title}`));

      console.log(`Explainer videos: ${explainerVideos.length}`);
      explainerVideos.forEach(v => console.log(`  - ${v.title}`));

      console.log(`\nUnique SOP base codes: ${sopCodes.size}`);
      Array.from(sopCodes).sort().forEach(code => console.log(`  - ${code}`));
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

debug();
