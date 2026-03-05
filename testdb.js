require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const banks = await db.collection('mcqbanks').find({ sopIdentifier: /QAGE/ }).toArray();
  for (const b of banks) {
    console.log(b.sopIdentifier, " | mcqs array length:", b.mcqs?.length, " | totalQuestions:", b.totalQuestions);
  }
  process.exit();
}
test();
