import connectDB from './src/lib/mongodb';
import SOP from './src/models/SOP';
import SOPLibrary from './src/models/SOPLibrary';

async function debugSync() {
  await connectDB();
  const allSops = await SOP.find({}).countDocuments();
  const completedSops = await SOP.find({ status: 'completed' }).countDocuments();
  const libEntries = await SOPLibrary.find({}).countDocuments();
  
  console.log('Total SOPs in DB:', allSops);
  console.log('Completed SOPs in DB:', completedSops);
  console.log('SOP Library entries:', libEntries);
  
  if (completedSops > 0) {
    const oneSop = await SOP.findOne({ status: 'completed' }).lean();
    console.log('Sample Completed SOP:', JSON.stringify(oneSop, null, 2));
  }
}

debugSync().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
