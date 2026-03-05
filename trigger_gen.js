const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/soppharma');
  const db = mongoose.connection.db;
  const bank = await db.collection('mcqbanks').findOne({ totalQuestions: { $lt: 100 } });
  
  if (!bank) {
    console.log('No banks < 100');
    return;
  }
  
  console.log(`Bank ID: ${bank._id}, SOP ID: ${bank.sopId}`);
  
  const res = await fetch('http://localhost:3000/api/mcq-bank/generate-more', {
    method: 'POST',
    body: JSON.stringify({ bankId: bank._id, sopId: bank.sopId }),
    headers: { 'Content-Type': 'application/json' }
  });
  
  const data = await res.json();
  console.log(data);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
