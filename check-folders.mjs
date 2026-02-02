// Quick database check script
// Run this with: node --loader ts-node/esm check-folders.mjs

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sop-pharma';

async function checkFolders() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const MCQBank = mongoose.connection.collection('mcqbanks');
    
    // Count organized vs unorganized
    const organized = await MCQBank.countDocuments({
      folderDepartment: { $exists: true, $ne: null },
      folderSubcategory: { $exists: true, $ne: null }
    });
    
    const unorganized = await MCQBank.countDocuments({
      $or: [
        { folderDepartment: { $exists: false } },
        { folderDepartment: null },
        { folderSubcategory: { $exists: false } },
        { folderSubcategory: null }
      ]
    });
    
    console.log(`\n📊 Database Status:`);
    console.log(`✅ Organized: ${organized}`);
    console.log(`⚠️ Unorganized: ${unorganized}`);
    console.log(`📝 Total: ${organized + unorganized}`);
    
    // Show a few samples
    console.log(`\n📝 Sample organized banks:`);
    const samples = await MCQBank.find({
      folderDepartment: { $exists: true, $ne: null }
    }).limit(5).toArray();
    
    samples.forEach(bank => {
      console.log(`  - ${bank.sopIdentifier}: ${bank.folderDepartment}/${bank.folderSubcategory}`);
    });
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkFolders();
