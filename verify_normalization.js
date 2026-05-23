const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';

const trainingVideoSchema = new mongoose.Schema({}, { strict: false });
const TrainingVideo = mongoose.model('TrainingVideo', trainingVideoSchema, 'trainingvideos');

// Same normalization logic as in the updated stats route
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

async function verify() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Atlas\n');

    const videos = await TrainingVideo.find({ active: true }).lean();
    const sopVideoKinds = new Map();

    console.log('=== Processing Videos ===\n');

    videos.forEach((v, i) => {
      const title = String(v.title || '').toUpperCase();

      // Skip Gujarati versions
      if (title.includes('_GUJ')) {
        console.log(`[${i + 1}] SKIPPED (Gujarati): "${v.title}"`);
        return;
      }

      let sopCode = String(v.sopNo || '').toUpperCase().trim();
      if (!sopCode && v.title) {
        const titleMatch = v.title.match(/^([A-Z]{2,6}\d{1,4}-\d{1,3})/i);
        if (titleMatch) {
          sopCode = titleMatch[1].toUpperCase();
        }
      }

      const baseCode = normalizeSopCode(sopCode);

      let videoKind = String(v.videoKind || '').trim().toLowerCase();
      if (!videoKind && v.title) {
        if (v.title.toLowerCase().includes('brief')) {
          videoKind = 'brief';
        } else if (v.title.toLowerCase().includes('explainer')) {
          videoKind = 'explainer';
        }
      }

      console.log(`[${i + 1}] "${v.title}"`);
      console.log(`    sopNo: "${v.sopNo}" | normalized: "${baseCode}" | kind: "${videoKind}"`);

      if (baseCode && videoKind) {
        if (!sopVideoKinds.has(baseCode)) {
          sopVideoKinds.set(baseCode, new Set());
        }
        sopVideoKinds.get(baseCode).add(videoKind);
      }
      console.log('');
    });

    console.log('\n=== Final Counts ===\n');
    const sopsWithBrief = Array.from(sopVideoKinds.entries()).filter(([_, kinds]) => kinds.has('brief')).length;
    const sopsWithExplainer = Array.from(sopVideoKinds.entries()).filter(([_, kinds]) => kinds.has('explainer')).length;
    const sopsWithBoth = Array.from(sopVideoKinds.entries()).filter(([_, kinds]) => kinds.has('brief') && kinds.has('explainer')).length;

    console.log(`SOPs with Brief videos: ${sopsWithBrief}`);
    Array.from(sopVideoKinds.entries())
      .filter(([_, kinds]) => kinds.has('brief'))
      .forEach(([code]) => console.log(`  - ${code}`));

    console.log(`\nSOPs with Explainer videos: ${sopsWithExplainer}`);
    Array.from(sopVideoKinds.entries())
      .filter(([_, kinds]) => kinds.has('explainer'))
      .forEach(([code]) => console.log(`  - ${code}`));

    console.log(`\nSOPs with BOTH videos: ${sopsWithBoth}`);
    Array.from(sopVideoKinds.entries())
      .filter(([_, kinds]) => kinds.has('brief') && kinds.has('explainer'))
      .forEach(([code]) => console.log(`  - ${code}`));

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verify();
