const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sop';

const trainingVideoSchema = new mongoose.Schema({}, { strict: false });
const TrainingVideo = mongoose.model('TrainingVideo', trainingVideoSchema);

async function debug() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const videos = await TrainingVideo.find({ active: true }).lean();
    console.log(`\nTotal active videos: ${videos.length}\n`);

    videos.forEach((v, i) => {
      const sopNo = v.sopNo ? String(v.sopNo).toUpperCase().trim() : '';
      const title = v.title || '';
      const videoKind = v.videoKind || '';

      // Extract SOP code from title
      let titleSopCode = '';
      if (title) {
        const match = title.match(/^([A-Z]{2,6}\d{1,4}-\d{1,3})/i);
        if (match) {
          titleSopCode = match[1].toUpperCase();
        }
      }

      // Extract video kind from title
      let titleVideoKind = '';
      if (title.toLowerCase().includes('brief')) {
        titleVideoKind = 'brief';
      } else if (title.toLowerCase().includes('explainer')) {
        titleVideoKind = 'explainer';
      }

      const baseCode = sopNo ? sopNo.replace(/-\d+$/, '') : titleSopCode.replace(/-\d+$/, '');

      console.log(`[${i + 1}] sopNo: "${sopNo}" | title: "${title}"`);
      console.log(`    titleSopCode: "${titleSopCode}" | titleVideoKind: "${titleVideoKind}"`);
      console.log(`    videoKind: "${videoKind}" | baseCode: "${baseCode}"`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debug();
