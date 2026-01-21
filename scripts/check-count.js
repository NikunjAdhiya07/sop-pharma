const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ MONGODB_URI not found in .env.local');
  process.exit(1);
}

// Define simple schemas just for the check
const SOPSchema = new mongoose.Schema({
  name: String,
  identifier: String,
  status: String,
  mcqCount: Number
}, { collection: 'sops' });

const MCQBankSchema = new mongoose.Schema({
  sopId: mongoose.Schema.Types.ObjectId,
  sopIdentifier: String,
  mcqs: Array,
  totalQuestions: Number,
  difficultyDistribution: Object
}, { collection: 'mcqbanks' });

const SOPModel = mongoose.models.SOP || mongoose.model('SOP', SOPSchema);
const MCQBankModel = mongoose.models.MCQBank || mongoose.model('MCQBank', MCQBankSchema);

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully\n');

    const identifier = 'QAGE37-05';
    console.log(`🔍 Checking database for SOP: ${identifier}\n`);

    const sop = await SOPModel.findOne({ identifier: new RegExp(identifier, 'i') });

    if (!sop) {
      console.log('❌ SOP not found');
      // Try finding by name if identifier fails
      const sopByName = await SOPModel.findOne({ name: /Reverse Laminar Air Flow/i });
      if (sopByName) {
          console.log(`✅ SOP Found by name: ${sopByName.name}`);
          return checkBank(sopByName);
      }
      process.exit(0);
    }

    await checkBank(sop);
    process.exit(0);
  } catch (err) {
    console.error('Error during execution:', err);
    process.exit(1);
  }
}

async function checkBank(sop) {
    console.log(`SOP: ${sop.name}`);
    console.log(`Identifier: ${sop.identifier}`);
    console.log(`Status: ${sop.status}`);
    console.log(`SOP.mcqCount (metadata): ${sop.mcqCount}`);

    const bank = await MCQBankModel.findOne({ sopId: sop._id });
    if (bank) {
      console.log(`✅ MCQ Bank Found!`);
      console.log(`   Actual questions in array: ${bank.mcqs.length}`);
      console.log(`   Internal totalQuestions count: ${bank.totalQuestions}`);
      console.log(`   Distribution:`, JSON.stringify(bank.difficultyDistribution));
      
      if (bank.mcqs.length > 0) {
          console.log(`   Sample question: ${bank.mcqs[bank.mcqs.length-1].question.substring(0, 50)}...`);
      }
    } else {
      console.log('❌ No MCQ bank found for this SOP');
    }
}

run();
