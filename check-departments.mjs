// Quick script to check actual department names in database
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sop-pharma';

async function checkDepartments() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const SOP = mongoose.connection.collection('sops');
    
    // Get all unique department names
    const departments = await SOP.distinct('department');
    
    console.log('📊 Unique Department Names in Database:');
    console.log('=====================================');
    departments.forEach((dept, idx) => {
      console.log(`${idx + 1}. "${dept}"`);
    });
    
    console.log('\n📝 Sample SOPs per department:');
    console.log('==============================');
    for (const dept of departments) {
      const sample = await SOP.findOne({ department: dept });
      if (sample) {
        console.log(`\n${dept}:`);
        console.log(`  - ${sample.identifier} - ${sample.name}`);
      }
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDepartments();
