import connectDB from './src/lib/mongodb';
import MCQBank from './src/models/MCQBank';

async function diagnose() {
  await connectDB();
  const bank = await MCQBank.findOne({ sopIdentifier: 'QAGE133-01' });
  if (!bank) {
    console.log('Bank not found');
    return;
  }
  console.log('Bank:', bank.sopIdentifier);
  console.log('Total Questions:', bank.mcqs.length);
  bank.mcqs.forEach((mcq, i) => {
    if (i < 5) {
      console.log(`Q${i+1}: isChecked=${mcq.isChecked}, isReviewed=${mcq.isReviewed}`);
    }
  });
  process.exit(0);
}

diagnose();
