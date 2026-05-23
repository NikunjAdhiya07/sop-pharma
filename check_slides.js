const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

const trainingSlideSchema = new mongoose.Schema({}, { strict: false });
const TrainingSlide = mongoose.model('TrainingSlide', trainingSlideSchema, 'trainingslides');

async function check() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Atlas\n');

    const slides = await TrainingSlide.find({ active: true }).lean();
    console.log(`Total active slides: ${slides.length}\n`);

    const slidesBySop = new Map();
    slides.forEach((s, i) => {
      const sopNo = String(s.sopNo || '').toUpperCase().trim();
      const baseCode = sopNo.replace(/-\d+$/, '').trim();

      if (!slidesBySop.has(baseCode)) {
        slidesBySop.set(baseCode, []);
      }
      slidesBySop.get(baseCode).push(s.title || 'Untitled');

      console.log(`[${i + 1}] sopNo: "${sopNo}" | baseCode: "${baseCode}" | title: "${s.title}"`);
    });

    console.log('\n=== SOPs with Slides ===');
    slidesBySop.forEach((titles, code) => {
      console.log(`${code}: ${titles.length} slides`);
      titles.forEach(t => console.log(`  - ${t}`));
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

check();
