import connectDB from '../src/lib/mongodb';
import MCQBank from '../src/models/MCQBank';
import SOP from '../src/models/SOP';

async function checkSpecificSOP() {
  try {
    await connectDB();
    const identifier = 'QAGE37-05';
    console.log(`🔍 Checking database for SOP: ${identifier}\n`);

    const sop = await SOP.findOne({ 
      identifier: { $regex: new RegExp(`^${identifier}`, 'i') }
    });

    if (!sop) {
      console.log(`❌ SOP with identifier ${identifier} not found`);
      const allSops = await SOP.find({}).limit(10);
      console.log('Sample SOPs in DB:', allSops.map(s => s.identifier).join(', '));
      process.exit(0);
    }

    console.log(`✅ SOP Found: ${sop.name}`);
    console.log(`   Status: ${sop.status}`);
    console.log(`   SOP.mcqCount: ${sop.mcqCount}`);

    const mcqBank = await MCQBank.findOne({ sopId: sop._id });

    if (!mcqBank) {
      console.log(`❌ No MCQ bank found for this SOP`);
    } else {
      console.log(`✅ MCQ Bank Found!`);
      console.log(`   Total MCQs in Bank: ${mcqBank.mcqs.length}`);
      console.log(`   Expected Count: ${mcqBank.totalQuestions}`);
      console.log(`   Distribution:`, mcqBank.difficultyDistribution);
      
      // Look for duplicate questions just in case
      const questions = mcqBank.mcqs.map(m => m.question);
      const uniqueQuestions = new Set(questions);
      if (uniqueQuestions.size < questions.length) {
        console.log(`⚠️  Warning: ${questions.length - uniqueQuestions.size} duplicate questions found.`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSpecificSOP();
