const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function runAg() {
  await mongoose.connect(process.env.MONGODB_URI);
  const SOPGuideline = mongoose.connection.collection('sopguidelines');
  const ag = await SOPGuideline.aggregate([
      {
        $group: {
          _id: '$folderName',
          guidelineCount: { $sum: 1 }
        },
      }
  ]).toArray();
  console.log(ag);
  process.exit(0);
}
runAg();
