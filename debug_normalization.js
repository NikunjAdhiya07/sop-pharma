const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

const trainingSlideSchema = new mongoose.Schema({}, { strict: false });
const trainingVideoSchema = new mongoose.Schema({}, { strict: false });
const TrainingSlide = mongoose.model('TrainingSlide', trainingSlideSchema, 'trainingslides');
const TrainingVideo = mongoose.model('TrainingVideo', trainingVideoSchema, 'trainingvideos');

const normalizeSopCode = (code) => {
  if (!code) return '';
  const match = code.match(/^([A-Z]{2,6})(\d{1,2})(-\d+)?$/i);
  if (match) {
    const prefix = match[1].toUpperCase();
    const num = match[2].padStart(2, '0');
    return prefix + num;
  }
  return code.replace(/-\d+$/, '').trim().toUpperCase();
};

async function debug() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Atlas\n');

    const slides = await TrainingSlide.find({ active: true }).lean();
    const videos = await TrainingVideo.find({ active: true }).lean();

    console.log('=== SLIDES ===');
    const sopsWithSlidesSet = new Set();
    slides.forEach((s, i) => {
      const sopCode = String(s.sopNo || '').toUpperCase().trim();
      const normalized = normalizeSopCode(sopCode);
      console.log(`[${i + 1}] sopNo: "${s.sopNo}" → normalized: "${normalized}"`);
      if (normalized) sopsWithSlidesSet.add(normalized);
    });

    console.log(`\nSOPs with slides (set): ${Array.from(sopsWithSlidesSet).sort().join(', ')}`);

    console.log('\n=== VIDEOS ===');
    const sopsWithVideos = new Set();
    videos.forEach((v, i) => {
      const title = String(v.title || '').toUpperCase();
      if (title.includes('_GUJ')) {
        console.log(`[${i + 1}] SKIP (Gujarati): "${v.title}"`);
        return;
      }

      let sopCode = String(v.sopNo || '').toUpperCase().trim();
      if (!sopCode && v.title) {
        const match = v.title.match(/^([A-Z]{2,6}\d{1,4}-\d{1,3})/i);
        if (match) sopCode = match[1].toUpperCase();
      }

      const normalized = normalizeSopCode(sopCode);
      const hasSlides = sopsWithSlidesSet.has(normalized);
      console.log(`[${i + 1}] sopNo: "${v.sopNo}" → normalized: "${normalized}" | hasSlides: ${hasSlides}`);

      if (hasSlides && normalized) {
        sopsWithVideos.add(normalized);
      }
    });

    console.log(`\nSOPs with videos (filtered to those with slides): ${Array.from(sopsWithVideos).sort().join(', ')}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

debug();
