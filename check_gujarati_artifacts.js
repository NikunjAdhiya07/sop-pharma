const mongoose = require('mongoose');

async function checkArtifacts() {
  try {
    const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
    await mongoose.connect(uri);
    
    const db = mongoose.connection.db;
    const artifacts = db.collection('sopversionartifacts');
    
    // Find all MAGE0X artifacts
    const docs = await artifacts.find({
      identifier: { $regex: /^MAGE0[1246,8]/ }
    }).toArray();
    
    console.log(`\n📊 Found ${docs.length} SOPVersionArtifacts for MAGE SOPs:\n`);
    
    for (const doc of docs.sort((a, b) => a.identifier.localeCompare(b.identifier))) {
      console.log(`SOP: ${doc.identifier}`);
      console.log(`  Language: ${doc.language || 'undefined'}`);
      console.log(`  Entries: ${doc.entries.length}`);
      console.log(`  Versions: ${doc.entries.map(e => e.version).join(', ')}`);
      console.log(`  Paths sample: ${doc.entries[0]?.docxPath || doc.entries[0]?.pdfPath || 'none'}`);
      console.log('');
    }
    
    // Count by language
    const byLang = await artifacts.aggregate([
      { $match: { identifier: { $regex: /^MAGE0[1246,8]/ } } },
      { $group: { _id: '$language', count: { $sum: 1 }, identifiers: { $push: '$identifier' } } }
    ]).toArray();
    
    console.log('📈 By Language:');
    for (const item of byLang) {
      console.log(`  ${item._id || 'UNDEFINED'}: ${item.count} - ${item.identifiers.join(', ')}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkArtifacts();
