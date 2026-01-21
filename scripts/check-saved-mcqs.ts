// Script to check which MCQs were actually saved for the failed files
// Run this with: npx tsx scripts/check-saved-mcqs.ts

import connectDB from '../src/lib/mongodb';
import MCQBank from '../src/models/MCQBank';
import SOP from '../src/models/SOP';

const failedFiles = [
  'QAMI43-04',
  'QAMI45-02',
  'QAMI46-02',
  'QAMI47-03',
  'QAMI48-02',
  'QAMI49-02',
  'QAMI53-02',
  'QAMI54-02',
  'QAMI55-02',
];

async function checkSavedMCQs() {
  try {
    await connectDB();
    console.log('🔍 Checking database for saved MCQs...\n');

    for (const identifier of failedFiles) {
      // Find SOP
      const sop = await SOP.findOne({ 
        identifier: { $regex: new RegExp(`^${identifier}`, 'i') }
      });

      if (!sop) {
        console.log(`❌ ${identifier}: SOP not found in database`);
        continue;
      }

      // Find MCQ Bank
      const mcqBank = await MCQBank.findOne({ sopId: sop._id });

      if (!mcqBank) {
        console.log(`❌ ${identifier}: No MCQ bank found`);
        console.log(`   SOP Status: ${sop.status}`);
        console.log(`   SOP MCQ Count: ${sop.mcqCount}`);
      } else {
        const mcqCount = mcqBank.mcqs.length;
        if (mcqCount === 0) {
          console.log(`⚠️  ${identifier}: MCQ bank exists but has 0 MCQs`);
        } else if (mcqCount < 100) {
          console.log(`✅ ${identifier}: ${mcqCount} MCQs saved (partial success!)`);
        } else {
          console.log(`🎉 ${identifier}: ${mcqCount} MCQs saved (complete success!)`);
        }
        console.log(`   Distribution: Easy=${mcqBank.difficultyDistribution.easy}, Medium=${mcqBank.difficultyDistribution.medium}, Hard=${mcqBank.difficultyDistribution.hard}`);
      }
      console.log('');
    }

    console.log('\n📊 Summary:');
    const allMCQBanks = await MCQBank.find({
      sopIdentifier: { $in: failedFiles.map(f => new RegExp(`^${f}`, 'i')) }
    });

    console.log(`Total MCQ banks found: ${allMCQBanks.length}`);
    console.log(`Total MCQs saved: ${allMCQBanks.reduce((sum, bank) => sum + bank.mcqs.length, 0)}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSavedMCQs();
