const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://nikhil:n2PIkPgOr7sPzUDc@cluster0.pwn64.mongodb.net/sop-pharma?retryWrites=true&w=majority&appName=Cluster0';

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
      const sampleSops = await SOPModel.find({}).limit(5);
      console.log('Sample identifiers in DB:', sampleSops.map(s => s.identifier));
      process.exit(0);
    }

    console.log(`✅ SOP Found: ${sop.name}`);
    console.log(`   Status: ${sop.status}`);
    console.log(`   SOP.mcqCount (metadata): ${sop.mcqCount}`);

    const bank = await MCQBankModel.findOne({ sopId: sop._id });
    if (bank) {
      console.log(`✅ MCQ Bank Found!`);
      console.log(`   Actual questions in array: ${bank.mcqs.length}`);
      console.log(`   Internal totalQuestions count: ${bank.totalQuestions}`);
      console.log(`   Distribution:`, JSON.stringify(bank.difficultyDistribution));
    } else {
      // Try by identifier as fallback
      const bankByIdentifier = await MCQBankModel.findOne({ sopIdentifier: new RegExp(identifier, 'i') });
      if (bankByIdentifier) {
        console.log(`✅ MCQ Bank Found (by identifier)!`);
        console.log(`   Actual questions in array: ${bankByIdentifier.mcqs.length}`);
      } else {
        console.log('❌ No MCQ bank found for this SOP');
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error during execution:', err);
    process.exit(1);
  }
}

run();
