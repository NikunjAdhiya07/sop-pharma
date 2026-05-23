const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sop';

const trainingVideoSchema = new mongoose.Schema({}, { strict: false });
const TrainingVideo = mongoose.model('TrainingVideo', trainingVideoSchema);

async function debug() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // First check all videos regardless of active status
    const allVideos = await TrainingVideo.find({}).lean();
    console.log(`\nTotal videos (any status): ${allVideos.length}`);

    const activeVideos = await TrainingVideo.find({ active: true }).lean();
    console.log(`Total videos with active: true: ${activeVideos.length}\n`);

    if (allVideos.length > 0) {
      console.log('First 5 videos (all):');
      allVideos.slice(0, 5).forEach((v, i) => {
        console.log(`\n[${i + 1}]`);
        console.log(`  sopNo: ${v.sopNo}`);
        console.log(`  title: ${v.title}`);
        console.log(`  videoKind: ${v.videoKind}`);
        console.log(`  active: ${v.active}`);
        console.log(`  _id: ${v._id}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debug();
