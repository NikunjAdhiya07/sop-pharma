import connectDB from '../src/lib/mongodb';
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

async function resetFailedSOPs() {
  try {
    await connectDB();
    console.log('🔄 Resetting failed SOPs to allow reprocessing...\n');

    for (const identifier of failedFiles) {
      const sop = await SOP.findOne({ 
        identifier: { $regex: new RegExp(`^${identifier}`, 'i') }
      });

      if (!sop) {
        console.log(`⚠️  ${identifier}: Not found in database`);
        continue;
      }

      // Reset status to allow reprocessing
      sop.status = 'uploaded';
      sop.mcqCount = 0;
      await sop.save();

      console.log(`✅ ${identifier}: Reset to 'uploaded' status`);
    }

    console.log('\n✅ All failed SOPs have been reset!');
    console.log('\n📝 Next steps:');
    console.log('1. Go to your bulk processing page');
    console.log('2. Process these files again');
    console.log('3. Watch the console for partial MCQ saves');
    console.log('4. Check http://localhost:3000/api/check-saved-mcqs to verify');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetFailedSOPs();
