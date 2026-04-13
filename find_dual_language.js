const mongoose = require('mongoose');

async function findDualLanguage() {
  try {
    const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
    await mongoose.connect(uri);
    
    const db = mongoose.connection.db;
    const sops = db.collection('sops');
    
    // Find SOPs that have BOTH English and Gujarati versions with the SAME identifier
    const pipeline = [
      { $group: { 
        _id: '$identifier', 
        languages: { $push: '$language' },
        count: { $sum: 1 },
        names: { $push: '$name' }
      }},
      { $match: { count: { $gte: 2 }, languages: { $all: ['English', 'Gujarati'] } } },
      { $limit: 10 }
    ];
    
    const results = await sops.aggregate(pipeline).toArray();
    
    console.log('\n✅ SOPs with BOTH English & Gujarati (same identifier):\n');
    for (const r of results) {
      console.log(`  ${r._id}: ${r.count} records`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

findDualLanguage();
