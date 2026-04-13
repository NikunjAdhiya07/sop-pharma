/**
 * Direct MongoDB test to verify MCQ statistics data structure
 */

const mongoose = require('mongoose');

// Connection string - update if needed
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://vedant:sop123@sop-pharma.2f9hl.mongodb.net/?retryWrites=true&w=majority&appName=sop-pharma';

async function testMCQStats() {
  try {
    console.log('Connecting to MongoDB...\n');

    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get collection stats
    const db = mongoose.connection.db;

    // Check MCQBank collection
    const mcqBankCollection = db.collection('mcqbanks');
    const mcqReviewCollection = db.collection('mcqreviews');

    const mcqBankCount = await mcqBankCollection.countDocuments();
    const mcqReviewCount = await mcqReviewCollection.countDocuments();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('              MCQ DATA VERIFICATION REPORT                  ');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('DATABASE COLLECTIONS:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`  MCQBank records:         ${mcqBankCount}`);
    console.log(`  MCQReview records:       ${mcqReviewCount}`);
    console.log();

    if (mcqBankCount > 0) {
      // Get department breakdown
      const deptBreakdown = await mcqBankCollection.aggregate([
        {
          $group: {
            _id: '$department',
            count: { $sum: 1 },
            totalQuestions: { $sum: '$totalQuestions' },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray();

      console.log('MCQ BANK BY DEPARTMENT:');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`${'Department'.padEnd(25)} | ${'SOPs'.padEnd(6)} | ${'Total Questions'.padEnd(16)}`);
      console.log('─────────────────────────────────────────────────────────────');

      deptBreakdown.forEach((dept) => {
        const name = (dept._id || 'Unknown').padEnd(25);
        const count = dept.count.toString().padEnd(6);
        const questions = dept.totalQuestions.toString().padEnd(16);
        console.log(`${name} | ${count} | ${questions}`);
      });
      console.log();
    }

    if (mcqReviewCount > 0) {
      // Get review status breakdown
      const reviewBreakdown = await mcqReviewCollection.aggregate([
        {
          $group: {
            _id: '$reviewStatus',
            count: { $sum: 1 },
          },
        },
      ]).toArray();

      console.log('MCQ REVIEW STATUS BREAKDOWN:');
      console.log('─────────────────────────────────────────────────────────────');
      const reviewMap = {};
      reviewBreakdown.forEach((item) => {
        reviewMap[item._id || 'unknown'] = item.count;
      });

      const pending = reviewMap['pending'] || 0;
      const done = reviewMap['done'] || 0;

      console.log(`  Pending Review:          ${pending}`);
      console.log(`  Completed Review:        ${done}`);
      console.log(`  Total:                   ${pending + done}`);
      console.log();

      // Calculate overall percentage
      const total = pending + done;
      const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

      console.log('OVERALL STATISTICS:');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`  Total Questions Reviewed: ${done}/${total} (${percentage}%)`);
      console.log();

      // Visual progress bar
      const barLength = 40;
      const filledLength = Math.round((percentage / 100) * barLength);
      const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
      console.log(`  Progress: [${progressBar}] ${percentage}%`);
    } else {
      console.log('⚠ No MCQ reviews found in database yet');
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Show sample MCQBank document
    if (mcqBankCount > 0) {
      const sample = await mcqBankCollection.findOne();
      console.log('SAMPLE MCQBank DOCUMENT STRUCTURE:');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(JSON.stringify(sample, null, 2).substring(0, 500) + '...');
    }

    await mongoose.disconnect();
    console.log('\n✓ Test completed successfully');
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}

testMCQStats();
