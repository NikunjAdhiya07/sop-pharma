const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const SOPGuideline = mongoose.connection.collection('sopguidelines');
  const count = await SOPGuideline.countDocuments();
  console.log('SOPGuideline count:', count);
  
  const Guideline = mongoose.connection.collection('guidelines');
  const gdCount = await Guideline.countDocuments();
  console.log('Guideline count:', gdCount);
  process.exit(0);
}

check();
